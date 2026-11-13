// POST /api/admin-add-skin   — the "Add skins / Change series" admin tools.
// Every request carries the password. Actions:
//
//   { action: 'image', password, heroName, skinName, image }
//       stores one skin picture ("<Hero> <Skin>.jpg") in the first skin-picture
//       repo (ASSET_REPOS) that still has room. Returns { file }.
//   { action: 'add', password, skins: [{ heroName, skinName, tier, series }] }
//       adds up to 50 skins to skins.json in ONE change (so the website rebuilds
//       once). Their pictures must have been stored first with 'image'.
//   { action: 'series', password, changes: [{ heroId, skinName, series }] }
//       sets the series of existing skins ('' = no series). A new series name is
//       simply a name nobody used before.
//   (no action, old form: { password, heroName, skinName, tier, series, image }
//    = 'image' + 'add' for one skin.)
//
// Changing skins.json on GitHub makes Vercel rebuild the site, so changes show up
// about a minute later.
//
// The password itself is not stored anywhere: only a one-way scrypt hash of it is
// kept below. To change it, set ADD_SKIN_PASSWORD in Vercel's Environment
// Variables (Secret) — it then replaces the built-in one.
// Needs GITHUB_TOKEN with "Contents: Read and write" on the website repo AND on
// the skin-picture repos.
import crypto from 'node:crypto'
import sharp from 'sharp'
import { handler, readJson, send, httpError } from './_http.js'
import { ASSET_REPOS } from '../src/lib/skinIndex.js'

const TOKEN = () => process.env.GITHUB_TOKEN || ''
const REPO = () => process.env.GITHUB_REPO || 'ryukofficial/Collage-Editor---Ryuk'
const FILE = () => process.env.GITHUB_FILE_PATH || 'skins.json'
const API = () => process.env.GITHUB_API_BASE || 'https://api.github.com'

// scrypt hash of the built-in password
const SALT = 'b0c93008082116c5dcdd7ff99fea8cbd'
const HASH = 'bdd5bd81e462a88633041777bc786c6b0c8e958e31aabf518e62a83cbbd19406'
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

const TIERS = ['', 'Legend', 'Grand', 'Exquisite', 'Deluxe', 'Exceptional', 'Elite', 'Basic', 'Common']
const NAME_RE = /^[\p{L}\p{N} .,'&!?:()×\-]{1,60}$/u
const REPO_FULL_AT = 990            // GitHub lists at most 1000 files per folder
const MAX_BATCH = 50
const sleep = ms => new Promise(r => setTimeout(r, ms))

function passwordOk(pw) {
  if (typeof pw !== 'string' || pw.length < 1 || pw.length > 100) return false
  const env = process.env.ADD_SKIN_PASSWORD
  if (env) {
    const a = crypto.createHash('sha256').update(pw).digest(), b = crypto.createHash('sha256').update(env).digest()
    return crypto.timingSafeEqual(a, b)
  }
  const got = crypto.scryptSync(pw, SALT, 32, SCRYPT)
  return crypto.timingSafeEqual(got, Buffer.from(HASH, 'hex'))
}

const heroIdOf = name => name.toLowerCase().replace(/[^a-z0-9]/g, '')
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim()
const fileNameOf = (hero, skin) => `${hero} ${skin}.jpg`.replace(/[\/\\]/g, ' ')

function gh(path, method = 'GET', body) {
  return fetch(`${API()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN()}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'ryukcreates-admin' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

async function loadSkins() {
  const cur = await gh(`/repos/${REPO()}/contents/${FILE()}`)
  if (!cur.ok) throw new Error(`github get skins ${cur.status}`)
  const file = await cur.json()
  return { sha: file.sha, heroes: JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')) }
}
async function saveSkins(heroes, sha, message) {
  const put = await gh(`/repos/${REPO()}/contents/${FILE()}`, 'PUT', {
    message, sha, content: Buffer.from(JSON.stringify(heroes, null, 2)).toString('base64'),
  })
  if (put.status === 409) throw httpError(409, 'busy')          // someone saved at the same moment
  if (!put.ok) throw new Error(`github put skins ${put.status}`)
}
const findHero = (heroes, name) => {
  const id = heroIdOf(name)
  return heroes.find(h => h.id === id || h.name.toLowerCase() === name.toLowerCase())
}

function checkNames(heroName, skinName) {
  if (!NAME_RE.test(heroName) || !NAME_RE.test(skinName) || !heroIdOf(heroName)) throw httpError(400, 'invalid_request')
}
function checkSeries(series) {
  if (series && !NAME_RE.test(series)) throw httpError(400, 'invalid_request')
}

// ── store one picture ───────────────────────────────────────────────────────
async function storeImage({ heroName, skinName, image }, heroes) {
  heroName = clean(heroName); skinName = clean(skinName)
  checkNames(heroName, skinName)
  const hero = findHero(heroes, heroName)
  if (hero && (hero.skins || []).some(s => s.name.toLowerCase() === skinName.toLowerCase())) throw httpError(409, 'skin_exists')

  if (typeof image !== 'string' || image.length > 6 * 1024 * 1024) throw httpError(400, 'bad_image')
  let jpg
  try {
    jpg = await sharp(Buffer.from(image, 'base64'), { limitInputPixels: 25_000_000 })
      .rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#000' }).jpeg({ quality: 92 }).toBuffer()
  } catch { throw httpError(400, 'bad_image') }

  const fileName = fileNameOf(hero ? hero.name : heroName, skinName)
  let target = null
  for (const repo of ASSET_REPOS) {
    const r = await gh(`/repos/${repo}/contents/`)
    if (!r.ok) continue
    const list = await r.json()
    if (!Array.isArray(list)) continue
    if (list.some(f => f.name.toLowerCase() === fileName.toLowerCase())) return { file: fileName, repo, existed: true }
    if (list.length < REPO_FULL_AT) { target = repo; break }
  }
  if (!target) throw httpError(507, 'repos_full')
  const up = await gh(`/repos/${target}/contents/${encodeURIComponent(fileName)}`, 'PUT', {
    message: `Add ${fileName}`, content: jpg.toString('base64'),
  })
  if (!up.ok) throw new Error(`github put image ${up.status}`)
  return { file: fileName, repo: target }
}

// ── add skins to skins.json (one commit) ────────────────────────────────────
function addSkins(heroes, skins) {
  const added = []
  for (const raw of skins) {
    const heroName = clean(raw.heroName), skinName = clean(raw.skinName)
    const tier = clean(raw.tier), series = clean(raw.series)
    checkNames(heroName, skinName); checkSeries(series)
    if (!TIERS.includes(tier)) throw httpError(400, 'invalid_request')
    let hero = findHero(heroes, heroName)
    if (hero && (hero.skins || []).some(s => s.name.toLowerCase() === skinName.toLowerCase())) throw httpError(409, 'skin_exists')
    const entry = { name: skinName, tier }
    if (series) entry.series = series
    if (hero) hero.skins = [...(hero.skins || []), entry]
    else { hero = { id: heroIdOf(heroName), name: heroName, skins: [entry] }; heroes.push(hero) }
    added.push(`${hero.name} – ${skinName}`)
  }
  heroes.sort((a, b) => a.name.localeCompare(b.name))
  return added
}

export default handler(['POST'], async (req, res) => {
  if (!TOKEN()) throw httpError(503, 'not_configured')
  const body = await readJson(req, 6 * 1024 * 1024)
  if (!passwordOk(body.password)) { await sleep(1500); throw httpError(403, 'wrong_password') }
  const action = body.action || 'single'

  if (action === 'image') {
    const { heroes } = await loadSkins()
    return send(res, 200, { ok: true, ...(await storeImage(body, heroes)) })
  }

  if (action === 'add') {
    const skins = body.skins
    if (!Array.isArray(skins) || !skins.length || skins.length > MAX_BATCH) throw httpError(400, 'invalid_request')
    const { heroes, sha } = await loadSkins()
    const added = addSkins(heroes, skins)
    await saveSkins(heroes, sha, added.length === 1 ? `Add skin: ${added[0]}` : `Add ${added.length} skins: ${added.join(', ').slice(0, 200)}`)
    return send(res, 200, { ok: true, added })
  }

  if (action === 'series') {
    const changes = body.changes
    if (!Array.isArray(changes) || !changes.length || changes.length > 500) throw httpError(400, 'invalid_request')
    const { heroes, sha } = await loadSkins()
    let n = 0
    for (const c of changes) {
      const series = clean(c.series); checkSeries(series)
      const hero = heroes.find(h => h.id === String(c.heroId || ''))
      const skin = hero && (hero.skins || []).find(s => s.name === String(c.skinName || ''))
      if (!skin) throw httpError(400, 'invalid_request')
      skin.series = series          // '' = no series (overrides the built-in list)
      n++
    }
    await saveSkins(heroes, sha, `Change series of ${n} skin${n === 1 ? '' : 's'}`)
    return send(res, 200, { ok: true, changed: n })
  }

  if (action === 'single') {          // one skin in one request (first version of the form)
    const { heroes, sha } = await loadSkins()
    const img = await storeImage(body, heroes)
    const added = addSkins(heroes, [body])
    await saveSkins(heroes, sha, `Add skin: ${added[0]}`)
    const hero = findHero(heroes, clean(body.heroName))
    return send(res, 200, { ok: true, hero: hero.name, skin: clean(body.skinName), file: img.file, repo: img.repo })
  }

  throw httpError(400, 'invalid_request')
})
