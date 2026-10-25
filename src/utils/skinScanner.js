// ─────────────────────────────────────────────────────────────────────────────
// skinScanner — free, in-browser replacement for the Claude "read skin names"
// call that Auto Collage used to make.
//
//   screenshot ──► OCR (Tesseract.js, runs on the user's own device)
//              ──► fuzzy match against skins.json (the closed list of every skin)
//
// No API key, no server round-trip, no per-scan cost. Because we only ever need
// to recognise names from a known list of ~1000, the OCR doesn't have to be
// perfect: "Galactlc Starhawk" still snaps to "Galactic Starhawk".
//
// This file has three parts:
//   1. text matching        (pure JS, no DOM, easy to test)
//   2. image preparation    (pure JS on pixel arrays)
//   3. OCR + orchestration  (Tesseract.js is loaded lazily on first scan)
// ─────────────────────────────────────────────────────────────────────────────

// ═════════════════════════════════════════════════════════════════════════════
// 1. TEXT MATCHING
// ═════════════════════════════════════════════════════════════════════════════

// "Night's Edge" → "nights edge".  Used for every comparison.
export function norm(s) {
  return String(s || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['\u2019\u2018`\u00b4]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const squash = s => s.replace(/ /g, '')

// Characters OCR commonly mixes up cost less to substitute than unrelated ones.
const CONFUSABLE = [
  'il', 'i1', 'l1', 'ij', 'lj', 'o0', 's5', 'z2', 'b6', 'b8', 'g9', 'gq',
  'uv', 'ce', 'tf', 'nh', 'rn', 'ao', 'eo', 'cd',
]
const SUB = new Float32Array(128 * 128)
for (let a = 0; a < 128; a++) for (let b = 0; b < 128; b++) SUB[a * 128 + b] = a === b ? 0 : 1
for (const pair of CONFUSABLE) {
  const a = pair.charCodeAt(0), b = pair.charCodeAt(1)
  SUB[a * 128 + b] = 0.4
  SUB[b * 128 + a] = 0.4
}

const codes = s => {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 127
  return out
}

// Approximate substring search (Sellers' algorithm with weighted costs):
// finds where pattern `p` fits best inside text `t`, tolerating OCR errors.
// Returns { cost, start, end } (indices into t) or null if it costs more than maxCost.
function fuzzyFind(p, t, maxCost) {
  const m = p.length, n = t.length
  if (!m || !n) return null
  let prev  = new Float32Array(n + 1)
  let prevS = new Int16Array(n + 1)
  let cur   = new Float32Array(n + 1)
  let curS  = new Int16Array(n + 1)
  for (let j = 0; j <= n; j++) prevS[j] = j          // row 0: match may start anywhere
  for (let i = 1; i <= m; i++) {
    const pc = p[i - 1] * 128
    cur[0] = i; curS[0] = 0
    let rowMin = cur[0]
    for (let j = 1; j <= n; j++) {
      let best = prev[j - 1] + SUB[pc + t[j - 1]], bs = prevS[j - 1]
      const del = prev[j] + 1                         // pattern char missing from text
      if (del < best) { best = del; bs = prevS[j] }
      const ins = cur[j - 1] + 1                      // extra char in text
      if (ins < best) { best = ins; bs = curS[j - 1] }
      cur[j] = best; curS[j] = bs
      if (best < rowMin) rowMin = best
    }
    if (rowMin > maxCost) return null                 // can only get worse from here
    const tmp = prev; prev = cur; cur = tmp
    const tmpS = prevS; prevS = curS; curS = tmpS
  }
  let best = Infinity, end = 0
  for (let j = 1; j <= n; j++) if (prev[j] < best) { best = prev[j]; end = j }
  if (best > maxCost) return null
  return { cost: best, start: prevS[end], end }
}

// How many weighted OCR errors we tolerate for a name of `len` letters.
// Short names are only accepted when (almost) exact — they are the easiest to
// hit by accident in noisy OCR text.
function allowedCost(len) {
  if (len <= 4)  return 0
  if (len === 5) return 0.5
  if (len === 6) return 0.85
  if (len <= 12) return len * 0.14
  if (len <= 18) return len * 0.2
  return len * 0.24
}

// Words that show up all over the game's UI (tier ribbons, menu labels, rank
// names…). If the only text behind a match is words like these, the match has
// to be exact — otherwise "Special" would turn into the skin "Special Op" and
// "Discount" into "Viscount".
const UI_WORDS = new Set((
  'basic exceptional deluxe exquisite grand legend legends epic special collector starlight elite ' +
  'limited zodiac mythic mythical glory honor immortal master grandmaster warrior brilliant supreme ' +
  'royal new hot sale discount free owned equip equipped preview details price buy purchase unlock ' +
  'upgrade select all sort filter search total confirm cancel back next claim reward rewards gift ' +
  'diamonds diamond tickets ticket fragments fragment level rank ranked season profile friends chat ' +
  'settings squad classic brawl custom match quest mission skins skin heroes hero collection shop ' +
  'store events event recommend emblem emblems battle pass campaign mobile bang bundle package ' +
  'recharge top up exchange redeem lucky draw spin daily weekly monthly login check gold silver bronze ' +
  'platinum victory defeat mvp score rate win lose kills assists deaths gameplay'
).split(' '))

// ── Vocabulary ───────────────────────────────────────────────────────────────

const bigramsOf = arr => {
  const out = []
  for (let i = 0; i + 1 < arr.length; i++) {
    const a = arr[i], b = arr[i + 1]
    if (a < 48 || b < 48) continue
    out.push((a >= 97 ? a - 87 : a - 48) * 36 + (b >= 97 ? b - 87 : b - 48))
  }
  return out
}

// Turns skins.json into a lookup the matcher can use.
//   names:  one entry per distinct skin name (several heroes may share one)
//   heroes: one entry per hero
//   tokens: every word that appears in a hero/skin name (helps pick the better
//           of two OCR readings of the same word)
export function buildVocabulary(skinsData) {
  const byKey = new Map()
  const heroes = []
  const tokens = new Set()
  for (const hero of skinsData || []) {
    const hn = norm(hero.name)
    const hk = squash(hn)
    if (hk) {
      heroes.push({ id: hero.id, name: hero.name, key: hk, codes: codes(hk) })
      for (const t of hn.split(' ')) if (t.length >= 3) tokens.add(t)
    }
    for (const skin of hero.skins || []) {
      const sn = norm(skin.name)
      const key = squash(sn)
      if (key.length < 3) continue
      for (const t of sn.split(' ')) if (t.length >= 3) tokens.add(t)
      let entry = byKey.get(key)
      if (!entry) {
        const c = codes(key)
        entry = { key, tokens: sn.split(' '), codes: c, len: key.length, grams: bigramsOf(c), skins: [], fragmentProne: false }
        byKey.set(key, entry)
      }
      if (!entry.skins.some(s => s.heroId === hero.id && s.skinName === skin.name)) {
        entry.skins.push({ heroId: hero.id, heroName: hero.name, skinName: skin.name, tier: skin.tier || '' })
      }
    }
  }
  // A short name that is the start or the end of a longer one ("Vulcan" inside
  // "Vulcan Lionheart") could just be half a longer name whose other half the
  // OCR missed, so the matcher wants a hero label to back those up.
  const list = [...byKey.values()]
  for (const a of list) {
    for (const b of list) {
      if (a === b || b.tokens.length <= a.tokens.length) continue
      const n = a.tokens.length, bl = b.tokens.length
      const pre = a.tokens.every((t, i) => b.tokens[i] === t)
      const suf = a.tokens.every((t, i) => b.tokens[bl - n + i] === t)
      if (pre || suf) { a.fragmentProne = true; break }
    }
  }
  return { names: list, heroes, tokens }
}

// ── OCR words → clean words ──────────────────────────────────────────────────

const area = b => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0)
function overlapRatio(a, b) {                      // intersection ÷ smaller box
  const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
  const iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
  if (ix <= 0 || iy <= 0) return 0
  return (ix * iy) / Math.max(1, Math.min(area(a), area(b)))
}

const median = arr => {
  if (!arr.length) return 0
  const s = [...arr].sort((x, y) => x - y)
  return s[s.length >> 1]
}

// Drops junk and precomputes what the matcher needs.
function prepareWords(words) {
  const out = []
  for (const w of words || []) {
    const text = (w.text || '').trim()
    const sq = squash(norm(text))
    if (!sq) continue
    const conf = w.conf ?? 100
    if (conf < 25 && sq.length <= 2) continue                  // stray specks
    const h = Math.max(1, w.y1 - w.y0)
    out.push({ text, sq, conf, x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1, h, cy: (w.y0 + w.y1) / 2 })
  }
  return out
}

// Merges the words from several OCR passes of the same screenshot. The first
// pass is the base; later passes only add words in empty places, or replace a
// word with a reading that is a real word from our skin list.
function fuseLayers(layers, vocab) {
  const isKnown = w => (w.sq.length >= 3 && vocab.tokens.has(norm(w.text))) ? 1 : 0
  const fused = (layers[0] || []).slice()
  for (let li = 1; li < layers.length; li++) {
    for (const w of layers[li]) {
      const clash = []
      for (let i = 0; i < fused.length; i++) if (overlapRatio(fused[i], w) > 0.5) clash.push(i)
      if (!clash.length) { fused.push(w); continue }
      const bestOld = Math.max(...clash.map(i => isKnown(fused[i])))
      if (isKnown(w) > bestOld) {
        for (let k = clash.length - 1; k >= 0; k--) fused.splice(clash[k], 1)
        fused.push(w)
      }
    }
  }
  return fused
}

// ── Words → phrases (geometry) ───────────────────────────────────────────────
// We re-group OCR words ourselves so a name that wraps onto two lines is read
// as one name, and names from neighbouring cards are never glued together.
//   gapFactor: how wide a gap (in text heights) still counts as "same phrase"

function buildPhrases(words, gapFactor = 0.95) {
  const ws = words.slice().sort((a, b) => a.cy - b.cy)

  // 1) rows of words that share a baseline
  const rows = []
  for (const w of ws) {
    let row = null
    for (let r = rows.length - 1; r >= 0 && r >= rows.length - 8; r--) {
      if (Math.abs(rows[r].cy - w.cy) <= 0.5 * Math.min(rows[r].h, w.h)) { row = rows[r]; break }
    }
    if (!row) { row = { words: [], cy: w.cy, h: w.h }; rows.push(row) }
    row.words.push(w)
    row.cy = row.words.reduce((s, x) => s + x.cy, 0) / row.words.length
    row.h = median(row.words.map(x => x.h))
  }

  // 2) split each row into phrases wherever there is a wide gap
  const phrases = []
  for (const row of rows) {
    row.words.sort((a, b) => a.x0 - b.x0)
    let cur = null
    for (const w of row.words) {
      if (cur && w.x0 - cur.x1 <= gapFactor * row.h) {
        cur.words.push(w); cur.x1 = Math.max(cur.x1, w.x1)
        cur.y0 = Math.min(cur.y0, w.y0); cur.y1 = Math.max(cur.y1, w.y1)
      } else {
        cur = { words: [w], x0: w.x0, x1: w.x1, y0: w.y0, y1: w.y1 }
        phrases.push(cur)
      }
    }
  }
  for (const p of phrases) {
    p.text = p.words.map(w => w.text).join(' ')
    p.h = median(p.words.map(w => w.h))
    p.cx = (p.x0 + p.x1) / 2
    p.cy = (p.y0 + p.y1) / 2
    p.next = null
  }

  // 3) link each phrase to the phrase right below it (the wrapped second line)
  phrases.sort((a, b) => a.cy - b.cy)
  for (const a of phrases) {
    let best = null, bestGap = Infinity
    for (const b of phrases) {
      if (b === a || b.cy <= a.cy + 0.4 * a.h) continue
      const gap = b.y0 - a.y1
      if (gap > 0.75 * Math.max(a.h, b.h)) continue
      const ratio = b.h / a.h
      if (ratio < 0.7 || ratio > 1.45) continue
      const wMax = Math.max(a.x1 - a.x0, b.x1 - b.x0)
      const centred = Math.abs(a.cx - b.cx) <= 0.3 * wMax + 0.6 * a.h
      const leftAligned = Math.abs(a.x0 - b.x0) <= 0.8 * a.h
      if (!centred && !leftAligned) continue
      if (gap < bestGap) { bestGap = gap; best = b }
    }
    a.next = best
  }
  return phrases
}

// A "unit" is a candidate piece of text to look names up in: one phrase, or a
// phrase plus the line(s) wrapped below it.
function makeUnit(chain) {
  let text = ''
  const spans = []
  for (const ph of chain) {
    for (const w of ph.words) {
      spans.push({ word: w, from: text.length, to: text.length + w.sq.length })
      text += w.sq
    }
  }
  return { chain, text, codes: codes(text), spans }
}

function buildUnits(phrases, chains = true) {
  const units = []
  for (const p of phrases) {
    const chain = [p]
    units.push(makeUnit(chain))
    if (!chains) continue
    let q = p.next
    for (let k = 0; k < 2 && q; k++, q = q.next) {
      chain.push(q)
      units.push(makeUnit(chain.slice()))
    }
  }
  return units
}

const gramSet = arr => {
  const set = new Uint8Array(1296)
  for (const g of arr) set[g] = 1
  return set
}

const boxOf = words => ({
  x0: Math.min(...words.map(w => w.x0)), y0: Math.min(...words.map(w => w.y0)),
  x1: Math.max(...words.map(w => w.x1)), y1: Math.max(...words.map(w => w.y1)),
})

// ── Finding hero labels and skin names in one screenshot ─────────────────────

const HERO_REACH = 30   // a hero label this many text-heights away still counts as "nearby"

function nearestHero(box, h, heroHits) {
  let best = null, bestD = Infinity
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2
  for (const hh of heroHits) {
    const dx = Math.abs(hh.cx - cx) / h
    const dy = Math.abs(hh.cy - cy) / h
    const d = Math.hypot(dx * 1.4, dy)
    if (d < bestD) { bestD = d; best = hh }
  }
  return best && bestD <= HERO_REACH ? { hit: best, dist: bestD } : null
}

function analysePage(layers, vocab) {
  const prepared = layers.map(prepareWords)
  const fused = prepared.length > 1 ? fuseLayers(prepared, vocab) : prepared[0] || []

  const sets = [
    { phrases: buildPhrases(fused, 0.95), chains: true },
    { phrases: buildPhrases(fused, 1.9),  chains: false },
  ]
  if (prepared.length > 1) for (const l of prepared) sets.push({ phrases: buildPhrases(l, 0.95), chains: true })

  const units = []
  sets.forEach(s => {
    for (const u of buildUnits(s.phrases, s.chains)) units.push(u)
  })

  // hero labels: a whole phrase that reads like a hero's name
  const heroHits = []
  for (const u of buildUnits(sets[0].phrases, false)) {
    if (u.text.length < 3) continue
    for (const hero of vocab.heroes) {
      if (hero.key.length > u.text.length + 1 || u.text.length > hero.key.length + 2) continue
      const f = fuzzyFind(hero.codes, u.codes, allowedCost(hero.key.length))
      if (!f) continue
      const ph = u.chain[0]
      heroHits.push({ hero, cost: f.cost, cx: ph.cx, cy: ph.cy, h: ph.h })
    }
  }

  // skin names
  const raw = []
  for (const unit of units) {
    if (unit.text.length < 3) continue
    const grams = gramSet(bigramsOf(unit.codes))
    for (const name of vocab.names) {
      if (name.len > unit.text.length + 3) continue
      let shared = 0
      for (const g of name.grams) shared += grams[g]
      if (shared < Math.max(2, Math.ceil(0.4 * name.grams.length))) continue

      const base = allowedCost(name.len)
      const reach = Math.min(base * 1.3 * 1.4, name.len * 0.3)      // how far "maybe" may stretch
      const found = fuzzyFind(name.codes, unit.codes, reach)
      if (!found) continue

      const covered = unit.spans.filter(s => s.to > found.start && s.from < found.end)
      if (!covered.length) continue
      // very short names must be whole words, standing (nearly) alone
      if (name.len <= 6) {
        const wholeWords = unit.spans.some(s => s.from === found.start) && unit.spans.some(s => s.to === found.end)
        if (!wholeWords || (found.end - found.start) < 0.6 * unit.text.length) continue
      }
      const words = covered.map(s => s.word)
      // text made only of generic UI words has to match exactly
      if (found.cost > 0 && words.every(w => UI_WORDS.has(norm(w.text)))) continue

      const box = boxOf(words)
      const h = median(words.map(w => w.h))
      const near = nearestHero(box, h, heroHits)
      const heroIds = name.skins.map(s => s.heroId)
      const corroborated = !!near && heroIds.includes(near.hit.hero.id)
      const contradicted = !!near && !corroborated && near.dist <= 6

      const limit = base * (corroborated ? 1.3 : 1)
      if (found.cost > Math.min(limit * 1.4, name.len * 0.3)) continue
      let sure = found.cost <= limit
      if (name.fragmentProne && !corroborated) sure = false
      if (contradicted && found.cost > 0) sure = false
      raw.push({ name, cost: found.cost, sure, box, h, near, corroborated, conf: Math.max(...words.map(w => w.conf)) })
    }
  }

  // the same name found again in the same place (other phrase sets / passes) is one hit
  raw.sort((a, b) => a.cost - b.cost)
  const hits = []
  for (const r of raw) {
    if (hits.some(k => k.name === r.name && overlapRatio(k.box, r.box) > 0.5)) continue
    hits.push(r)
  }

  // second look at each hit, now that we know what the page looks like
  const strong = hits.filter(h => h.sure && h.name.len >= 8 && h.cost <= 0.85 && !h.name.fragmentProne)
  const typicalH = strong.length >= 2 ? median(strong.map(h => h.h)) : 0
  for (const hit of hits) {
    // short names are easy to hit by accident (tiny ribbon text in the artwork,
    // for one), so they need a confident read, a hero label, or decent size
    if (hit.name.len <= 6 && typicalH && hit.h < 0.45 * typicalH) hit.sure = false
    if (hit.name.len <= 6 && !hit.corroborated && hit.conf < 50) hit.sure = false
    if (hit.name.len <= 4 && !hit.corroborated && hit.conf < 70) hit.sure = false
    // two different names fit this text almost equally well → can't be sure
    if (hit.cost > 0) {
      const rival = hits.find(o => o !== hit && o.name !== hit.name && o.cost - hit.cost < 1.2 && overlapRatio(o.box, hit.box) > 0.4)
      if (rival) hit.sure = false
    }
  }
  return { hits, heroHits }
}

// Turns what was found in each screenshot into the final skin list.
//   pages: [{ layers: [words, words, …] }]   one entry per screenshot; a layer
//          is the word list from one OCR pass over that screenshot
// Returns { matches, possible, ambiguous }.
export function matchPages(pages, vocab) {
  const matches = new Map()      // "heroId__skin" → match
  const possible = new Map()
  const ambiguous = new Map()    // nameKey → { name, options }

  pages.forEach((page, pageIdx) => {
    const { hits } = analysePage(page.layers || [page.words || []], vocab)

    // most text explained first; then cheapest
    hits.sort((a, b) =>
      (b.sure - a.sure) ||
      ((b.name.len - b.cost) - (a.name.len - a.cost)) ||
      (a.cost - b.cost))

    const claimed = []
    for (const hit of hits) {
      if (claimed.some(r => overlapRatio(r, hit.box) > 0.4)) continue
      claimed.push(hit.box)

      const entries = hit.name.skins
      let chosen = entries
      if (entries.length > 1 && hit.near) {
        const byHero = entries.filter(s => s.heroId === hit.near.hit.hero.id)
        if (byHero.length) chosen = byHero
      }
      if (entries.length > 1 && chosen.length > 1) {
        // same skin name for several heroes and no usable hero label: ask the user
        if (hit.sure && !ambiguous.has(hit.name.key)) {
          ambiguous.set(hit.name.key, {
            name: entries[0].skinName, options: entries, page: pageIdx, box: hit.box, h: hit.h,
          })
        }
        continue
      }
      for (const s of chosen) {
        const key = `${s.heroId}__${s.skinName}`
        const score = Math.max(0, 1 - hit.cost / hit.name.len)
        const rec = {
          key, heroId: s.heroId, heroName: s.heroName, skinName: s.skinName, tier: s.tier,
          score, page: pageIdx, box: hit.box, h: hit.h,
        }
        // seen twice (screenshots overlap when you scroll): keep the best score
        // but the first position, so the collage follows the order you scrolled
        const better = (old) => (old.score < score ? { ...rec, page: old.page, box: old.box, h: old.h } : old)
        if (hit.sure) {
          const old = matches.get(key)
          matches.set(key, old ? better(old) : rec)
          possible.delete(key)
        } else if (!matches.has(key)) {
          const old = possible.get(key)
          possible.set(key, old ? better(old) : rec)
        }
      }
    }
  })

  // a name that a hero label later resolved is not ambiguous any more
  for (const [k, a] of [...ambiguous]) {
    if (a.options.length && a.options.every(o => matches.has(`${o.heroId}__${o.skinName}`))) ambiguous.delete(k)
  }
  return {
    matches: sortByPosition([...matches.values()]),
    possible: sortByPosition([...possible.values()]),
    ambiguous: sortByPosition([...ambiguous.values()]),
  }
}

// Puts results in the order you'd read them off the screenshots: screenshot by
// screenshot, top to bottom, left to right (cards on the same row stay together
// even when their names sit a few pixels higher or lower).
// Works on any list of { page, box, h } records.
export function sortByPosition(list) {
  const out = []
  const pages = [...new Set(list.map(r => r.page ?? 0))].sort((a, b) => a - b)
  for (const pg of pages) {
    const items = list.filter(r => (r.page ?? 0) === pg && r.box)
    const rowTol = 2.2 * (median(items.map(r => r.h || 0)) || 20)
    items.sort((a, b) => (a.box.y0 + a.box.y1) - (b.box.y0 + b.box.y1))
    const rows = []
    for (const it of items) {
      const cy = (it.box.y0 + it.box.y1) / 2
      const row = rows[rows.length - 1]
      if (row && cy - row.cy <= rowTol) row.items.push(it)
      else rows.push({ cy, items: [it] })               // row position = its first (top-most) item
    }
    for (const row of rows) {
      row.items.sort((a, b) => a.box.x0 - b.box.x0)
      out.push(...row.items)
    }
    out.push(...list.filter(r => (r.page ?? 0) === pg && !r.box))
  }
  return out
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. IMAGE PREPARATION
// ═════════════════════════════════════════════════════════════════════════════

// OCR works best when text is roughly 30–40 px tall. Phone screenshots are
// usually already there; smaller ones (compressed, 720p devices) get enlarged.
export function chooseScale(width, height, boost = 1) {
  const short = Math.min(width, height)
  const long  = Math.max(width, height)
  let s = Math.min(2.2, Math.max(1, 1080 / short)) * boost
  if (long * s > 3400) s = 3400 / long
  return s
}

// Sliding-window min/max along one line (monotonic deque, O(n)).
function slide(src, dst, n, stride, start, r, isMax) {
  const dq = new Int32Array(n)
  let head = 0, tail = 0, next = 0
  for (let i = 0; i < n; i++) {
    const hi = Math.min(n - 1, i + r)
    while (next <= hi) {
      const v = src[start + next * stride]
      if (isMax) { while (tail > head && v >= src[start + dq[tail - 1] * stride]) tail-- }
      else       { while (tail > head && v <= src[start + dq[tail - 1] * stride]) tail-- }
      dq[tail++] = next++
    }
    const lo = i - r
    while (dq[head] < lo) head++
    dst[start + i * stride] = src[start + dq[head] * stride]
  }
}

function morph(src, w, h, r, isMax) {
  const tmp = new Uint8Array(src.length), out = new Uint8Array(src.length)
  for (let y = 0; y < h; y++) slide(src, tmp, w, 1, y * w, r, isMax)
  for (let x = 0; x < w; x++) slide(tmp, out, h, w, x, r, isMax)
  return out
}

// Turns an RGBA screenshot into the grey image we hand to the OCR engine.
//   'plain'  – ordinary greyscale (works for light or dark text)
//   'tophat' – keeps only thin bright strokes (white UI text) and wipes out the
//              artwork behind them. Slower, but rescues text printed over art.
export function prepareGray(rgba, width, height, variant = 'plain', opts = {}) {
  const n = width * height
  const gray = new Uint8Array(n)
  if (variant === 'tophat') {
    const floor = opts.floor ?? 80, gain = opts.gain ?? 3, rad = opts.radius ?? 0.007
    // min(R,G,B): white text stays bright, saturated artwork goes dark
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2]
      gray[i] = r < g ? (r < b ? r : b) : (g < b ? g : b)
    }
    const radius = Math.max(4, Math.round(Math.min(width, height) * rad))
    const opened = morph(morph(gray, width, height, radius, false), width, height, radius, true)
    for (let i = 0; i < n; i++) {
      let t = (gray[i] - opened[i] - floor) * gain
      if (t < 0) t = 0
      gray[i] = 255 - (t > 255 ? 255 : t)           // black text on white
    }
    return gray
  }
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    gray[i] = (rgba[p] * 77 + rgba[p + 1] * 151 + rgba[p + 2] * 28) >> 8
  }
  return gray
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. OCR + ORCHESTRATION
// ═════════════════════════════════════════════════════════════════════════════

// Flattens Tesseract's block → paragraph → line → word tree into plain words,
// converting coordinates back to the original screenshot's pixels.
export function wordsFromOcr(data, scale = 1) {
  const words = []
  for (const b of data?.blocks || [])
    for (const p of b.paragraphs || [])
      for (const l of p.lines || [])
        for (const w of l.words || []) {
          if (!w.bbox || !w.text) continue
          words.push({
            text: w.text, conf: w.confidence,
            x0: w.bbox.x0 / scale, y0: w.bbox.y0 / scale, x1: w.bbox.x1 / scale, y1: w.bbox.y1 / scale,
          })
        }
  return words
}

// ── Tesseract worker (created once, reused, freed with disposeScanner) ───────
let _worker = null
let _workerPromise = null
let _onLog = null
let _generation = 0        // bumped by disposeScanner(): a worker that finishes loading late is thrown away

const abortError = () => new DOMException('Scan cancelled', 'AbortError')
const tick = () => new Promise(resolve => setTimeout(resolve, 0))    // lets the page repaint between heavy steps

// Behaves like `promise`, but rejects the moment `signal` is aborted.
function raceAbort(promise, signal) {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(abortError())
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError())
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      v => { signal.removeEventListener('abort', onAbort); resolve(v) },
      e => { signal.removeEventListener('abort', onAbort); reject(e) },
    )
  })
}

async function getWorker() {
  if (_worker) return _worker
  if (!_workerPromise) {
    const gen = _generation
    _workerPromise = (async () => {
      // Loaded on demand, so people who never use Auto Collage never download it.
      const mod = await import('tesseract.js')
      const createWorker = mod.createWorker || mod.default?.createWorker
      const worker = await createWorker('eng', 1, {
        logger: m => { if (_onLog && gen === _generation) _onLog(m) },
      })
      const stale = async () => {
        if (gen === _generation) return false
        try { await worker.terminate() } catch { /* already gone */ }
        return true
      }
      if (await stale()) throw abortError()
      await worker.setParameters({
        tessedit_pageseg_mode: '11',          // sparse text: find words anywhere on the page
        user_defined_dpi: '300',
        preserve_interword_spaces: '1',
      })
      if (await stale()) throw abortError()
      _worker = worker
      return worker
    })().catch(err => { if (gen === _generation) _workerPromise = null; throw err })
  }
  return _workerPromise
}

// Stops any scan in progress and frees the OCR engine's memory (~100 MB).
export async function disposeScanner() {
  const w = _worker
  _generation++
  _worker = null
  _workerPromise = null
  _onLog = null
  if (w) { try { await w.terminate() } catch { /* already gone */ } }
}

// Opens an image file and draws it, scaled for OCR, onto a canvas.
async function decodeToCanvas(file) {
  let bitmap = null
  try { bitmap = await createImageBitmap(file) } catch { bitmap = null }
  let img = bitmap
  let url = null
  try {
    if (!img) {
      url = URL.createObjectURL(file)
      img = await new Promise((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error(`Could not open ${file.name || 'image'}`))
        el.src = url
      })
    }
    const sw = img.width || img.naturalWidth
    const sh = img.height || img.naturalHeight
    if (!sw || !sh) throw new Error(`Could not open ${file.name || 'image'}`)
    const s = chooseScale(sw, sh)
    const canvas = document.createElement('canvas')
    canvas.width  = Math.max(1, Math.round(sw * s))
    canvas.height = Math.max(1, Math.round(sh * s))
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return { canvas, scale: canvas.width / sw }
  } finally {
    if (bitmap && bitmap.close) bitmap.close()
    if (url) URL.revokeObjectURL(url)
  }
}

const canvasToBlob = canvas => new Promise((resolve, reject) =>
  canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/png'))

async function recognise(worker, canvas, signal) {
  const blob = await canvasToBlob(canvas)
  const { data } = await raceAbort(worker.recognize(blob, {}, { blocks: true }), signal)
  return data
}

// Reads one screenshot twice and returns the words from each reading:
//   1. as it is                               (good for any text colour)
//   2. bright thin strokes only (top-hat)     (rescues white text printed over artwork)
async function readScreenshot({ canvas, scale }, worker, signal, onPass) {
  const layers = []
  try {
    onPass(0)
    layers.push(wordsFromOcr(await recognise(worker, canvas, signal), scale))

    onPass(1)
    await tick()
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const gray = prepareGray(img.data, canvas.width, canvas.height, 'tophat')
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
      img.data[p] = img.data[p + 1] = img.data[p + 2] = gray[i]
      img.data[p + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    await tick()
    layers.push(wordsFromOcr(await recognise(worker, canvas, signal), scale))
  } finally {
    canvas.width = canvas.height = 1                     // release the pixels
  }
  return layers
}

// Scans screenshots and returns the skins found in them.
//   files:   File[]
//   vocab:   buildVocabulary(skinsData)
//   options: { onProgress({ page, total, percent, message }), signal }
// Resolves to { matches, possible, ambiguous, skipped }
//   matches    – skins we are sure about
//   possible   – "maybe" skins (worth showing, but unchecked)
//   ambiguous  – a skin name shared by several heroes with no hero label to tell them apart
//   skipped    – names of files that could not be opened as images
// Rejects with an AbortError if `signal` is aborted.
export async function scanScreenshots(files, vocab, options = {}) {
  const { onProgress = () => {}, signal } = options
  const total = files.length
  const PASSES = 2
  const check = () => { if (signal?.aborted) throw abortError() }

  let page = 0, pass = 0, reading = false
  let coreDone = 0, langDone = 0
  const report = (percent, message) =>
    onProgress({ page, total, percent: Math.max(0, Math.min(100, Math.round(percent))), message })

  _onLog = m => {
    if (m.status === 'recognizing text') {
      if (!reading) return
      const frac = (page * PASSES + pass + (m.progress || 0)) / (total * PASSES)
      report(10 + 85 * frac, `Reading screenshot ${page + 1} of ${total}…`)
    } else if (!reading) {
      if (m.status === 'loading tesseract core') coreDone = m.progress || 0
      else if (m.status === 'loading language traineddata') langDone = m.progress || 0
      else return
      const done = (coreDone + langDone) / 2
      report(10 * done, done < 1
        ? `Getting the text reader ready… ${Math.round(done * 100)}% (first time only, about 6 MB)`
        : 'Getting the text reader ready…')
    }
  }

  try {
    check()
    report(0, 'Getting the text reader ready… (first time only, about 6 MB)')
    const worker = await raceAbort(getWorker(), signal)
    reading = true
    report(10, 'Reading screenshots…')

    const pages = [], skipped = []
    for (let i = 0; i < total; i++) {
      check()
      page = i; pass = 0
      let decoded
      try { decoded = await decodeToCanvas(files[i]) }
      catch { skipped.push(files[i].name || `image ${i + 1}`); continue }
      pages.push({ layers: await readScreenshot(decoded, worker, signal, p => { pass = p }) })
    }

    check()
    page = total
    report(96, 'Matching names…')
    await tick()
    const result = matchPages(pages, vocab)
    report(100, 'Done')
    return { ...result, skipped }
  } catch (err) {
    await disposeScanner()                               // never leave a half-finished worker behind
    throw err
  } finally {
    _onLog = null
  }
}
