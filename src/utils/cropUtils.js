/**
 * cropUtils.js
 * Auto-crop: given an image with N skin cards in a horizontal grid row,
 * detect each card region and crop it to a 1:1 square at full quality.
 * Zero compression â€” always uses image/png with quality 1.0.
 */

/**
 * Loads a File or data-URL string into an HTMLImageElement.
 */
function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = typeof src === 'string' ? src : URL.createObjectURL(src)
  })
}

/**
 * Converts an HTMLImageElement to an ImageData via an offscreen canvas.
 */
function getImageData(img) {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/**
 * Computes per-column brightness variance to find vertical "dividers"
 * between skin cards. Returns an array of x-positions where card columns start/end.
 *
 * Strategy:
 *   1. Sample pixel brightness for each column.
 *   2. Compute a smoothed brightness profile.
 *   3. Find local minima (dark dividers / gaps between cards).
 *   4. Cluster minima into N-1 split points for N cards.
 */
function findColumnSplits(imageData, numCards) {
  const { width, height, data } = imageData

  // Sample brightness column by column (skip every 4 rows for speed)
  const step = Math.max(1, Math.floor(height / 80))
  const brightness = new Float32Array(width)

  for (let x = 0; x < width; x++) {
    let sum = 0
    let count = 0
    for (let y = 0; y < height; y += step) {
      const idx = (y * width + x) * 4
      const b = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114)
      sum += b
      count++
    }
    brightness[x] = sum / count
  }

  // Smooth brightness profile (moving average, window = ~1% of width)
  const win = Math.max(3, Math.floor(width * 0.01))
  const smoothed = new Float32Array(width)
  for (let x = 0; x < width; x++) {
    let s = 0, c = 0
    for (let dx = -win; dx <= win; dx++) {
      const nx = x + dx
      if (nx >= 0 && nx < width) { s += brightness[nx]; c++ }
    }
    smoothed[x] = s / c
  }

  // If numCards is provided and > 1, divide evenly as fallback baseline
  // but try to find real splits first using local minima
  const splits = findNSplits(smoothed, numCards)
  return splits
}

/**
 * Find N-1 x-positions that best split the image into N equal-ish columns
 * by looking for local brightness minima near the expected split positions.
 */
function findNSplits(smoothed, numCards) {
  const width = smoothed.length
  if (numCards <= 1) return []

  const splits = []
  const searchRadius = Math.floor(width / numCards * 0.35) // search Â±35% of cell width

  for (let i = 1; i < numCards; i++) {
    const expectedX = Math.round((width / numCards) * i)
    const left = Math.max(0, expectedX - searchRadius)
    const right = Math.min(width - 1, expectedX + searchRadius)

    // Find the darkest x in the search window
    let minVal = Infinity
    let minX = expectedX
    for (let x = left; x <= right; x++) {
      if (smoothed[x] < minVal) { minVal = smoothed[x]; minX = x }
    }
    splits.push(minX)
  }

  return splits
}

/**
 * Detect the top/bottom bounds of the skin artwork area within a column slice.
 * Looks for the row range that contains the richest color variation
 * (i.e. the art region vs flat UI chrome above/below).
 */
function detectArtRows(imageData, colLeft, colRight) {
  const { width, height, data } = imageData
  const step = Math.max(1, Math.floor((colRight - colLeft) / 20))

  // Compute per-row color saturation average within this column slice
  const saturation = new Float32Array(height)
  for (let y = 0; y < height; y++) {
    let sat = 0, count = 0
    for (let x = colLeft; x < colRight; x += step) {
      const idx = (y * width + x) * 4
      const r = data[idx] / 255
      const g = data[idx + 1] / 255
      const b = data[idx + 2] / 255
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      sat += max === 0 ? 0 : (max - min) / max
      count++
    }
    saturation[y] = sat / count
  }

  // Smooth saturation
  const win = Math.max(2, Math.floor(height * 0.02))
  const smoothed = new Float32Array(height)
  for (let y = 0; y < height; y++) {
    let s = 0, c = 0
    for (let dy = -win; dy <= win; dy++) {
      const ny = y + dy
      if (ny >= 0 && ny < height) { s += saturation[ny]; c++ }
    }
    smoothed[y] = s / c
  }

  // Find the contiguous row range with highest average saturation
  // (this isolates the art from flat UI chrome)
  const threshold = smoothed.reduce((a, b) => a + b, 0) / height * 0.8
  let artTop = 0, artBottom = height

  // Find first row above threshold from top
  for (let y = 0; y < height; y++) {
    if (smoothed[y] >= threshold) { artTop = Math.max(0, y - win); break }
  }
  // Find last row above threshold from bottom
  for (let y = height - 1; y >= 0; y--) {
    if (smoothed[y] >= threshold) { artBottom = Math.min(height, y + win); break }
  }

  return { artTop, artBottom }
}

/**
 * Crops one card region from the source image into a 1:1 PNG blob.
 * Uses center-x, upper-biased-y to focus on face/character art.
 * Zero compression (image/png, 1.0).
 */
function cropCardToSquare(img, colLeft, colRight, artTop, artBottom) {
  const colWidth = colRight - colLeft
  const artHeight = artBottom - artTop
  const size = Math.min(colWidth, artHeight)

  // Center horizontally within the column
  const srcX = colLeft + Math.floor((colWidth - size) / 2)
  // Bias upward (0.35 from top of art region) to hit face/bust rather than feet
  const srcY = artTop + Math.floor((artHeight - size) * 0.35)

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  ctx.drawImage(
    img,
    srcX, srcY, size, size,  // source: square crop
    0, 0, size, size          // dest: full canvas
  )

  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), 'image/png', 1.0)
  })
}

/**
 * Main export: given a File or data-URL and the number of skin cards in the image,
 * returns an array of { blob, filename } objects â€” one per card, lossless PNG.
 *
 * @param {File|string} source  - The screenshot file or data URL
 * @param {number} numCards     - How many skin cards are visible in the row
 * @param {string} [baseName]   - Optional base name for output files
 * @returns {Promise<Array<{blob: Blob, filename: string}>>}
 */
export async function autoCropSkins(source, numCards, baseName = 'skin') {
  const img = await loadImg(source)
  const imageData = getImageData(img)

  const splits = findColumnSplits(imageData, numCards)

  // Build column boundaries from splits
  const colBounds = []
  let prev = 0
  for (const splitX of splits) {
    colBounds.push([prev, splitX])
    prev = splitX
  }
  colBounds.push([prev, img.naturalWidth])

  const results = []
  for (let i = 0; i < colBounds.length; i++) {
    const [colLeft, colRight] = colBounds[i]
    const { artTop, artBottom } = detectArtRows(imageData, colLeft, colRight)
    const blob = await cropCardToSquare(img, colLeft, colRight, artTop, artBottom)
    results.push({
      blob,
      filename: `${baseName}-${i + 1}.png`,
    })
  }

  return results
}

/**
 * Downloads all cropped blobs as individual PNG files.
 */
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
