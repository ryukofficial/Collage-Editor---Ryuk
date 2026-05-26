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

  // â”€â”€ Cell size from average natural dimensions â”€â”€
  const avgW = Math.round(images.reduce((s, i) => s + i.naturalWidth,  0) / images.length)
  const avgH = Math.round(images.reduce((s, i) => s + i.naturalHeight, 0) / images.length)
  const cellSize = Math.min(avgW, avgH)

  const cols = Math.ceil(Math.sqrt(images.length))
  const rows = Math.ceil(images.length / cols)

  const collageW = cols * cellSize
  const collageH = rows * cellSize

  // â”€â”€ Profile banner height = 1 cell tall, full width â”€â”€
  const bannerH = profileImageSrc ? cellSize : 0
  const totalH  = collageH + bannerH

  const canvas = document.createElement('canvas')
  canvas.width  = collageW
  canvas.height = totalH
  const ctx = canvas.getContext('2d')

  // Background
  ctx.fillStyle = backgroundColor || '#000000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // â”€â”€ Draw profile banner at top â”€â”€
  if (profileImageSrc) {
    try {
      const prof = await loadImg(profileImageSrc)

      // Fill banner background same as bg color
      ctx.fillStyle = backgroundColor || '#000000'
      ctx.fillRect(0, 0, collageW, bannerH)

      // Draw profile image centered in banner, square crop, full banner height
      const profSize = bannerH  // square, same height as one cell
      const profX    = Math.round((collageW - profSize) / 2)
      const profY    = 0

      // Circular clip
      ctx.save()
      ctx.beginPath()
      ctx.arc(profX + profSize / 2, profY + profSize / 2, profSize / 2, 0, Math.PI * 2)
      ctx.clip()

      const srcSize = Math.min(prof.naturalWidth, prof.naturalHeight)
      const srcX    = (prof.naturalWidth  - srcSize) / 2
      const srcY    = (prof.naturalHeight - srcSize) / 2
      ctx.drawImage(prof, srcX, srcY, srcSize, srcSize, profX, profY, profSize, profSize)
      ctx.restore()

      // White border
      ctx.beginPath()
      ctx.arc(profX + profSize / 2, profY + profSize / 2, profSize / 2, 0, Math.PI * 2)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth   = Math.max(4, Math.round(profSize / 40))
      ctx.stroke()
    } catch {
      // skip if profile fails
    }
  }

  // â”€â”€ Draw collage grid below banner, no gaps, no compression â”€â”€
  await Promise.all(
    images.map((img, i) =>
      loadImg(img.src).then((el) => {
        const col   = i % cols
        const row   = Math.floor(i / cols)
        const destX = col * cellSize
        const destY = bannerH + row * cellSize  // offset by banner height

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
