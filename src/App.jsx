import React, { useRef } from 'react'
import { Stage, Layer, Image as KonvaImage, Rect } from 'react-konva'
import { Toaster } from 'react-hot-toast'
import useStore from './store/useStore'
import { useDrop } from './useDrop'
import { useKeyboard } from './useKeyboard'
import useImage from 'use-image'
import HeroPicker from './components/HeroPicker'

function CanvasImage({ img, isSelected, onSelect, onChange }) {
  const [image] = useImage(img.src)
  return (
    <KonvaImage
      image={image}
      x={img.x}
      y={img.y}
      width={img.naturalWidth}
      height={img.naturalHeight}
      scaleX={img.scaleX}
      scaleY={img.scaleY}
      rotation={img.rotation}
      opacity={img.opacity}
      draggable
      onClick={() => onSelect(img.id)}
      onTap={() => onSelect(img.id)}
      onDragEnd={e => onChange(img.id, { x: e.target.x(), y: e.target.y() })}
      stroke={isSelected ? '#6c63ff' : null}
      strokeWidth={isSelected ? 2 : 0}
    />
  )
}

export default function App() {
  const stageRef = useRef()
  const fileInputRef = useRef()

  const images = useStore(s => s.images)
  const selectedIds = useStore(s => s.selectedIds)
  const canvasSize = useStore(s => s.canvasSize)
  const stageScale = useStore(s => s.stageScale)
  const stagePos = useStore(s => s.stagePos)
  const backgroundColor = useStore(s => s.backgroundColor)
  const selectImage = useStore(s => s.selectImage)
  const updateImage = useStore(s => s.updateImage)
  const clearSelection = useStore(s => s.clearSelection)
  const setStageScale = useStore(s => s.setStageScale)
  const setStagePos = useStore(s => s.setStagePos)
  const clearAll = useStore(s => s.clearAll)
  const undo = useStore(s => s.undo)
  const redo = useStore(s => s.redo)

  const { isDragging, handleFiles, onDragEnter, onDragLeave, onDragOver, onDrop } = useDrop()

  useKeyboard()

  const handleWheel = (e) => {
    e.evt.preventDefault()
    const scaleBy = 1.08
    const stage = e.target.getStage()
    const oldScale = stage.scaleX()
    const pointer = stage.getPointerPosition()
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    }
    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy
    setStageScale(newScale)
    setStagePos({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    })
  }

  const handleExport = async () => {
    if (!images.length) return
    const toast = (await import('react-hot-toast')).default
    const id = toast.loading('Exporting collage...')
    try {
      const { exportCollage, downloadBlob } = await import('./utils/imageUtils')
      const blob = await exportCollage(images, backgroundColor)
      downloadBlob(blob, `collage-${Date.now()}.png`)
      toast.success('Exported! Check your downloads.', { id })
    } catch (e) {
      toast.error('Export failed: ' + e.message, { id })
    }
  }

  return (
    <div className="flex flex-col h-screen bg-void text-text overflow-hidden">
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#1a1a26', color: '#c8c8e8', border: '1px solid #252535' } }} />

      {/* Hidden file input for header Upload button */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => {
          if (e.target.files && e.target.files.length > 0) {
            handleFiles(e.target.files)
            e.target.value = ''
          }
        }}
      />

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-panel border-b border-border shrink-0 overflow-x-auto">
        <span className="font-display font-bold text-lg text-gradient shrink-0 mr-3">PixelForge</span>
        <div className="flex gap-2 items-center shrink-0">
          <button className="btn-ghost text-sm px-2" onClick={undo}>Undo</button>
          <button className="btn-ghost text-sm px-2" onClick={redo}>Redo</button>
          <button className="btn-ghost text-sm px-2" onClick={clearAll}>Clear</button>
          <button className="btn-ghost text-sm px-2" onClick={() => fileInputRef.current.click()}>Upload</button>
          <HeroPicker />
          <button className="btn-primary text-sm px-3" onClick={handleExport}>Export PNG</button>
        </div>
      </header>

      {/* Canvas Area */}
      <div
        id="canvas-container"
        className="flex-1 relative bg-grid overflow-hidden"
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {/* Drop overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-accent/10 border-2 border-dashed border-accent">
            <p className="text-accent text-xl font-semibold">Drop images here</p>
          </div>
        )}

        {/* Empty state */}
        {images.length === 0 && !isDragging && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <p className="text-dim text-lg">Pick a hero or upload images</p>
            <div className="flex gap-3">
              <HeroPicker />
              <label className="btn-ghost cursor-pointer text-sm px-3">
                Upload
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFiles(e.target.files)
                      e.target.value = ''
                    }
                  }}
                />
              </label>
            </div>
          </div>
        )}

        <Stage
          ref={stageRef}
          width={window.innerWidth}
          height={window.innerHeight - 48}
          scaleX={stageScale}
          scaleY={stageScale}
          x={stagePos.x}
          y={stagePos.y}
          onWheel={handleWheel}
          onClick={e => { if (e.target === e.target.getStage()) clearSelection() }}
        >
          <Layer>
            <Rect
              width={canvasSize.width}
              height={canvasSize.height}
              fill={backgroundColor}
            />
            {images.map(img => (
              <CanvasImage
                key={img.id}
                img={img}
                isSelected={selectedIds.includes(img.id)}
                onSelect={selectImage}
                onChange={updateImage}
              />
            ))}
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
