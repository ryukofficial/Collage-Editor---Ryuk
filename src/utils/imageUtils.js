export function loadImageFiles(files, { batchSize = 6, onProgress } = {}) {
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
        img.onerror = () => { errors.push(file.name); completed++; if (completed === fileArray.length) resolve({ results, errors }) }
        img.src = e.target.result
      }
      reader.onerror = () => { errors.push(file.name); completed++; if (completed === fileArray.length) resolve({ results, errors }) }
      reader.readAsDataURL(file)
    })
  })
}

export async function exportCollage(images, backgroundColor) {
  if (!images.length) return null

  // Each cell is the average size of uploaded images
  const avgW = Math.round(images.reduce((s, i) => s + i.naturalWidth, 0) / images.length)
  const avgH = Math.round(images.reduce((s, i) => s + i.naturalHeight, 0) / images.length)
  const cellSize = Math.min(avgW, avgH) // square cell

  const cols = Math.ceil(Math.sqrt(images.length))
  const rows = Math.ceil(images.length / cols)

  const canvas = document.createElement('canvas')
  canvas.width = cols * cellSize
  canvas.height = rows * cellSize
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = backgroundColor || '#000000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  await Promise.all(images.map((img, i) => new Promise((resolve) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const destX = col * cellSize
    const destY = row * cellSize

    const image = new Image()
    image.onload = () => {
      // Center crop to square
      const srcSize = Math.min(image.naturalWidth, image.naturalHeight)
      const srcX = (image.naturalWidth - srcSize) / 2
      const srcY = (image.naturalHeight - srcSize) / 2

      ctx.drawImage(
        image,
        srcX, srcY, srcSize, srcSize,  // source: center crop
        destX, destY, cellSize, cellSize  // dest: full cell
      )
      resolve()
    }
    image.onerror = resolve
    image.src = img.src
  })))

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png', 1.0)
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
