/**
 * cropUtils.js - Smart skin card auto-cropper
 * Detects card boundaries using dark gap/border detection between cards.
 * Crops from the TOP of each card in 1:1 square. Zero compression PNG.
 */

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = typeof src === 'string' ? src : URL.createObjectURL(src)
  })
}

function getImageData(img) {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  return { canvas, ctx, data: ctx.getImageData(0, 0, canvas.width, canvas.height) }
}

/**
 * For each column x, compute average brightness across all rows (sampled).
 */
function columnBrightness(imageData) {
  const { width, height, data } = imageData
  const step = Math.max(1, Math.floor(height / 100))
  const brightness = new Float32Array(width)
  for (let x = 0; x < width; x++) {
    let sum = 0, count = 0
    for (let y = 0; y < height; y += step) {
      const i = (y * width + x) * 4
      sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
      count++
    }
    brightness[x] = sum / count
  }
  return brightness
}

/**
 * For each row y, compute average brightness across all columns (sampled).
 */
function rowBrightness(imageData) {
  const { width, height, data } = imageData
  const step = Math.max(1, Math.floor(width / 100))
  const brightness = new Float32Array(height)
  for (let y = 0; y < height; y++) {
    let sum = 0, count = 0
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4
      sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
      count++
    }
    brightness[y] = sum / count
  }
  return brightness
}

/**
 * Smooth an array with a moving average window.
 */
function smooth(arr, win) {
  const out = new Float32Array(arr.length)
  for (let i = 0; i < arr.length; i++) {
    let s = 0, c = 0
    for (let d = -win; d <= win; d++) {
      const n = i + d
      if (n >= 0 && n < arr.length) { s += arr[n]; c++ }
    }
    out[i] = s / c
  }
  return out
}

/**
 * Find N-1 split positions in the brightness array.
 * Each split is the darkest point in a search window around the expected position.
 * Returns array of x (or y) positions dividing into N segments.
 */
function findSplits(brightness, numSegments) {
  const len = brightness.length
  const splits = []
  const searchRadius = Math.floor(len / numSegments * 0.4)

  for (let i = 1; i < numSegments; i++) {
    const expected = Math.round(len / numSegments * i)
    const left = Math.max(0, expected - searchRadius)
    const right = Math.min(len - 1, expected + searchRadius)
    let minVal = Infinity, minPos = expected
    for (let x = left; x <= right; x++) {
      if (brightness[x] < minVal) { minVal = brightness[x]; minPos = x }
    }
    splits.push(minPos)
  }
  return splits
}

/**
 * Given splits, build segment boundaries [start, end] pairs.
 */
function splitsToSegments(splits, totalLen) {
  const bounds = []
  let prev = 0
  for (const s of splits) { bounds.push([prev, s]); prev = s }
  bounds.push([prev, totalLen])
  return bounds
}

/**
 * Find the actual art region within a column slice by looking for
 * where the image is NOT flat/UI-like. Returns { top, bottom }.
 *
 * Strategy: find the row range with highest color variance (richest art).
 * Then crop from the very top of that range.
 */
function findArtRegion(imageData, colLeft, colRight) {
  const { width, height, data } = imageData
  const colW = colRight - colLeft
  const step = Math.max(1, Math.floor(colW / 30))

  // Per-row: compute color variance within this column slice
  const variance = new Float32Array(height)
  for (let y = 0; y < height; y++) {
    let sumR = 0, sumG = 0, sumB = 0, count = 0
    for (let x = colLeft; x < colRight; x += step) {
      const i = (y * width + x) * 4
      sumR += data[i]; sumG += data[i+1]; sumB += data[i+2]
      count++
    }
    const mR = sumR/count, mG = sumG/count, mB = sumB/count
    let v = 0
    for (let x = colLeft; x < colRight; x += step) {
      const i = (y * width + x) * 4
      v += (data[i]-mR)**2 + (data[i+1]-mG)**2 + (data[i+2]-mB)**2
    }
    variance[y] = v / count
  }

  const smoothed = smooth(variance, Math.floor(height * 0.02))

  // Find contiguous region with highest variance sum (the art zone)
  const mean = smoothed.reduce((a, b) => a + b) / height
  const threshold = mean * 0.6

  let artTop = 0, artBottom = height
  for (let y = 0; y < height; y++) {
    if (smoothed[y] > threshold) { artTop = y; break }
  }
  for (let y = height - 1; y >= 0; y--) {
    if (smoothed[y] > threshold) { artBottom = y; break }
  }

  return { artTop, artBottom }
}

/**
 * Crop one card: takes the square from the TOP of the art region.
 * Width of crop = full column width. Height = same (1:1 square).
 * Starts from artTop so the face/top of skin is included.
 */
function cropCard(img, colLeft, colRight, artTop, artBottom) {
  const colWidth = colRight - colLeft
  const artHeight = artBottom - artTop
  const size = Math.min(colWidth, artHeight)

  // Center horizontally, start from TOP of art region
  const srcX = colLeft + Math.floor((colWidth - size) / 2)
  const srcY = artTop  // start from the very top of the art

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, srcX, srcY, size, size, 0, 0, size, size)

  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), 'image/png', 1.0)
  })
}

/**
 * Main export.
 * @param {File|string} source - screenshot file or data URL
 * @param {number} numCards - number of skin cards visible
 * @param {string} baseName - base filename for output
 */
export async function autoCropSkins(source, numCards, baseName = 'skin') {
  const img = await loadImg(source)
  const { data: imageData } = getImageData(img)

  const W = img.naturalWidth
  const H = img.naturalHeight

  // Find vertical splits (between columns/cards)
  const colBrightness = smooth(columnBrightness(imageData), Math.floor(W * 0.005))
  const colSplits = findSplits(colBrightness, numCards)
  const colSegments = splitsToSegments(colSplits, W)

  const results = []

  for (let i = 0; i < colSegments.length; i++) {
    const [colLeft, colRight] = colSegments[i]

    // For each column, detect art region (top/bottom)
    const { artTop, artBottom } = findArtRegion(imageData, colLeft, colRight)

    const blob = await cropCard(img, colLeft, colRight, artTop, artBottom)
    results.push({ blob, filename: `${baseName}-skin-${i + 1}.png` })
  }

  return results
}

export function downloadCrops(crops) {
  crops.forEach(({ blob, filename }) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  })
}
