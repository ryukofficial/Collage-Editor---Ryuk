export function loadImageFiles(files, { onProgress } = {}) {
  return new Promise((resolve) => {
    const results = []
    const errors = []
    const fileArray = Array.from(files)
    let completed = 0
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
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load: ' + src))
    img.src = src
  })
}

export async function exportCollage(images, backgroundColor, profileImageSrc = null) {
  if (!images.length) return null

  // Cell size from average natural dimensions
  const avgW = Math.round(images.reduce((s, i) => s + i.naturalWidth,  0) / images.length)
  const avgH = Math.round(images.reduce((s, i) => s + i.naturalHeight, 0) / images.length)
  const cellSize = Math.min(avgW, avgH)

  const cols = Math.ceil(Math.sqrt(images.length))
  const rows = Math.ceil(images.length / cols)

  const collageW = cols * cellSize
  const collageH = rows * cellSize

  // Profile banner: same width as collage, height proportional to original image
  let bannerH = 0
  let profEl = null
  if (profileImageSrc) {
    try {
      profEl = await loadImg(profileImageSrc)
      // Scale profile image to collage width, keep aspect ratio
      bannerH = Math.round(profEl.naturalHeight * (collageW / profEl.naturalWidth))
    } catch { profEl = null }
  }

  const totalH = bannerH + collageH

  const canvas = document.createElement('canvas')
  canvas.width  = collageW
  canvas.height = totalH
  const ctx = canvas.getContext('2d')

  // Background
  ctx.fillStyle = backgroundColor || '#000000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Draw profile image full width on top, no gaps
  if (profEl) {
    ctx.drawImage(profEl, 0, 0, collageW, bannerH)
  }

  // Draw collage grid directly below profile, no gaps, no compression
  await Promise.all(
    images.map((img, i) =>
      loadImg(img.src).then((el) => {
        const col   = i % cols
        const row   = Math.floor(i / cols)
        const destX = col * cellSize
        const destY = bannerH + row * cellSize

        const srcSize = Math.min(el.naturalWidth, el.naturalHeight)
        const srcX    = (el.naturalWidth  - srcSize) / 2
        const srcY    = (el.naturalHeight - srcSize) / 2

        ctx.drawImage(el, srcX, srcY, srcSize, srcSize, destX, destY, cellSize, cellSize)
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
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
