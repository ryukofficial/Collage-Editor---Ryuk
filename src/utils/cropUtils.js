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

function splitsToSegments(splits, totalLen) {
  const bounds = []
  let prev = 0
  for (const s of splits) { bounds.push([prev, s]); prev = s }
  bounds.push([prev, totalLen])
  return bounds
}

function findArtRegion(imageData, colLeft, colRight) {
  const { width, height, data } = imageData
  const colW = colRight - colLeft
  const step = Math.max(1, Math.floor(colW / 30))

  const variance = new Float32Array(height)
  for (let y = 0; y < height; y++) {
    let sumR = 0, sumG = 0, sumB = 0, count = 0
    for (let x = colLeft; x < colRight; x += step) {
      const i = (y * width + x) * 4
      sumR += data[i]; sumG += data[i + 1]; sumB += data[i + 2]
      count++
    }
    const mR = sumR / count, mG = sumG / count, mB = sumB / count
    let v = 0
    for (let x = colLeft; x < colRight; x += step) {
      const i = (y * width + x) * 4
      v += (data[i] - mR) ** 2 + (data[i + 1] - mG) ** 2 + (data[i + 2] - mB) ** 2
    }
    variance[y] = v / count
  }

  const smoothed = smooth(variance, Math.floor(height * 0.02))
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

function cropCard(img, colLeft, colRight, artTop, artBottom) {
  const colWidth = colRight - colLeft
  const artHeight = artBottom - artTop
  const size = Math.min(colWidth, artHeight)

  // Center horizontally, crop from the very TOP of the art region
  const srcX = colLeft + Math.floor((colWidth - size) / 2)
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

export async function autoCropSkins(source, numCards, baseName = 'skin') {
  const img = await loadImg(source)
  const { data: imageData } = getImageData(img)

  const W = img.naturalWidth

  const colBright = smooth(columnBrightness(imageData), Math.floor(W * 0.005))
  const colSplits = findSplits(colBright, numCards)
  const colSegments = splitsToSegments(colSplits, W)

  const results = []

  for (let i = 0; i < colSegments.length; i++) {
    const [colLeft, colRight] = colSegments[i]
    const { artTop, artBottom } = findArtRegion(imageData, colLeft, colRight)
    const blob = await cropCard(img, colLeft, colRight, artTop, artBottom)
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
