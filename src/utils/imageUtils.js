export function loadImageFiles(files, { onProgress } = {}) {
  return new Promise((resolve) => {
    const results  = []
    const errors   = []
    const fileArray = Array.from(files)
    let completed  = 0
    if (fileArray.length === 0) { resolve({ results, errors }); return }

    fileArray.forEach((file) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          results.push({
            src: e.target.result,
            name: file.name,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            fileSize: file.size,
          })
          completed++
          onProgress && onProgress(completed / fileArray.length)
          if (completed === fileArray.length) resolve({ results, errors })
        }
        img.onerror = () => {
          errors.push(file.name)
          completed++
          if (completed === fileArray.length) resolve({ results, errors })
        }
        img.src = e.target.result
      }
      reader.onerror = () => {
        errors.push(file.name)
        completed++
        if (completed === fileArray.length) resolve({ results, errors })
      }
      reader.readAsDataURL(file)
    })
  })
}

// ── Robust image loader ──────────────────────────────────────────────────────
// Retries transient failures (dropped connections, CDN throttling, timeouts)
// instead of giving up on the first error. Each attempt also has its own
// timeout so a hung request can't stall forever.
function loadImg(src, { retries = 3, retryDelayMs = 700, timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    let attempt = 0

    const attemptLoad = () => {
      attempt++
      const img = new Image()
      img.crossOrigin = 'anonymous'
      let settled = false

      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        img.onload = null
        img.onerror = null
        img.src = ''
        onFail(new Error('Timed out loading: ' + src))
      }, timeoutMs)

      img.onload = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(img)
      }
      img.onerror = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        onFail(new Error('Failed to load: ' + src))
      }
      img.src = src
    }

    const onFail = (err) => {
      if (attempt < retries) {
        setTimeout(attemptLoad, retryDelayMs * attempt) // linear backoff
      } else {
        reject(err)
      }
    }

    attemptLoad()
  })
}

// ── Concurrency-limited map ────────────────────────────────────────────────
// Firing 100-200+ simultaneous image requests (one giant Promise.all) is what
// causes intermittent blank cells on export — some requests get throttled or
// dropped, especially on slower connections. This runs a bounded number of
// loads at once instead, which is both more reliable and easier on the CDN.
async function mapWithConcurrency(items, limit, iteratee) {
  const results = new Array(items.length)
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++
      results[idx] = await iteratee(items[idx], idx)
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker)
  await Promise.all(workers)
  return results
}

export async function exportCollage(images, backgroundColor, profileImageSrc = null, options = {}) {
  const { onProgress, onImageError, concurrency = 10 } = options
  if (!images.length) return null

  const cols = Math.ceil(Math.sqrt(images.length))
  const rows = Math.ceil(images.length / cols)

  let profEl  = null
  let bannerH = 0
  if (profileImageSrc) {
    try { profEl = await loadImg(profileImageSrc) } catch { profEl = null }
  }

  let collageW, cellSize

  if (profEl) {
    collageW = profEl.naturalWidth
    cellSize = Math.floor(collageW / cols)
    collageW = cols * cellSize
    bannerH  = Math.round(profEl.naturalHeight * (collageW / profEl.naturalWidth))
  } else {
    const maxDim = images.reduce((m, i) => Math.max(m, i.naturalWidth, i.naturalHeight), 0)
    cellSize = maxDim || 300
    collageW = cols * cellSize
  }

  const collageH = rows * cellSize
  const totalH   = bannerH + collageH

  const canvas  = document.createElement('canvas')
  canvas.width  = collageW
  canvas.height = totalH
  const ctx = canvas.getContext('2d', { alpha: false })

  ctx.fillStyle = backgroundColor || '#000000'
  ctx.fillRect(0, 0, collageW, totalH)

  if (profEl) {
    const drawH = Math.round(profEl.naturalHeight * (collageW / profEl.naturalWidth))
    ctx.drawImage(profEl, 0, 0, collageW, drawH)
  }

  let done = 0
  const failed = []

  await mapWithConcurrency(images, concurrency, async (img, i) => {
    try {
      const el = await loadImg(img.src)

      const col   = i % cols
      const row   = Math.floor(i / cols)
      const destX = col * cellSize
      const destY = bannerH + row * cellSize

      let srcX, srcY, srcW, srcH

      if (img.cropW && img.cropH) {
        // Use stored crop from HeroPicker / AutoCollage
        srcX = img.cropX ?? 0
        srcY = img.cropY ?? 0
        srcW = img.cropW
        srcH = img.cropH
      } else {
        // Fallback: center-square crop for manually uploaded images
        const srcSize = Math.min(el.naturalWidth, el.naturalHeight)
        srcX = (el.naturalWidth  - srcSize) / 2
        srcY = (el.naturalHeight - srcSize) / 2
        srcW = srcSize
        srcH = srcSize
      }

      ctx.drawImage(el, srcX, srcY, srcW, srcH, destX, destY, cellSize, cellSize)
    } catch (err) {
      failed.push({ name: img.name || img.src, src: img.src })
      onImageError && onImageError(img, err)
    } finally {
      done++
      onProgress && onProgress(done / images.length)
    }
  })

  if (failed.length) {
    console.warn(`exportCollage: ${failed.length} image(s) failed to load after retries:`, failed)
  }

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Canvas export produced empty blob')),
      'image/png',
      1.0
    )
  })

  // Attach failure info to the blob so callers can surface it without
  // changing the function's return type (still just a Blob).
  blob.failedImages = failed
  return blob
}

export function downloadBlob(blob, filename) {
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
