import React, { useRef, useState, useEffect, useCallback } from 'react'
import { downloadCrops } from '../utils/cropUtils'

/**
 * CropTool - Tap-to-crop skin tool
 * Upload a screenshot → tap each skin card → it crops 1:1 → download all
 * Zero compression PNG output.
 */
export default function CropTool() {
  const [showPanel, setShowPanel] = useState(false)
  const [imgSrc, setImgSrc] = useState(null)
  const [imgNaturalW, setImgNaturalW] = useState(0)
  const [imgNaturalH, setImgNaturalH] = useState(0)
  const [crops, setCrops] = useState([])       // { blob, filename, previewUrl, x, y }
  const [cropSize, setCropSize] = useState(300) // size in natural pixels
  const [status, setStatus] = useState('idle') // idle | loaded | done
  const [preview, setPreview] = useState(null) // show a hover preview box

  const fileInputRef = useRef()
  const canvasRef = useRef()
  const imgRef = useRef()
  const containerRef = useRef()

  // Scale factor: displayed size vs natural size
  const [scale, setScale] = useState(1)

  const reset = () => {
    setImgSrc(null)
    setCrops([])
    setStatus('idle')
    setPreview(null)
  }

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const url = URL.createObjectURL(file)
    setImgSrc(url)
    setCrops([])
    setStatus('loaded')
  }

  // When image loads, compute scale
  const handleImgLoad = (e) => {
    const img = e.target
    setImgNaturalW(img.naturalWidth)
    setImgNaturalH(img.naturalHeight)
    // displayed width is container width
    if (containerRef.current) {
      const dispW = containerRef.current.clientWidth
      setScale(dispW / img.naturalWidth)
      // set cropSize to ~20% of image width as default (one skin card)
      setCropSize(Math.floor(img.naturalWidth * 0.18))
    }
  }

  // On tap/click: crop a 1:1 square centered on click position
  const handleImageClick = useCallback(async (e) => {
    if (status !== 'loaded') return
    const img = imgRef.current
    if (!img) return

    const rect = img.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top

    // Convert to natural pixels
    const natX = clickX / scale
    const natY = clickY / scale

    const half = cropSize / 2
    const srcX = Math.max(0, Math.min(imgNaturalW - cropSize, natX - half))
    const srcY = Math.max(0, Math.min(imgNaturalH - cropSize, natY - half))

    // Draw crop on offscreen canvas
    const canvas = document.createElement('canvas')
    canvas.width = cropSize
    canvas.height = cropSize
    const ctx = canvas.getContext('2d')

    // Draw from natural image
    const naturalImg = new Image()
    naturalImg.onload = () => {
      ctx.drawImage(naturalImg, srcX, srcY, cropSize, cropSize, 0, 0, cropSize, cropSize)
      canvas.toBlob(blob => {
        const previewUrl = URL.createObjectURL(blob)
        setCrops(prev => [...prev, {
          blob,
          filename: `skin-${prev.length + 1}.png`,
          previewUrl,
          // store display coords for the marker dot
          dotX: clickX,
          dotY: clickY,
        }])
      }, 'image/png', 1.0)
    }
    naturalImg.src = imgSrc
  }, [status, scale, cropSize, imgNaturalW, imgNaturalH, imgSrc])

  // Mouse move: show preview box
  const handleMouseMove = useCallback((e) => {
    if (status !== 'loaded') return
    const img = imgRef.current
    if (!img) return
    const rect = img.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const halfDisp = (cropSize * scale) / 2
    setPreview({ x: x - halfDisp, y: y - halfDisp, size: cropSize * scale })
  }, [status, scale, cropSize])

  const handleMouseLeave = () => setPreview(null)

  const handleDownloadAll = () => {
    downloadCrops(crops)
  }

  const removeCrop = (idx) => {
    setCrops(prev => prev.filter((_, i) => i !== idx))
  }

  return (
    <>
      <button
        className="btn-ghost"
        onClick={() => { setShowPanel(v => !v); reset() }}
      >
        Crop Skins
      </button>

      {showPanel && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2000,
          background: 'rgba(5,5,7,0.95)',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'DM Sans, sans-serif',
          color: '#c8c8e8',
        }}>
          {/* Top bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid #252535',
            background: '#1a1a26',
            shrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontWeight: 700, fontSize: '15px', color: '#eeeef8' }}>
                Crop Skins
              </span>
              {status === 'loaded' && (
                <span style={{ fontSize: '12px', color: '#6c63ff' }}>
                  Tap each skin to crop it
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {status === 'loaded' && (
                <>
                  {/* Crop size slider */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', color: '#4a4a6a' }}>Size</span>
                    <input
                      type="range"
                      min={Math.floor(imgNaturalW * 0.08)}
                      max={Math.floor(imgNaturalW * 0.35)}
                      value={cropSize}
                      onChange={e => setCropSize(Number(e.target.value))}
                      style={{ width: '80px' }}
                    />
                    <span style={{ fontSize: '11px', color: '#4a4a6a', minWidth: '36px' }}>
                      {cropSize}px
                    </span>
                  </div>
                  <button className="btn-ghost" onClick={reset} style={{ fontSize: '12px' }}>
                    New
                  </button>
                </>
              )}
              {crops.length > 0 && (
                <button className="btn-primary" onClick={handleDownloadAll} style={{ fontSize: '12px' }}>
                  Download All ({crops.length})
                </button>
              )}
              <button
                onClick={() => { setShowPanel(false); reset() }}
                style={{
                  background: 'none', border: 'none',
                  color: '#4a4a6a', cursor: 'pointer',
                  fontSize: '20px', lineHeight: 1, padding: '0 4px',
                }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Main area */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

            {/* Image panel */}
            <div
              ref={containerRef}
              style={{
                flex: 1,
                overflow: 'auto',
                position: 'relative',
                display: 'flex',
                alignItems: status === 'idle' ? 'center' : 'flex-start',
                justifyContent: status === 'idle' ? 'center' : 'flex-start',
              }}
            >
              {status === 'idle' && (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: '#4a4a6a', marginBottom: '16px', fontSize: '14px' }}>
                    Upload your ML shop screenshot
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleFile}
                  />
                  <button
                    className="btn-primary"
                    onClick={() => fileInputRef.current.click()}
                  >
                    Upload Screenshot
                  </button>
                </div>
              )}

              {status === 'loaded' && imgSrc && (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img
                    ref={imgRef}
                    src={imgSrc}
                    alt="screenshot"
                    onLoad={handleImgLoad}
                    onClick={handleImageClick}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                    style={{
                      display: 'block',
                      width: '100%',
                      cursor: 'crosshair',
                      userSelect: 'none',
                    }}
                    draggable={false}
                  />

                  {/* Hover preview box */}
                  {preview && (
                    <div style={{
                      position: 'absolute',
                      left: preview.x,
                      top: preview.y,
                      width: preview.size,
                      height: preview.size,
                      border: '2px solid #6c63ff',
                      borderRadius: '4px',
                      background: 'rgba(108,99,255,0.1)',
                      pointerEvents: 'none',
                      boxSizing: 'border-box',
                    }} />
                  )}

                  {/* Dot markers for already-cropped spots */}
                  {crops.map((c, i) => (
                    <div
                      key={i}
                      style={{
                        position: 'absolute',
                        left: c.dotX - 10,
                        top: c.dotY - 10,
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: '#6c63ff',
                        border: '2px solid #fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        fontWeight: 700,
                        color: '#fff',
                        pointerEvents: 'none',
                        zIndex: 10,
                      }}
                    >
                      {i + 1}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right sidebar: cropped thumbnails */}
            {crops.length > 0 && (
              <div style={{
                width: '160px',
                borderLeft: '1px solid #252535',
                background: '#12121a',
                overflowY: 'auto',
                padding: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                flexShrink: 0,
              }}>
                <p style={{ fontSize: '11px', color: '#4a4a6a', margin: '0 0 4px' }}>
                  {crops.length} crop{crops.length > 1 ? 's' : ''}
                </p>
                {crops.map((c, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img
                      src={c.previewUrl}
                      alt={`Crop ${i + 1}`}
                      style={{
                        width: '100%',
                        aspectRatio: '1',
                        objectFit: 'cover',
                        borderRadius: '6px',
                        border: '1px solid #252535',
                        display: 'block',
                        cursor: 'pointer',
                      }}
                      onClick={() => downloadCrops([c])}
                      title="Click to download"
                    />
                    <div style={{
                      position: 'absolute',
                      top: '3px',
                      left: '5px',
                      fontSize: '10px',
                      fontWeight: 700,
                      color: '#fff',
                      textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                    }}>
                      {i + 1}
                    </div>
                    <button
                      onClick={() => removeCrop(i)}
                      style={{
                        position: 'absolute',
                        top: '2px',
                        right: '2px',
                        background: 'rgba(0,0,0,0.7)',
                        border: 'none',
                        borderRadius: '50%',
                        color: '#ff6b6b',
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        lineHeight: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
                }
                      
