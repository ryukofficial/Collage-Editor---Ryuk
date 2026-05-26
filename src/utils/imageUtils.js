export function loadImageFiles(files, { onProgress } = {}) {
  return new Promise((resolve) => {
    const results  = []
    const errors   = []
    const fileArray = Array.from(files)
    let completed  = 0
    if (fileArray.length === 0) { resolve({ results, errors }); return }

    fileArray.forEach((file) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          results.push({
            src: e.target.result,
            name: file.name,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            fileSize: file.size,
          })
          completed++
          onProgress && onProgress(completed / fileArray.length)
          if (completed === fileArray.length) resolve({ results, errors })
        }
        img.onerror = () => {
          errors.push(file.name)
          completed++
          if (completed === fileArray.length) resolve({ results, errors })
        }
        img.src = e.target.result
      }
      reader.onerror = () => {
        errors.push(file.name)
        completed++
        if (completed === fileArray.length) resolve({ results, errors })
      }
      reader.readAsDataURL(file)
    })
  })
}

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load: ' + src))
    img.src = src
  })
}

/**
 * exportCollage
 *
 * Changes vs previous version:
 *  - NO skin limit â€” exports every image passed in, unlimited count
 *  - cellSize uses the MAXIMUM natural dimension across all images
 *    (previously used average, which downscaled larger skins)
 *  - Canvas is created at full native resolution â€” no scaling down
 *  - toBlob uses 'image/png' at quality 1.0 (PNG is lossless; quality
 *    param has no effect on PNG but is kept explicit for clarity)
 *  - Profile banner drawn at full collage width, keeping its own
 *    native aspect ratio (no upscaling beyond natural size)
 */
export async function exportCollage(images, backgroundColor, profileImageSrc = null) {
  if (!images.length) return null

  // â”€â”€ Use the LARGEST natural dimension as cell size â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // This ensures no skin is ever downsampled below its native size.
  // (The old average could shrink large Legend-tier skins.)
  const maxDim  = images.reduce((m, i) => Math.max(m, i.naturalWidth, i.naturalHeight), 0)
  const cellSize = maxDim || 300   // fallback if images have no natural size yet

  // â”€â”€ Unlimited grid layout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // No cap on image count. Grid grows as needed.
  const cols = Math.ceil(Math.sqrt(images.length))
  const rows = Math.ceil(images.length / cols)

  const collageW = cols * cellSize
  const collageH = rows * cellSize

  // â”€â”€ Profile banner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let bannerH = 0
  let profEl  = null
  if (profileImageSrc) {
    try {
      profEl  = await loadImg(profileImageSrc)
      // Scale to collage width but never upscale beyond native width
      const scale = Math.min(1, collageW / profEl.naturalWidth)
      bannerH = Math.round(profEl.naturalHeight * scale)
    } catch { profEl = null }
  }

  const totalH = bannerH + collageH

  // â”€â”€ Create canvas at full native resolution â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const canvas  = document.createElement('canvas')
  canvas.width  = collageW
  canvas.height = totalH
  const ctx = canvas.getContext('2d', { alpha: false })   // alpha:false = slightly faster

  // Background fill
  ctx.fillStyle = backgroundColor || '#000000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Draw profile banner â€” scaled to collage width, top-aligned
  if (profEl) {
    const scale  = Math.min(1, collageW / profEl.naturalWidth)
    const drawW  = Math.round(profEl.naturalWidth  * scale)
    const drawH  = Math.round(profEl.naturalHeight * scale)
    ctx.drawImage(profEl, 0, 0, drawW, drawH)
  }

  // â”€â”€ Draw every skin at full quality, no compression â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Each skin is centre-cropped to a square then drawn at cellSize.
  // Promise.all keeps it parallel for speed even with 100+ images.
  await Promise.all(
    images.map((img, i) =>
      loadImg(img.src).then((el) => {
        const col   = i % cols
        const row   = Math.floor(i / cols)
        const destX = col * cellSize
        const destY = bannerH + row * cellSize

        // Centre-crop source to square
        const srcSize = Math.min(el.naturalWidth, el.naturalHeight)
        const srcX    = (el.naturalWidth  - srcSize) / 2
        const srcY    = (el.naturalHeight - srcSize) / 2

        ctx.drawImage(el, srcX, srcY, srcSize, srcSize, destX, destY, cellSize, cellSize)
      }).catch(() => { /* skip broken images silently */ })
    )
  )

  // â”€â”€ Export as lossless PNG, full quality â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Canvas export produced empty blob')),
      'image/png',
      1.0   // PNG is lossless â€” this param is ignored by browsers but kept for intent
    )
  })
}

export function downloadBlob(blob, filename) {
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
      }
