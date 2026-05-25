export function loadImageFiles(files, { batchSize = 6, onProgress } = {}) {
  return new Promise((resolve) => {
    const results = []
    const errors = []
    const fileArray = Array.from(files)
    let completed = 0

    if (fileArray.length === 0) {
      resolve({ results, errors })
      return
    }

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

export async function exportCollage(images, canvasSize, backgroundColor) {
  // Create a full resolution offscreen canvas
  const cellSize = Math.floor(canvasSize.width / Math.ceil(Math.sqrt(images.length)))
  const cols = Math.ceil(Math.sqrt(images.length))
  const rows = Math.ceil(images.length / cols)
  const totalWidth = cols * cellSize
  const totalHeight = rows * cellSize

  const canvas = document.createElement('canvas')
  canvas.width = totalWidth
  canvas.height = totalHeight
  const ctx = canvas.getContext('2d')

  // Background
  ctx.fillStyle = backgroundColor || '#000000'
  ctx.fillRect(0, 0, totalWidth, totalHeight)

  // Draw each image at full quality into its cell
  await Promise.all(images.map((img, i) => new Promise((resolve) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = col * cellSize
    const y = row * cellSize

    const image = new Image()
    image.onload = () => {
      // Cover the cell maintaining aspect ratio
      const scale = Math.max(cellSize / image.naturalWidth, cellSize / image.naturalHeight)
      const drawW = image.naturalWidth * scale
      const drawH = image.naturalHeight * scale
      const offsetX = x + (cellSize - drawW) / 2
      const offsetY = y + (cellSize - drawH) / 2

      ctx.drawImage(image, offsetX, offsetY, drawW, drawH)
      resolve()
    }
    image.onerror = resolve
    image.src = img.src
  })))

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png', 1.0)
  })
}

export async function exportLargeCanvas(stage, canvasSize, format, quality, onProgress) {
  onProgress && onProgress(0.1)
  const dataURL = stage.toDataURL({
    mimeType: format === 'jpg' ? 'image/jpeg' : 'image/png',
    quality,
    width: canvasSize.width,
    height: canvasSize.height,
  })
  onProgress && onProgress(0.9)
  const res = await fetch(dataURL)
  const blob = await res.blob()
  onProgress && onProgress(1)
  return blob
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
