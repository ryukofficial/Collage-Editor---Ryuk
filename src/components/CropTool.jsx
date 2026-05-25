import React, { useRef, useState } from 'react'
import { autoCropSkins, downloadCrops } from '../utils/cropUtils'

/**
 * CropTool
 * Drop this component anywhere in your app (e.g. inside App.jsx header or a sidebar).
 * It adds a self-contained "Auto Crop Skins" button that:
 *   1. Lets you pick a screenshot
 *   2. Asks how many skin cards are in it
 *   3. Auto-crops each one to 1:1 PNG, zero compression
 *   4. Downloads them all individually
 *
 * Does NOT touch any existing store, canvas, or export logic.
 */
export default function CropTool() {
  const fileInputRef = useRef()
  const [status, setStatus] = useState(null)   // null | 'picking' | 'processing' | 'done' | 'error'
  const [cardCount, setCardCount] = useState(5)
  const [pendingFile, setPendingFile] = useState(null)
  const [showPanel, setShowPanel] = useState(false)
  const [results, setResults] = useState([])
  const [previewUrls, setPreviewUrls] = useState([])

  const reset = () => {
    setStatus(null)
    setPendingFile(null)
    setResults([])
    setPreviewUrls(prev => { prev.forEach(URL.revokeObjectURL); return [] })
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPendingFile(file)
    setStatus('picking')
  }

  const handleCrop = async () => {
    if (!pendingFile) return
    setStatus('processing')
    try {
      const crops = await autoCropSkins(pendingFile, cardCount, pendingFile.name.replace(/\.[^.]+$/, ''))
      // Build preview URLs
      const urls = crops.map(c => URL.createObjectURL(c.blob))
      setResults(crops)
      setPreviewUrls(urls)
      setStatus('done')
    } catch (err) {
      console.error('CropTool error:', err)
      setStatus('error')
    }
  }

  const handleDownloadAll = () => {
    downloadCrops(results)
  }

  const handleDownloadOne = (idx) => {
    downloadCrops([results[idx]])
  }

  return (
    <>
      {/* Trigger button — matches your existing btn-ghost style */}
      <button
        className="btn-ghost"
        onClick={() => { setShowPanel(v => !v); reset() }}
        title="Auto-crop skin cards from a screenshot"
      >
        Crop Skins
      </button>

      {/* Panel — floats below header */}
      {showPanel && (
        <div
          style={{
            position: 'fixed',
            top: '52px',
            right: '12px',
            zIndex: 1000,
            background: '#1a1a26',
            border: '1px solid #252535',
            borderRadius: '10px',
            padding: '16px',
            width: '340px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            fontFamily: 'DM Sans, sans-serif',
            color: '#c8c8e8',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontWeight: 600, fontSize: '14px', color: '#eeeef8' }}>Auto Crop Skins</span>
            <button
              onClick={() => { setShowPanel(false); reset() }}
              style={{ background: 'none', border: 'none', color: '#4a4a6a', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}
            >
              ×
            </button>
          </div>

          {/* Step 1: Upload */}
          {status === null && (
            <>
              <p style={{ fontSize: '12px', color: '#4a4a6a', marginBottom: '12px', lineHeight: 1.5 }}>
                Upload a screenshot containing skin cards in a row. Each card will be auto-cropped to 1:1 PNG at full quality.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <button
                className="btn-primary"
                style={{ width: '100%' }}
                onClick={() => fileInputRef.current.click()}
              >
                Upload Screenshot
              </button>
            </>
          )}

          {/* Step 2: Set card count & confirm */}
          {status === 'picking' && pendingFile && (
            <>
              <p style={{ fontSize: '12px', color: '#8888aa', marginBottom: '10px' }}>
                📄 {pendingFile.name}
              </p>
              <label style={{ fontSize: '12px', color: '#8888aa', display: 'block', marginBottom: '6px' }}>
                How many skin cards are in this image?
              </label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '14px' }}>
                {[2, 3, 4, 5, 6, 7, 8].map(n => (
                  <button
                    key={n}
                    onClick={() => setCardCount(n)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: `1px solid ${cardCount === n ? '#6c63ff' : '#252535'}`,
                      background: cardCount === n ? 'rgba(108,99,255,0.2)' : 'transparent',
                      color: cardCount === n ? '#a89fff' : '#4a4a6a',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: cardCount === n ? 600 : 400,
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-ghost" style={{ flex: 1 }} onClick={reset}>Back</button>
                <button className="btn-primary" style={{ flex: 2 }} onClick={handleCrop}>
                  Crop {cardCount} Skins
                </button>
              </div>
            </>
          )}

          {/* Processing */}
          {status === 'processing' && (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#8888aa', fontSize: '13px' }}>
              <div style={{ marginBottom: '8px', fontSize: '20px' }}>⚙️</div>
              Detecting and cropping {cardCount} skin cards...
            </div>
          )}

          {/* Done — previews + download */}
          {status === 'done' && (
            <>
              <p style={{ fontSize: '12px', color: '#8888aa', marginBottom: '10px' }}>
                ✅ {results.length} crops ready — zero compression PNG
              </p>

              {/* Preview grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
                gap: '6px',
                marginBottom: '12px',
              }}>
                {previewUrls.map((url, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img
                      src={url}
                      alt={`Skin ${i + 1}`}
                      style={{
                        width: '100%',
                        aspectRatio: '1',
                        objectFit: 'cover',
                        borderRadius: '6px',
                        border: '1px solid #252535',
                        display: 'block',
                        cursor: 'pointer',
                      }}
                      onClick={() => handleDownloadOne(i)}
                      title={`Download skin ${i + 1}`}
                    />
                    <div style={{
                      position: 'absolute', bottom: '3px', right: '3px',
                      background: 'rgba(0,0,0,0.6)', borderRadius: '4px',
                      fontSize: '9px', color: '#8888aa', padding: '1px 4px',
                      pointerEvents: 'none',
                    }}>
                      ↓
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-ghost" style={{ flex: 1 }} onClick={reset}>New Crop</button>
                <button className="btn-primary" style={{ flex: 2 }} onClick={handleDownloadAll}>
                  Download All ({results.length})
                </button>
              </div>
            </>
          )}

          {/* Error */}
          {status === 'error' && (
            <>
              <p style={{ fontSize: '12px', color: '#ff6b6b', marginBottom: '12px' }}>
                Something went wrong detecting the skin cards. Try a cleaner screenshot.
              </p>
              <button className="btn-ghost" style={{ width: '100%' }} onClick={reset}>Try Again</button>
            </>
          )}
        </div>
      )}
    </>
  )
}
