import { useState, useCallback } from 'react'
import { loadImageFiles } from '../utils/imageUtils'
import useStore from '../store/useStore'
import toast from 'react-hot-toast'

export function useDrop() {
  const addImages = useStore(s => s.addImages)
  const saveSnapshot = useStore(s => s.saveSnapshot)
  const [isDragging, setIsDragging] = useState(false)
  const [loadingCount, setLoadingCount] = useState(0)

  const handleFiles = useCallback(async (files) => {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (!imageFiles.length) {
      toast.error('No image files found')
      return
    }

    const loadingToast = toast.loading(`Loading ${imageFiles.length} image${imageFiles.length > 1 ? 's' : ''}…`)
    setLoadingCount(imageFiles.length)

    try {
      const { results, errors } = await loadImageFiles(imageFiles, {
        batchSize: 6,
        onProgress: (p) => {
          toast.loading(`Loading images… ${Math.round(p * 100)}%`, { id: loadingToast })
        },
      })

      if (results.length) {
        saveSnapshot()
        addImages(results)
        toast.success(`Added ${results.length} image${results.length > 1 ? 's' : ''}`, { id: loadingToast })
      }

      if (errors.length) {
        errors.forEach(e => console.warn('Load error:', e))
        if (!results.length) toast.error(`Failed to load images`, { id: loadingToast })
      }
    } catch (err) {
      toast.error('Error loading images', { id: loadingToast })
    } finally {
      setLoadingCount(0)
    }
  }, [addImages, saveSnapshot])

  const onDragEnter = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true)
  }, [])

  const onDragLeave = useCallback((e) => {
    e.preventDefault()
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false)
  }, [])

  const onDragOver = useCallback((e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    const files = e.dataTransfer.files
    if (files.length) handleFiles(files)
  }, [handleFiles])

  return { isDragging, loadingCount, handleFiles, onDragEnter, onDragLeave, onDragOver, onDrop }
}
