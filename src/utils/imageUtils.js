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

export async function exportCollage(images, backgroundColor, profileImageSrc = null) {
  if (!images.length) return null

  const cols = Math.ceil(Math.sqrt(images.length))
  const rows = Math.ceil(images.length / cols)

  let profEl  = null
  let bannerH = 0
  if (profileImageSrc) {
    try { profEl = await loadImg(profileImageSrc) } catch { profEl = null }
  }

  let collageW, cellSize

  if (profEl) {
    collageW = profEl.naturalWidth
    cellSize = Math.floor(collageW / cols)
    collageW = cols * cellSize
    bannerH  = Math.round(profEl.naturalHeight * (collageW / profEl.naturalWidth))
  } else {
    const maxDim = images.reduce((m, i) => Math.max(m, i.naturalWidth, i.naturalHeight), 0)
    cellSize = maxDim || 300
    collageW = cols * cellSize
  }

  const collageH = rows * cellSize
  const totalH   = bannerH + collageH

  const canvas  = document.createElement('canvas')
  canvas.width  = collageW
  canvas.height = totalH
  const ctx = canvas.getContext('2d', { alpha: false })

  ctx.fillStyle = backgroundColor || '#000000'
  ctx.fillRect(0, 0, collageW, totalH)

  if (profEl) {
    const drawH = Math.round(profEl.naturalHeight * (collageW / profEl.naturalWidth))
    ctx.drawImage(profEl, 0, 0, collageW, drawH)
  }

  await Promise.all(
    images.map((img, i) =>
      loadImg(img.src).then((el) => {
        const col   = i % cols
        const row   = Math.floor(i / cols)
        const destX = col * cellSize
        const destY = bannerH + row * cellSize

        let srcX, srcY, srcW, srcH

        if (img.cropW && img.cropH) {
          // Use stored crop from HeroPicker / AutoCollage
          srcX = img.cropX ?? 0
          srcY = img.cropY ?? 0
          srcW = img.cropW
          srcH = img.cropH
        } else {
          // Fallback: center-square crop for manually uploaded images
          const srcSize = Math.min(el.naturalWidth, el.naturalHeight)
          srcX = (el.naturalWidth  - srcSize) / 2
          srcY = (el.naturalHeight - srcSize) / 2
          srcW = srcSize
          srcH = srcSize
        }

        ctx.drawImage(el, srcX, srcY, srcW, srcH, destX, destY, cellSize, cellSize)
      }).catch(() => {})
    )
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Canvas export produced empty blob')),
      'image/png',
      1.0
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
