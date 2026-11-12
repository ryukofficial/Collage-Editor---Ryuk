// POST /api/admin-add-skin
//   { password, heroName, skinName, tier, series, image (base64 JPEG/PNG/WebP) }
//
// Adds a new skin to the website, protected by the "add skin" password:
//   1. the picture goes into the first skin-picture repo (ASSET_REPOS) that still
//      has room, named "<Hero> <Skin>.jpg" like every other skin picture;
//   2. the skin is added to skins.json in the website repo (new hero created if
//      needed). That GitHub change makes Vercel rebuild the site, so the skin
//      shows up in the picker, Auto Collage and the scanner about a minute later.
//
// The password itself is not stored anywhere: only a one-way scrypt hash of it is
// kept below. To change the password, set ADD_SKIN_PASSWORD in Vercel's
// Environment Variables (Secret) — it then replaces the built-in one.
// Needs GITHUB_TOKEN with "Contents: Read and write" on the website repo AND on
// the skin-picture repos.
import crypto from 'node:crypto'
import sharp from 'sharp'
import { handler, readJson, send, httpError } from './_http.js'
import { ASSET_REPOS } from '../src/utils/assetRepos.js'

const TOKEN = () => process.env.GITHUB_TOKEN || ''
const REPO = () => process.env.GITHUB_REPO || 'ryukofficial/Collage-Editor---Ryuk'
const FILE = () => process.env.GITHUB_FILE_PATH || 'skins.json'
const API = () => process.env.GITHUB_API_BASE || 'https://api.github.com'

// scrypt hash of the built-in password
const SALT = 'b0c93008082116c5dcdd7ff99fea8cbd'
const HASH = 'bdd5bd81e462a88633041777bc786c6b0c8e958e31aabf518e62a83cbbd19406'
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

const TIERS = ['', 'Legend', 'Grand', 'Exquisite', 'Deluxe', 'Exceptional', 'Common']
const NAME_RE = /^[\p{L}\p{N} .,'&!?:()×\-]{1,60}$/u
const REPO_FULL_AT = 990            // GitHub lists at most 1000 files per folder
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
const clean = s => String(s || '').replace(/\s+/g, ' ').trim()

function gh(path, method = 'GET', body) {
  return fetch(`${API()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN()}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'ryukcreates-admin' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

export default handler(['POST'], async (req, res) => {
  if (!TOKEN()) throw httpError(503, 'not_configured')
  const body = await readJson(req, 6 * 1024 * 1024)

  if (!passwordOk(body.password)) { await sleep(1500); throw httpError(403, 'wrong_password') }

  const heroName = clean(body.heroName), skinName = clean(body.skinName)
  const tier = clean(body.tier), series = clean(body.series)
  if (!NAME_RE.test(heroName) || !NAME_RE.test(skinName) || !TIERS.includes(tier)) throw httpError(400, 'invalid_request')
  if (series && !NAME_RE.test(series)) throw httpError(400, 'invalid_request')
  const heroId = heroIdOf(heroName)
  if (!heroId) throw httpError(400, 'invalid_request')

  // the picture: must be a real image; saved as a good-quality JPEG
  if (typeof body.image !== 'string' || body.image.length > 6 * 1024 * 1024) throw httpError(400, 'bad_image')
  let jpg
  try {
    jpg = await sharp(Buffer.from(body.image, 'base64'), { limitInputPixels: 25_000_000 })
      .rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#000' }).jpeg({ quality: 92 }).toBuffer()
  } catch { throw httpError(400, 'bad_image') }

  // skins.json: refuse a skin that already exists
  const cur = await gh(`/repos/${REPO()}/contents/${FILE()}`)
  if (!cur.ok) throw new Error(`github get skins ${cur.status}`)
  const file = await cur.json()
  const heroes = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'))
  let hero = heroes.find(h => h.id === heroId || h.name.toLowerCase() === heroName.toLowerCase())
  if (hero && (hero.skins || []).some(s => s.name.toLowerCase() === skinName.toLowerCase())) throw httpError(409, 'skin_exists')
  const realHeroName = hero ? hero.name : heroName

  // 1. the picture → first skin-picture repo with room
  const fileName = `${realHeroName} ${skinName}.jpg`.replace(/[\/\\]/g, ' ')
  let target = null
  for (const repo of ASSET_REPOS) {
    const r = await gh(`/repos/${repo}/contents/`)
    if (!r.ok) continue
    const list = await r.json()
    if (!Array.isArray(list)) continue
    if (list.some(f => f.name.toLowerCase() === fileName.toLowerCase())) throw httpError(409, 'file_exists')
    if (list.length < REPO_FULL_AT) { target = repo; break }
  }
  if (!target) throw httpError(507, 'repos_full')
  const up = await gh(`/repos/${target}/contents/${encodeURIComponent(fileName)}`, 'PUT', {
    message: `Add ${fileName}`, content: jpg.toString('base64'),
  })
  if (!up.ok) throw new Error(`github put image ${up.status}`)

  // 2. the skin → skins.json (this rebuilds the website)
  const entry = { name: skinName, tier }
  if (series) entry.series = series
  if (hero) hero.skins = [...(hero.skins || []), entry]
  else {
    hero = { id: heroId, name: heroName, skins: [entry] }
    heroes.push(hero)
    heroes.sort((a, b) => a.name.localeCompare(b.name))
  }
  const put = await gh(`/repos/${REPO()}/contents/${FILE()}`, 'PUT', {
    message: `Add skin: ${realHeroName} – ${skinName}`,
    content: Buffer.from(JSON.stringify(heroes, null, 2)).toString('base64'),
    sha: file.sha,
  })
  if (!put.ok) throw new Error(`github put skins ${put.status}`)

  send(res, 200, { ok: true, hero: realHeroName, skin: skinName, file: fileName, repo: target })
})
