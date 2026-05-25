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
