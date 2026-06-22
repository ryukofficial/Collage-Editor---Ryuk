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

  // ── Load profile first ───────────────────────────────────────────
  let profEl  = null
  let bannerH = 0
  if (profileImageSrc) {
    try {
      profEl = await loadImg(profileImageSrc)
    } catch { profEl = null }
  }

  // ── Determine collageW ───────────────────────────────────────────
  // If a profile exists, use its natural width as the canvas width so
  // the grid and profile share the same width with no stretching.
  // cellSize is derived from that width so every skin fits exactly.
  // Without a profile, use the original maxDim-based sizing.
  let collageW, cellSize

  if (profEl) {
    collageW = profEl.naturalWidth
    cellSize = Math.floor(collageW / cols)
    // Ensure collageW is an exact multiple (no fractional right edge)
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

  // Draw profile at exactly collageW wide, preserving aspect ratio
  if (profEl) {
    const drawH = Math.round(profEl.naturalHeight * (collageW / profEl.naturalWidth))
    ctx.drawImage(profEl, 0, 0, collageW, drawH)
  }

  // Draw every skin — each fits exactly in its cellSize × cellSize cell
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
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
