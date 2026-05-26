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

// Helper: load a URL into an HTMLImageElement
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

  // â”€â”€ 1. Decide cell size from average natural dimensions â”€â”€â”€â”€â”€â”€
  const avgW = Math.round(images.reduce((s, i) => s + i.naturalWidth,  0) / images.length)
  const avgH = Math.round(images.reduce((s, i) => s + i.naturalHeight, 0) / images.length)
  const cellSize = Math.min(avgW, avgH)   // square cells, no compression

  const cols = Math.ceil(Math.sqrt(images.length))
  const rows = Math.ceil(images.length / cols)

  // â”€â”€ 2. Create canvas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const canvas = document.createElement('canvas')
  canvas.width  = cols * cellSize
  canvas.height = rows * cellSize
  const ctx = canvas.getContext('2d')

  // Background
  ctx.fillStyle = backgroundColor || '#000000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // â”€â”€ 3. Draw collage grid â€” no gaps, no compression â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await Promise.all(
    images.map((img, i) =>
      loadImg(img.src).then((el) => {
        const col  = i % cols
        const row  = Math.floor(i / cols)
        const destX = col * cellSize
        const destY = row * cellSize

        // Centre-crop to square
        const srcSize = Math.min(el.naturalWidth, el.naturalHeight)
        const srcX    = (el.naturalWidth  - srcSize) / 2
        const srcY    = (el.naturalHeight - srcSize) / 2

        ctx.drawImage(el, srcX, srcY, srcSize, srcSize, destX, destY, cellSize, cellSize)
      }).catch(() => {/* skip broken images */})
    )
  )

  // â”€â”€ 4. Draw profile image on top (centered) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (profileImageSrc) {
    try {
      const prof = await loadImg(profileImageSrc)

      // Profile size = 1/4 of the shorter canvas side, but at least 200px
      const profileSize = Math.max(200, Math.round(Math.min(canvas.width, canvas.height) / 4))

      // Centre of canvas
      const px = Math.round((canvas.width  - profileSize) / 2)
      const py = Math.round((canvas.height - profileSize) / 2)

      // Draw circular clip
      ctx.save()
      ctx.beginPath()
      ctx.arc(px + profileSize / 2, py + profileSize / 2, profileSize / 2, 0, Math.PI * 2)
      ctx.clip()

      // Centre-crop profile image to square
      const srcSize = Math.min(prof.naturalWidth, prof.naturalHeight)
      const srcX    = (prof.naturalWidth  - srcSize) / 2
      const srcY    = (prof.naturalHeight - srcSize) / 2
      ctx.drawImage(prof, srcX, srcY, srcSize, srcSize, px, py, profileSize, profileSize)
      ctx.restore()

      // White circle border
      ctx.beginPath()
      ctx.arc(px + profileSize / 2, py + profileSize / 2, profileSize / 2, 0, Math.PI * 2)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth   = Math.max(4, Math.round(profileSize / 40))
      ctx.stroke()
    } catch {
      // profile failed to load â€” skip silently
    }
  }

  // â”€â”€ 5. Blob at full quality â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
