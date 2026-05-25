/**
 * cropUtils.js - ML Skin card auto-cropper
 * 
 * Handles the standard ML shop layout:
 * - Left sidebar ~17% of image width (ignored)
 * - 5 skin cards evenly across the remaining space
 * - Each card: art fills top ~78%, name+button at bottom ~22%
 * - Crops the art portion only, 1:1 square from top, zero compression PNG
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
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/**
 * Compute average brightness for each column (x) between rowStart and rowEnd.
 */
function columnBrightnessInRange(imageData, rowStart, rowEnd) {
  const { width, data } = imageData
  const step = Math.max(1, Math.floor((rowEnd - rowStart) / 60))
  const brightness = new Float32Array(width)
  for (let x = 0; x < width; x++) {
    let sum = 0, count = 0
    for (let y = rowStart; y < rowEnd; y += step) {
      const i = (y * width + x) * 4
      sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
      count++
    }
    brightness[x] = sum / count
  }
  return brightness
}

/**
 * Compute average brightness for each row (y) between colStart and colEnd.
 */
function rowBrightnessInRange(imageData, colStart, colEnd) {
  const { width, height, data } = imageData
  const step = Math.max(1, Math.floor((colEnd - colStart) / 60))
  const brightness = new Float32Array(height)
  for (let y = 0; y < height; y++) {
    let sum = 0, count = 0
    for (let x = colStart; x < colEnd; x += step) {
      const i = (y * width + x) * 4
      sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
      count++
    }
    brightness[y] = sum / count
  }
  return brightness
}

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
 * Find the darkest N-1 positions to split into N segments.
 * Searches near expected positions with a radius.
 */
function findSplits(brightness, numSegments, rangeStart, rangeEnd) {
  const len = rangeEnd - rangeStart
  const splits = []
  const searchRadius = Math.floor(len / numSegments * 0.3)

  for (let i = 1; i < numSegments; i++) {
    const expected = rangeStart + Math.round(len / numSegments * i)
    const left = Math.max(rangeStart, expected - searchRadius)
    const right = Math.min(rangeEnd - 1, expected + searchRadius)
    let minVal = Infinity, minPos = expected
    for (let x = left; x <= right; x++) {
      if (brightness[x] < minVal) { minVal = brightness[x]; minPos = x }
    }
    splits.push(minPos)
  }
  return splits
}

/**
 * Find where the sidebar ends by looking for a sharp brightness increase
 * going left-to-right (sidebar is dark, card area is brighter/more colorful).
 * Searches only in the left 30% of the image.
 */
function detectSidebarEnd(imageData) {
  const { width, height } = imageData
  const searchLimit = Math.floor(width * 0.30)
  const midRow = Math.floor(height * 0.5)
  const rowH = Math.floor(height * 0.3)

  const brightness = columnBrightnessInRange(imageData, midRow - rowH, midRow + rowH)
  const sm = smooth(brightness, Math.floor(width * 0.005))

  // Find where brightness jumps up significantly â€” that's where cards start
  // Look for the first x where brightness exceeds the mean of the left portion
  let leftMean = 0
  for (let x = 0; x < searchLimit; x++) leftMean += sm[x]
  leftMean /= searchLimit

  // Walk left to right, find first x past 10% where it clearly exceeds leftMean * 1.3
  for (let x = Math.floor(width * 0.10); x < searchLimit; x++) {
    if (sm[x] > leftMean * 1.3) return x
  }

  // Fallback: assume sidebar is 17% of width
  return Math.floor(width * 0.17)
}

/**
 * Detect the top of the card grid by finding where colorful art starts.
 * Looks for the first row (from top) where brightness jumps into the card zone.
 */
function detectCardGridTop(imageData, colStart, colEnd) {
  const { height } = imageData
  const brightness = rowBrightnessInRange(imageData, colStart, colEnd)
  const sm = smooth(brightness, Math.floor(height * 0.01))

  // Compute mean brightness of the whole column range
  let mean = 0
  for (let y = 0; y < height; y++) mean += sm[y]
  mean /= height

  // Find first row from top that is above mean (card art is bright/colorful)
  // Skip the very top UI bar (top 8%)
  const skipTop = Math.floor(height * 0.08)
  for (let y = skipTop; y < height; y++) {
    if (sm[y] > mean * 0.85) return y
  }
  return skipTop
}

/**
 * Detect the bottom of a card's art region (where the name text bar starts).
 * The name+button area at the bottom is typically darker/more uniform.
 * We find the row where brightness drops and stays low near the bottom.
 */
function detectCardArtBottom(imageData, colStart, colEnd, gridTop) {
  const { height } = imageData
  const brightness = rowBrightnessInRange(imageData, colStart, colEnd)
  const sm = smooth(brightness, Math.floor(height * 0.008))

  // The name bar starts somewhere in the bottom 30% of the card area
  // Look for a sustained dark band from the bottom going up
  const searchFrom = Math.floor(gridTop + (height - gridTop) * 0.55)
  const searchTo = height

  let mean = 0
  for (let y = searchFrom; y < searchTo; y++) mean += sm[y]
  mean /= (searchTo - searchFrom)

  // Find where brightness drops (name/button area)
  for (let y = searchFrom; y < searchTo; y++) {
    if (sm[y] < mean * 0.75) return y
  }

  // Fallback: art takes top 78% of card area
  return Math.floor(gridTop + (height - gridTop) * 0.78)
}

/**
 * Crop one card to 1:1 square from the top of the art region.
 * Zero compression PNG.
 */
function cropCard(img, colLeft, colRight, artTop, artBottom) {
  const colWidth = colRight - colLeft
  const artHeight = artBottom - artTop
  const size = Math.min(colWidth, artHeight)

  // Center horizontally within the card column
  const srcX = colLeft + Math.floor((colWidth - size) / 2)
  // Start from very top of art
  const srcY = artTop

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
 * @param {number} numCards - number of skin cards visible in the row
 * @param {string} baseName - base filename for outputs
 */
export async function autoCropSkins(source, numCards, baseName = 'skin') {
  const img = await loadImg(source)
  const imageData = getImageData(img)

  const W = img.naturalWidth
  const H = img.naturalHeight

  // Step 1: Find where sidebar ends and cards begin
  const cardsStart = detectSidebarEnd(imageData)

  // Step 2: Detect top of the card grid (skip top UI bar)
  const gridTop = detectCardGridTop(imageData, cardsStart, W)

  // Step 3: Find the bottom of the art area
  const artBottom = detectCardArtBottom(imageData, cardsStart, W, gridTop)

  // Step 4: Split the card area into N columns using brightness gaps
  const midRow = Math.floor(gridTop + (artBottom - gridTop) * 0.4)
  const rowH = Math.floor((artBottom - gridTop) * 0.3)
  const colBright = smooth(
    columnBrightnessInRange(imageData, midRow - rowH, midRow + rowH),
    Math.floor(W * 0.003)
  )
  const splits = findSplits(colBright, numCards, cardsStart, W)

  // Build column segments
  const colBounds = []
  let prev = cardsStart
  for (const s of splits) { colBounds.push([prev, s]); prev = s }
  colBounds.push([prev, W])

  // Step 5: Crop each card
  const results = []
  for (let i = 0; i < colBounds.length; i++) {
    const [colLeft, colRight] = colBounds[i]
    const blob = await cropCard(img, colLeft, colRight, gridTop, artBottom)
    results.push({ blob, filename: `${baseName}-skin-${i + 1}.png` })
  }

  return results
}

export function downloadCrops(crops) {
  crops.forEach(({ blob, filename }, index) => {
    setTimeout(() => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      setTimeout(() => {
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }, 500)
    }, index * 300)
  })
}
