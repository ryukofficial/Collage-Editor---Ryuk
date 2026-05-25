import { useEffect } from 'react'
import useStore from '../store/useStore'

export function useKeyboard() {
  const store = useStore()

  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      const ctrl = e.ctrlKey || e.metaKey

      // Delete selected
      if ((e.key === 'Delete' || e.key === 'Backspace') && !ctrl) {
        e.preventDefault()
        store.removeSelected()
        return
      }

      // Undo / Redo
      if (ctrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        store.undo()
        return
      }
      if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        store.redo()
        return
      }

      // Select all
      if (ctrl && e.key === 'a') {
        e.preventDefault()
        store.selectAll()
        return
      }

      // Duplicate
      if (ctrl && e.key === 'd') {
        e.preventDefault()
        store.duplicateSelected()
        return
      }

      // Deselect
      if (e.key === 'Escape') {
        store.clearSelection()
        return
      }

      // Zoom
      if (ctrl && e.key === '=') { e.preventDefault(); store.zoomIn();  return }
      if (ctrl && e.key === '-') { e.preventDefault(); store.zoomOut(); return }
      if (ctrl && e.key === '0') { e.preventDefault(); store.zoomFit(); return }
      if (ctrl && e.key === '1') { e.preventDefault(); store.zoomActual(); return }

      // Tool shortcuts
      if (!ctrl && e.key === 'v') store.setActiveTool('select')
      if (!ctrl && e.key === 'h') store.setActiveTool('hand')

      // Arrow nudge selected images
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp'   ? -step : e.key === 'ArrowDown'  ? step : 0
        store.selectedIds.forEach(id => {
          const img = store.images.find(i => i.id === id)
          if (img) store.updateImage(id, { x: img.x + dx, y: img.y + dy })
        })
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [store])
}
