/**
 * imageUtils.js
 * All image I/O is lossless by design:
 * - PNG export: quality=1 (max), no compression
 * - JPG export: quality=1 (100%) — still lossy by format, but highest possible
 * - We never resize/compress source images
 * - Source images are kept as Blob URLs (in-memory) to avoid re-encoding
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
    await new Promise(r => setTimeout(r, 0))
  }

  return { results, errors }
}

export async function exportToPNG(stage, canvasSize, options = {}) {
  const { onProgress, profileImage } = options

  onProgress?.(0.1)

  const dataUrl = stage.toDataURL({
    mimeType: 'image/png',
    quality: 1,
    pixelRatio: 1,
    x: 0,
    y: 0,
    width: canvasSize.width,
    height: canvasSize.height,
  })

  onProgress?.(0.6)

  // If no profile image, just return the stage export
  if (!profileImage) {
    const blob = dataURLtoBlob(dataUrl)
    onProgress?.(1.0)
    return blob
  }

  // Stitch profile image on top of the collage
  const blob = await stitchProfileOnTop(profileImage, dataUrl, canvasSize, onProgress)
  onProgress?.(1.0)
  return blob
}

/**
 * Stitches profile image on top of collage with no gaps, no compression.
 * Profile image is scaled to match collage width exactly.
 */
async function stitchProfileOnTop(profileSrc, collageDataUrl, canvasSize, onProgress) {
  // Load profile image
  const profileImg = await new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = profileSrc
  })

  // Load collage image
  const collageImg = await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = collageDataUrl
  })

  onProgress?.(0.8)

  // Scale profile to match collage width, maintain aspect ratio
  const profileScale = canvasSize.width / profileImg.naturalWidth
  const profileH = Math.round(profileImg.naturalHeight * profileScale)

  // Final canvas = profile height + collage height, same width
  const finalCanvas = document.createElement('canvas')
  finalCanvas.width = canvasSize.width
  finalCanvas.height = profileH + canvasSize.height
  const ctx = finalCanvas.getContext('2d')
  ctx.imageSmoothingEnabled = false // no quality loss

  // Draw profile at top
  ctx.drawImage(profileImg, 0, 0, canvasSize.width, profileH)

  // Draw collage directly below
  ctx.drawImage(collageImg, 0, profileH, canvasSize.width, canvasSize.height)

  onProgress?.(0.95)

  return new Promise((resolve) => {
    finalCanvas.toBlob(resolve, 'image/png', 1)
  })
}

export async function exportToJPG(stage, canvasSize, quality = 1, options = {}) {
  const { onProgress, profileImage } = options

  onProgress?.(0.1)

  const dataUrl = stage.toDataURL({
    mimeType: 'image/jpeg',
    quality: quality,
    pixelRatio: 1,
    x: 0,
    y: 0,
    width: canvasSize.width,
    height: canvasSize.height,
  })

  onProgress?.(0.6)

  if (!profileImage) {
    const blob = dataURLtoBlob(dataUrl)
    onProgress?.(1.0)
    return blob
  }

  const blob = await stitchProfileOnTop(profileImage, dataUrl, canvasSize, onProgress)
  onProgress?.(1.0)
  return blob
}

export async function exportLargeCanvas(stage, canvasSize, format = 'png', quality = 1, onProgress, profileImage) {
  const MAX_TILE = 4096
  const { width, height } = canvasSize

  if (width <= MAX_TILE && height <= MAX_TILE) {
    if (format === 'png') return exportToPNG(stage, canvasSize, { onProgress, profileImage })
    return exportToJPG(stage, canvasSize, quality, { onProgress, profileImage })
  }

  const cols = Math.ceil(width / MAX_TILE)
  const rows = Math.ceil(height / MAX_TILE)
  const totalTiles = cols * rows

  const finalCanvas = document.createElement('canvas')
  finalCanvas.width = width
  finalCanvas.height = height
  const ctx = finalCanvas.getContext('2d', { willReadFrequently: false })
  ctx.imageSmoothingEnabled = false

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
      await new Promise(r => setTimeout(r, 0))
    }
  }

  onProgress?.(0.95)

  // Stitch profile on top if provided
  if (profileImage) {
    const collageDataUrl = finalCanvas.toDataURL('image/png', 1)
    return stitchProfileOnTop(profileImage, collageDataUrl, canvasSize, onProgress)
  }

  return new Promise((resolve) => {
    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg'
    finalCanvas.toBlob(resolve, mimeType, quality)
  })
}

export function dataURLtoBlob(dataUrl) {
  const arr = dataUrl.split(',')
  const mime = arr[0].match(/:(.*?);/)[1]
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) u8arr[n] = bstr.charCodeAt(n)
  return new Blob([u8arr], { type: mime })
}

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

export function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function calcFitScale(imgW, imgH, boxW, boxH) {
  return Math.min(boxW / imgW, boxH / imgH)
}

export function calcFillScale(imgW, imgH, boxW, boxH) {
  return Math.max(boxW / imgW, boxH / imgH)
}
