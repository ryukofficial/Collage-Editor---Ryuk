export async function loadImageFiles(files, { batchSize = 6, onProgress } = {}) {
  const results = []
  const errors = []
  const fileArray = Array.from(files)
  
  for (let i = 0; i < fileArray.length; i += batchSize) {
    const batch = fileArray.slice(i, i + batchSize)
    await Promise.all(batch.map(file => new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          results.push({
            src: e.target.result,
            name: file.name,
            naturalWidth: img.width,
            naturalHeight: img.height,
            fileSize: file.size,
          })
          resolve()
        }
        img.onerror = () => { errors.push(file.name); resolve() }
        img.src = e.target.result
      }
      reader.readAsDataURL(file)
    })))
    onProgress && onProgress((i + batch.length) / fileArray.length)
  }
  return { results, errors }
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
