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

export async function exportCollage(images, backgroundColor) {
  if (!images.length) return null

  const avgW = Math.round(images.reduce((s, i) => s + i.naturalWidth, 0) / images.length)
  const avgH = Math.round(images.reduce((s, i) => s + i.naturalHeight, 0) / images.length)
  const cellSize = Math.min(avgW, avgH)

  const cols = Math.ceil(Math.sqrt(images.length))
  const rows = Math.ceil(images.length / cols)

  const canvas = document.createElement('canvas')
  canvas.width = cols * cellSize
  canvas.height = rows * cellSize
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = backgroundColor || '#000000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  await Promise.all(
    images.map((img, i) =>
      new Promise((resolve) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        const destX = col * cellSize
        const destY = row * cellSize

        const image = new Image()
        image.crossOrigin = 'anonymous' // ← MUST be before .src
        image.onload = () => {
          const srcSize = Math.min(image.naturalWidth, image.naturalHeight)
          const srcX = (image.naturalWidth - srcSize) / 2
          const srcY = (image.naturalHeight - srcSize) / 2
          ctx.drawImage(image, srcX, srcY, srcSize, srcSize, destX, destY, cellSize, cellSize)
          resolve()
        }
        image.onerror = () => resolve() // skip broken images, don't block export
        image.src = img.src             // ← set AFTER crossOrigin
      })
    )
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Canvas export produced empty blob'))
    }, 'image/png', 1.0)
  })
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
