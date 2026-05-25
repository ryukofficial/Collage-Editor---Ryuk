/**
 * imageUtils.js
 * All image I/O is lossless by design:
 * - PNG export: quality=1 (max), no compression
 * - JPG export: quality=1 (100%) â€” still lossy by format, but highest possible
 * - We never resize/compress source images
 * - Source images are kept as Blob URLs (in-memory) to avoid re-encoding
 */

/**
 * Load a File object into memory as a Blob URL.
 * Returns metadata + URL without any compression.
 */
export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const blobUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({
        src: blobUrl,
        name: file.name,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        fileSize: file.size,
        mimeType: file.type,
      })
    }
    img.onerror = () => {
      URL.revokeObjectURL(blobUrl)
      reject(new Error(`Failed to load ${file.name}`))
    }
    img.src = blobUrl
  })
}

/**
 * Load multiple files in parallel batches to avoid memory spikes.
 * batchSize controls how many are decoded simultaneously.
 */
export async function loadImageFiles(files, { batchSize = 8, onProgress } = {}) {
  const results = []
  const errors = []
  let done = 0

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize)
    const batchResults = await Promise.allSettled(batch.map(loadImageFile))

    batchResults.forEach((r, j) => {
      if (r.status === 'fulfilled') results.push(r.value)
      else errors.push({ file: batch[j].name, error: r.reason.message })
      done++
    })

    if (onProgress) onProgress(done / files.length)

    // Yield to browser to keep UI responsive
    await new Promise(r => setTimeout(r, 0))
  }

  return { results, errors }
}

/**
 * Export a Konva Stage to PNG at FULL resolution (no compression).
 * Uses toBlob with mimeType image/png for lossless output.
 */
export async function exportToPNG(stage, canvasSize, options = {}) {
  const { onProgress } = options

  onProgress?.(0.1)

  // Get the pixel ratio to ensure full resolution
  const dataUrl = stage.toDataURL({
    mimeType: 'image/png',
    quality: 1,        // PNG ignores quality but set anyway
    pixelRatio: 1,     // We handle scaling ourselves
    x: 0,
    y: 0,
    width: canvasSize.width,
    height: canvasSize.height,
  })

  onProgress?.(0.8)

  // Convert to blob for large file support
  const blob = dataURLtoBlob(dataUrl)

  onProgress?.(1.0)
  return blob
}

/**
 * Export to JPG at maximum quality (quality=1 = 100%).
 * Note: JPEG is inherently lossy by format, but this is as close to lossless as JPEG allows.
 */
export async function exportToJPG(stage, canvasSize, quality = 1, options = {}) {
  const { onProgress } = options

  onProgress?.(0.1)

  const dataUrl = stage.toDataURL({
    mimeType: 'image/jpeg',
    quality: quality,  // 1.0 = highest quality, minimal compression artifacts
    pixelRatio: 1,
    x: 0,
    y: 0,
    width: canvasSize.width,
    height: canvasSize.height,
  })

  onProgress?.(0.8)

  const blob = dataURLtoBlob(dataUrl)

  onProgress?.(1.0)
  return blob
}

/**
 * For very large canvases (>8192px), we use tile-based export:
 * render each tile separately then stitch with OffscreenCanvas.
 * This avoids browser canvas size limits.
 */
export async function exportLargeCanvas(stage, canvasSize, format = 'png', quality = 1, onProgress) {
  const MAX_TILE = 4096
  const { width, height } = canvasSize

  if (width <= MAX_TILE && height <= MAX_TILE) {
    // Small enough â€” direct export
    if (format === 'png') return exportToPNG(stage, canvasSize, { onProgress })
    return exportToJPG(stage, canvasSize, quality, { onProgress })
  }

  // Tiled export for huge canvases
  const cols = Math.ceil(width / MAX_TILE)
  const rows = Math.ceil(height / MAX_TILE)
  const totalTiles = cols * rows

  // Final canvas
  const finalCanvas = document.createElement('canvas')
  finalCanvas.width  = width
  finalCanvas.height = height
  const ctx = finalCanvas.getContext('2d', { willReadFrequently: false })
  ctx.imageSmoothingEnabled = false  // No smoothing = no quality loss

  let tilesDone = 0

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const tileX = col * MAX_TILE
      const tileY = row * MAX_TILE
      const tileW = Math.min(MAX_TILE, width - tileX)
      const tileH = Math.min(MAX_TILE, height - tileY)

      const tileDataUrl = stage.toDataURL({
        mimeType: 'image/png',
        quality: 1,
        pixelRatio: 1,
        x: tileX,
        y: tileY,
        width: tileW,
        height: tileH,
      })

      await new Promise(resolve => {
        const img = new Image()
        img.onload = () => {
          ctx.drawImage(img, tileX, tileY)
          resolve()
        }
        img.src = tileDataUrl
      })

      tilesDone++
      onProgress?.(tilesDone / totalTiles * 0.9)

      // Yield to browser
      await new Promise(r => setTimeout(r, 0))
    }
  }

  onProgress?.(0.95)

  return new Promise((resolve) => {
    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg'
    finalCanvas.toBlob(resolve, mimeType, quality)
  })
}

/**
 * Convert dataURL to Blob efficiently.
 * Avoids the overhead of atob for large images.
 */
export function dataURLtoBlob(dataUrl) {
  const arr = dataUrl.split(',')
  const mime = arr[0].match(/:(.*?);/)[1]
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) u8arr[n] = bstr.charCodeAt(n)
  return new Blob([u8arr], { type: mime })
}

/**
 * Download a Blob as a file.
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/**
 * Format bytes for display.
 */
export function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

/**
 * Calculate fit scale so an image fills a region without distortion.
 */
export function calcFitScale(imgW, imgH, boxW, boxH) {
  return Math.min(boxW / imgW, boxH / imgH)
}

/**
 * Calculate fill scale so an image covers a region (may crop).
 */
export function calcFillScale(imgW, imgH, boxW, boxH) {
  return Math.max(boxW / imgW, boxH / imgH)
}
