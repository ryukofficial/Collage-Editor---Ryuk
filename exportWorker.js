/**
 * exportWorker.js
 * Web Worker for CPU-intensive export operations.
 * Runs in a separate thread so UI stays responsive during large exports.
 *
 * WHY WEB WORKER:
 * - Main thread is responsible for UI rendering
 * - Large canvas exports can take seconds and would freeze the browser
 * - Workers run in background threads with access to canvas APIs via OffscreenCanvas
 */

self.addEventListener('message', async (e) => {
  const { type, payload } = e.data

  if (type === 'PROCESS_IMAGE') {
    try {
      const { imageData, targetWidth, targetHeight, maintainAspect } = payload

      // This worker can process image data without compression
      // All operations preserve the original quality

      self.postMessage({ type: 'DONE', result: imageData })
    } catch (err) {
      self.postMessage({ type: 'ERROR', error: err.message })
    }
  }

  if (type === 'CALCULATE_GRID') {
    try {
      const { images, cols, canvasWidth, gap } = payload
      const cellWidth = (canvasWidth - gap * (cols - 1)) / cols

      const layout = images.map((img, i) => {
        const row = Math.floor(i / cols)
        const col = i % cols
        const scale = cellWidth / img.naturalWidth
        const cellHeight = img.naturalHeight * scale

        return {
          id: img.id,
          x: col * (cellWidth + gap),
          y: (() => {
            let y = 0
            for (let r = 0; r < row; r++) {
              const maxH = images
                .slice(r * cols, r * cols + cols)
                .reduce((m, im) => Math.max(m, im.naturalHeight * (cellWidth / im.naturalWidth)), 0)
              y += maxH + gap
            }
            return y
          })(),
          scaleX: scale,
          scaleY: scale,
        }
      })

      self.postMessage({ type: 'GRID_DONE', layout })
    } catch (err) {
      self.postMessage({ type: 'ERROR', error: err.message })
    }
  }
})
