import { useCallback, useRef } from 'react'
import useStore from './store/useStore'
import { exportLargeCanvas, downloadBlob } from './utils/imageUtils'
import toast from 'react-hot-toast'

export function useExport(stageRef) {
  const canvasSize     = useStore(s => s.canvasSize)
  const setExporting   = useStore(s => s.setExporting)
  const stageScale     = useStore(s => s.stageScale)
  const stagePos       = useStore(s => s.stagePos)
  const backgroundColor    = useStore(s => s.backgroundColor)
  const backgroundTransparent = useStore(s => s.backgroundTransparent)

  const exportAs = useCallback(async (format = 'png', quality = 1) => {
    const stage = stageRef?.current
    if (!stage) { toast.error('Canvas not ready'); return }

    const toastId = toast.loading('Preparing export…')
    setExporting(true, 0)

    try {
      // Temporarily scale stage to 1:1 for full-resolution export
      const origScale = stage.scaleX()
      const origX     = stage.x()
      const origY     = stage.y()

      stage.scale({ x: 1, y: 1 })
      stage.position({ x: 0, y: 0 })
      stage.batchDraw()

      toast.loading('Rendering full resolution…', { id: toastId })
      setExporting(true, 0.2)

      const blob = await exportLargeCanvas(
        stage,
        canvasSize,
        format,
        quality,
        (p) => {
          setExporting(true, p)
          toast.loading(`Exporting… ${Math.round(p * 100)}%`, { id: toastId })
        }
      )

      // Restore stage transform
      stage.scale({ x: origScale, y: origScale })
      stage.position({ x: origX, y: origY })
      stage.batchDraw()

      const ext = format === 'jpg' ? 'jpg' : 'png'
      const filename = `collage-${canvasSize.width}x${canvasSize.height}-${Date.now()}.${ext}`
      downloadBlob(blob, filename)

      const sizeMB = (blob.size / 1024 / 1024).toFixed(1)
      toast.success(`Exported! ${canvasSize.width}×${canvasSize.height}px • ${sizeMB} MB`, { id: toastId, duration: 5000 })
    } catch (err) {
      console.error('Export error:', err)
      toast.error(`Export failed: ${err.message}`, { id: toastId })
    } finally {
      setExporting(false, 0)
    }
  }, [stageRef, canvasSize, setExporting])

  return { exportAs }
}
