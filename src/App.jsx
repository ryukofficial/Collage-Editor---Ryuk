import React, { useRef } from 'react'
import { Stage, Layer, Image as KonvaImage, Rect } from 'react-konva'
import { Toaster } from 'react-hot-toast'
import useStore from './store/useStore'
import { useDrop } from './useDrop'
import { useExport } from './useExport'
import { useKeyboard } from './useKeyboard'
import useImage from 'use-image'

function CanvasImage({ img, isSelected, onSelect, onChange }) {
  const [image] = useImage(img.src)
  return (
    <KonvaImage
      image={image}
      x={img.x} y={img.y}
      width={img.width} height={img.height}
      scaleX={img.scaleX} scaleY={img.scaleY}
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
  const { exportAs } = useExport(stageRef)

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

  return (
    <div className="flex flex-col h-screen bg-void text-text overflow-hidden">
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#1a1a26', color: '#c8c8e8', border: '1px solid #252535' } }} />

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-panel border-b border-border shrink-0">
        <span className="font-display font-bold text-lg text-gradient">PixelForge</span>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={undo}>Undo</button>
          <button className="btn-ghost" onClick={redo}>Redo</button>
          <button className="btn-ghost" onClick={clearAll}>Clear</button>
          <button className="btn-primary" onClick={() => exportAs('png')}>Export PNG</button>
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none">
            <p className="text-dim text-lg">Drop images here or click Upload</p>
            <button
  className="btn-primary pointer-events-auto cursor-pointer"
  onClick={() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = 'image/*'
    input.onchange = (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files)
      }
    }
    document.body.appendChild(input)
    input.click()
    document.body.removeChild(input)
  }}
>
  Upload Images
</button>
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
            <Rect width={canvasSize.width} height={canvasSize.height} fill={backgroundColor} />
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
