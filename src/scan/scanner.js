// ─────────────────────────────────────────────────────────────────────────────
// Auto Collage reader — runs fully on the phone.
//
//   screenshot ─► prepared off the main thread (3 grey versions, as PGM)
//              ─► read by a small pool of text readers working side by side
//              ─► matched against the closed list of skins (match.js)
//
// Faster than before because: the text reader is served by our own site and
// kept on the phone (no CDN, works on weak internet after the first time);
// the three readings of a screenshot run at the same time on 2–3 readers;
// preparing pictures never blocks the page; no PNG encoding before reading.
// Accuracy is unchanged: same three readings, same closer look, same matching.
// ─────────────────────────────────────────────────────────────────────────────
import { matchPages, sortByPosition, wordsFromOcr, fuzzyFind, codes, squash, norm } from './match.js'
import { prepareShot } from './prepare.js'

const LEVELS = [1, 1.6, 2.4]       // how big a screenshot is read; bigger levels = "look closer"
const MAX_CLOSER_PAGES = 2         // stop trying closer looks after this many screenshots where they didn't help
const SCANNER_BUILD = 6
const BASE = { workerPath: '/ocr/worker.min.js', langPath: '/ocr', gzip: true, workerBlobURL: false }
const ENGINES = [
  { id: 'automatic', corePath: '/ocr/core' },
  { id: 'basic', corePath: '/ocr/core/tesseract-core-lstm.wasm.js' },
]
const ENGINE_KEY = 'ryuk_ocr_engine2'
const abortError = () => new DOMException('Scan cancelled', 'AbortError')

export function poolSize() {
  const mem = navigator.deviceMemory || 4, cores = navigator.hardwareConcurrency || 4
  const byMem = mem <= 2 ? 1 : mem <= 4 ? 2 : 3
  return Math.max(1, Math.min(byMem, cores - 1))
}

// ── text reader pool ─────────────────────────────────────────────────────────
let pool = null                    // { readers: [], idle: [], queue: [], engine, ready: Promise }
let idleTimer = null
let onLoadLog = null

async function createReader(engine) {
  const mod = await import('tesseract.js')
  const createWorker = mod.createWorker || mod.default?.createWorker
  const w = await createWorker('eng', 1, {
    ...BASE, corePath: engine.corePath,
    logger: m => onLoadLog?.(m),
  })
  await w.setParameters({ tessedit_pageseg_mode: '11', user_defined_dpi: '300', preserve_interword_spaces: '1' })
  return w
}

// Reads a picture of a skin name we know. A reader that can't is not working here.
async function selfTest(w) {
  try {
    const c = document.createElement('canvas'); c.width = 760; c.height = 160
    const x = c.getContext('2d')
    x.fillStyle = '#fff'; x.fillRect(0, 0, 760, 160)
    x.fillStyle = '#111'; x.font = 'bold 64px Arial, Helvetica, sans-serif'; x.textBaseline = 'middle'
    x.fillText('Galactic Starhawk', 28, 82)
    const blob = await new Promise(r => c.toBlob(r, 'image/png'))
    const { data } = await w.recognize(blob, {}, { blocks: true })
    const text = wordsFromOcr(data, 1).map(v => v.text).join(' ')
    return { ok: !!fuzzyFind(codes('galacticstarhawk'), codes(squash(norm(text))), 2.5), text }
  } catch (err) { return { ok: false, text: String(err?.message || err) } }
}

function startPool(onNotice) {
  if (pool) return pool.ready
  const p = { readers: [], idle: [], queue: [], engine: null, problems: [] }
  pool = p
  p.ready = (async () => {
    let saved = 0
    try { saved = +localStorage.getItem(ENGINE_KEY) || 0 } catch { /* blocked */ }
    const order = [saved, ...ENGINES.map((_, i) => i).filter(i => i !== saved)]
    for (const [turn, i] of order.entries()) {
      if (turn) onNotice?.('Trying another way to run the text reader…')
      let w = null
      try {
        w = await createReader(ENGINES[i])
        const t = await selfTest(w)
        if (!t.ok && turn < order.length - 1) { p.problems.push(`${ENGINES[i].id}: misread test`); await w.terminate(); continue }
        p.engine = ENGINES[i]
        try { localStorage.setItem(ENGINE_KEY, String(i)) } catch { /* blocked */ }
        add(p, w)
        break
      } catch (err) {
        p.problems.push(`${ENGINES[i].id}: ${String(err?.message || err).slice(0, 80)}`)
        try { await w?.terminate() } catch { /* gone */ }
      }
    }
    if (!p.engine) { pool = null; throw new Error(`The text reader could not start on this device (${p.problems.join('; ')}).`) }
    // the other readers start in the background; work begins right away on the first
    for (let k = 1; k < poolSize(); k++) {
      createReader(p.engine).then(w => (pool === p ? add(p, w) : w.terminate())).catch(() => {})
    }
  })()
  p.ready.catch(() => {})
  return p.ready
}

function add(p, w) { p.readers.push(w); p.idle.push(w); pump(p) }

function pump(p) {
  while (p.idle.length && p.queue.length) {
    const w = p.idle.pop(), job = p.queue.shift()
    if (job.signal?.aborted) { p.idle.push(w); job.reject(abortError()); continue }
    w.recognize(job.image, {}, { blocks: true })
      .then(r => job.resolve(r.data), job.reject)
      .finally(() => { p.idle.push(w); pump(p) })
  }
}

function read(image, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    pool.queue.push({ image, signal, resolve, reject })
    pump(pool)
  })
}

export async function disposeScanner() {
  const p = pool
  pool = null
  if (!p) return
  for (const j of p.queue) j.reject(abortError())
  await Promise.all(p.readers.map(w => w.terminate().catch(() => {})))
}
function keepWarm() {
  clearTimeout(idleTimer)
  idleTimer = setTimeout(disposeScanner, 3 * 60 * 1000)        // frees ~100 MB per reader when unused
}

// Downloads and starts the text reader early (when the Auto Collage screen opens).
export function warmUpScanner() { startPool().catch(() => {}); keepWarm() }

// ── preparing screenshots ────────────────────────────────────────────────────
let prepWorker = null, prepSeq = 0
const prepWaiting = new Map()
const workerCanvas = typeof OffscreenCanvas !== 'undefined' && !!OffscreenCanvas.prototype?.getContext

function prepare(file, zoom) {
  if (workerCanvas) {
    if (!prepWorker) {
      prepWorker = new Worker(new URL('./prepWorker.js', import.meta.url), { type: 'module' })
      prepWorker.onmessage = ({ data }) => {
        const w = prepWaiting.get(data.id); prepWaiting.delete(data.id)
        if (!w) return
        if (data.ok) w.resolve(data.out); else w.reject(new Error(data.error))
      }
      prepWorker.onerror = e => { for (const w of prepWaiting.values()) w.reject(new Error(e.message || 'prepare failed')); prepWaiting.clear(); prepWorker = null }
    }
    const id = ++prepSeq
    return new Promise((resolve, reject) => { prepWaiting.set(id, { resolve, reject }); prepWorker.postMessage({ id, file, zoom }) })
  }
  return (async () => {          // older browsers: same work on the page
    const bmp = await createImageBitmap(file)
    try {
      return prepareShot(bmp, zoom, (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }))
    } finally { bmp.close?.() }
  })()
}

// ── scanning ─────────────────────────────────────────────────────────────────
const fileKey = f => `${f.name}|${f.size}|${f.lastModified}`
const firstReads = new Map()        // file → layers from the normal-size read (a re-scan starts from them)

async function mapLimit(items, limit, fn) {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; await fn(items[i], i) }
  }))
}

// files: File[]; vocab: buildVocabulary(skins.json)
// options: { onProgress({ percent, message }), signal, closer: true to look closer right away }
// → { matches, possible, ambiguous, skipped, shots, report, info }
export async function scanScreenshots(files, vocab, { onProgress = () => {}, signal, closer = false } = {}) {
  clearTimeout(idleTimer)
  const total = files.length
  let jobs = total * 3, done = 0, ready = false, lastPct = 0
  const progress = (pct, message) => { lastPct = Math.max(lastPct, Math.min(100, Math.round(pct))); onProgress({ percent: lastPct, message }) }
  const tickJob = () => { done++; progress(8 + 88 * done / jobs, `Reading screenshots… ${Math.min(total, Math.ceil(done / 3))} of ${total}`) }

  onLoadLog = m => {
    if (ready || !/loading/.test(m.status || '')) return
    progress(7 * (m.progress || 0), 'Getting the text reader ready… (first time only, about 4 MB)')
  }
  progress(0, 'Getting the text reader ready…')
  try {
    await Promise.race([startPool(msg => progress(lastPct, msg)), new Promise((_, rej) => signal?.addEventListener('abort', () => rej(abortError()), { once: true }))])
  } finally { onLoadLog = null }
  ready = true
  progress(8, `Reading screenshots… 0 of ${total}`)

  const lines = [], pages = new Array(total), shots = new Array(total), skipped = []
  let level = 0, closerMisses = 0, words = 0
  const t0 = performance.now()

  const readAt = async (file, zoom, minScale = 0) => {
    const prep = await prepare(file, zoom)
    if (signal?.aborted) throw abortError()
    if (prep.blank || prep.scale < minScale) return { prep, layers: [], skipped: true }
    const layers = await Promise.all(prep.images.map(img =>
      read(img, signal).then(d => { tickJob(); return wordsFromOcr(d, prep.scale) })
        .catch(err => { if (err?.name === 'AbortError') throw err; tickJob(); return [] })))
    for (const l of layers) words += l.length
    return { prep, layers, skipped: false }
  }

  // pages run side by side, as many as there are readers (each page = 3 readings)
  await mapLimit(files, Math.max(1, poolSize()), async (file, i) => {
    const log = [`Screenshot ${i + 1}`]
    let layers = []
    try {
      const cached = firstReads.get(fileKey(file))
      let scale = 0
      if (cached && closer) {
        layers = [...cached.layers]; scale = cached.scale
        jobs -= 3
      } else {
        let r = await readAt(file, LEVELS[level])
        if (r.prep.blank) {
          log.push('blank picture (low memory?) — reading again smaller')
          r = await readAt(file, LEVELS[level] * 0.6)
        }
        layers = r.layers; scale = r.prep.scale
        log.push(`${r.prep.width}×${r.prep.height}, read at ×${scale.toFixed(2)}`)
        if (level === 0 && !r.prep.blank) firstReads.set(fileKey(file), { layers, scale })
      }
      let quick = matchPages([{ layers }], vocab)
      // nothing sure found: the text may be too small for the reader — look closer
      if ((closer || !quick.matches.length) && (closer || closerMisses < MAX_CLOSER_PAGES)) {
        let helped = false
        for (let lv = Math.max(1, level + 1); lv < LEVELS.length && !helped; lv++) {
          if (signal?.aborted) throw abortError()
          jobs += 3
          const more = await readAt(file, LEVELS[lv], scale * 1.15)
          if (more.skipped) { jobs -= 3; continue }
          scale = more.prep.scale
          layers = [...layers, ...more.layers]
          quick = matchPages([{ layers }], vocab)
          log.push(`closer look ×${scale.toFixed(2)} → ${quick.matches.length} sure`)
          if (quick.matches.length && !closer) { helped = true; level = Math.max(level, lv) }
          if (closer && quick.matches.length) helped = true
        }
        if (!helped) closerMisses++
      }
      pages[i] = { layers }
      const slim = m => ({ key: m.key, heroName: m.heroName, skinName: m.skinName, box: m.box })
      shots[i] = {
        file: i,
        sure: sortByPosition(quick.matches).map(slim),
        maybe: [...quick.possible.map(slim), ...quick.ambiguous.map(a => ({ key: `?${a.name}`, heroName: '?', skinName: a.name, box: a.box }))],
      }
      log.push(`${quick.matches.length} sure, ${quick.possible.length} maybe`)
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      pages[i] = { layers: [] }
      shots[i] = { file: i, failed: true, sure: [], maybe: [] }
      skipped.push(file.name || `screenshot ${i + 1}`)
      log.push(`could not be opened (${String(err?.message || err).slice(0, 60)})`)
    }
    lines[i] = log.join(' · ')
  })

  progress(97, 'Matching names…')
  const result = matchPages(pages, vocab)
  progress(100, 'Done')
  keepWarm()
  const secs = ((performance.now() - t0) / 1000).toFixed(1)
  const n = navigator
  return {
    ...result,
    skipped,
    shots,
    info: { words, engine: pool?.engine?.id || '', seconds: +secs },
    report: [
      `Skin scan report (scanner build ${SCANNER_BUILD})`,
      `Device: ${String(n.userAgent || '').slice(0, 140)} · ${n.hardwareConcurrency || '?'} cores${n.deviceMemory ? ` · ${n.deviceMemory} GB` : ''}`,
      `Readers: ${pool?.readers.length || 0} × ${pool?.engine?.id || '?'}${pool?.problems.length ? ` (earlier: ${pool.problems.join(' | ')})` : ''}`,
      `Result: ${result.matches.length} sure, ${result.possible.length} maybe, ${result.ambiguous.length} shared-name from ${total} screenshot(s) in ${secs}s`,
      '',
      ...lines,
    ].join('\n'),
  }
}
