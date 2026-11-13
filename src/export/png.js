// Streaming PNG writer. The collage is written row by row, so the picture can
// be any size: it never has to fit into one canvas (phones refuse canvases
// bigger than ~16–64 megapixels). Lossless, 8-bit RGB, full quality.
const CRC = new Int32Array(256)
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c }
function crc32(bytes, crc = -1) {
  for (let i = 0; i < bytes.length; i++) crc = CRC[(crc ^ bytes[i]) & 255] ^ (crc >>> 8)
  return crc
}
const u32 = n => new Uint8Array([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])
function chunk(type, data) {
  const t = new TextEncoder().encode(type)
  const crc = crc32(data, crc32(t)) ^ -1
  return [u32(data.length), t, data, u32(crc >>> 0)]
}

export class PngWriter {
  constructor(width, height) {
    this.w = width; this.h = height
    this.parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])]
    const ihdr = new Uint8Array(13)
    ihdr.set(u32(width), 0); ihdr.set(u32(height), 4)
    ihdr[8] = 8; ihdr[9] = 2                      // 8-bit, RGB
    this.parts.push(...chunk('IHDR', ihdr))
    this.prev = new Uint8Array(width * 3)         // previous row (for the filter)
    this.rowsDone = 0
    this.pending = []                             // compressed bytes not yet in an IDAT
    this.pendingSize = 0
  }

  async start() {
    if (typeof CompressionStream !== 'undefined') {
      const cs = new CompressionStream('deflate')   // zlib format, as PNG wants
      this.writer = cs.writable.getWriter()
      const reader = cs.readable.getReader()
      this.drained = (async () => {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          this.take(value)
        }
      })()
    } else {
      const { Zlib } = await import('fflate')
      const z = new Zlib({ level: 6 })
      z.ondata = (data) => this.take(data)
      this.writer = { ready: Promise.resolve(), write: async d => z.push(d), close: async () => z.push(new Uint8Array(0), true) }
      this.drained = Promise.resolve()
    }
  }

  take(bytes) {
    this.pending.push(bytes); this.pendingSize += bytes.length
    if (this.pendingSize >= 1 << 20) this.flushIdat()
  }
  flushIdat() {
    if (!this.pendingSize) return
    const all = new Uint8Array(this.pendingSize)
    let o = 0
    for (const p of this.pending) { all.set(p, o); o += p.length }
    this.parts.push(...chunk('IDAT', all))
    this.pending = []; this.pendingSize = 0
  }

  // rgba: Uint8ClampedArray of `rows` full rows (width × 4 bytes each)
  async writeRows(rgba, rows) {
    const W = this.w, stride = W * 3 + 1
    const out = new Uint8Array(stride * rows)
    let prev = this.prev, cur = this.cur || (this.cur = new Uint8Array(W * 3))
    for (let r = 0; r < rows; r++) {
      for (let x = 0, s = r * W * 4, d = 0; x < W; x++, s += 4, d += 3) { cur[d] = rgba[s]; cur[d + 1] = rgba[s + 1]; cur[d + 2] = rgba[s + 2] }
      // Paeth filter: best compression for photos and artwork
      const o = r * stride
      out[o] = 4
      for (let i = 0; i < W * 3; i++) {
        const a = i >= 3 ? cur[i - 3] : 0, b = prev[i], c = i >= 3 ? prev[i - 3] : 0
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
        out[o + 1 + i] = (cur[i] - pred) & 255
      }
      const t = prev; prev = cur; cur = t           // this row is the next row's "previous"
    }
    this.prev = prev; this.cur = cur
    this.rowsDone += rows
    await this.writer.ready
    await this.writer.write(out)
  }

  async finish() {
    if (this.rowsDone !== this.h) throw new Error('png_rows')
    await this.writer.close()
    await this.drained
    this.flushIdat()
    this.parts.push(...chunk('IEND', new Uint8Array(0)))
    return new Blob(this.parts, { type: 'image/png' })
  }
}
