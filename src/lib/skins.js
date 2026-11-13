// The skin library: every hero and skin (skins.json) and where each skin's
// picture is. The picture list is made when the website is built
// (public/skin-index.json), so phones never wait on the GitHub API.
import skinsData from '../../skins.json'
import { ASSET_REPOS, cdnUrl } from './skinIndex.js'
import { norm } from '../scan/match.js'

export const HEROES = skinsData
export const TIERS = ['Legend', 'Grand', 'Exquisite', 'Deluxe', 'Exceptional', 'Starlight', 'Epic']
export const TIER_STYLE = {
  Legend:      { color: '#f5c842', icon: '👑' },
  Grand:       { color: '#c084fc', icon: '💜' },
  Exquisite:   { color: '#7dd3fc', icon: '💎' },
  Deluxe:      { color: '#6ee7b7', icon: '✨' },
  Exceptional: { color: '#fde68a', icon: '⭐' },
  Starlight:   { color: '#c7d2fe', icon: '🌟' },
  Epic:        { color: '#f0abfc', icon: '🔮' },
}

export const skinId = (heroId, skinName) => `${heroId}__${skinName}`

// Every skin as a flat list: { id, heroId, heroName, skinName, tier, hay }
export const ALL_SKINS = []
for (const hero of HEROES) {
  for (const skin of hero.skins || []) {
    ALL_SKINS.push({
      id: skinId(hero.id, skin.name), heroId: hero.id, heroName: hero.name,
      skinName: skin.name, tier: skin.tier || '', hay: norm(`${hero.name} ${skin.name}`),
    })
  }
}
export const SKIN_BY_ID = new Map(ALL_SKINS.map(s => [s.id, s]))

// Tier changes made in the admin panel on this device (until published)
export function tierOverrides() {
  try { return JSON.parse(localStorage.getItem('mlbb_tiers') || '{}') } catch { return {} }
}

// ── picture index ────────────────────────────────────────────────────────────
let index = null            // { "heroId__Skin": "owner/repo/file" }
let indexPromise = null
export function loadSkinIndex() {
  if (index) return Promise.resolve(index)
  if (!indexPromise) {
    indexPromise = fetch('/skin-index.json', { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .then(data => { index = data?.index || {}; return index })
  }
  return indexPromise
}
export const skinIndexReady = () => !!index

// "ryukofficial/mlbb-assets/Aamon Soul Reaver.jpg" → { url, file }
function fromEntry(entry) {
  const at = entry.indexOf('/', entry.indexOf('/') + 1)
  const repo = entry.slice(0, at), file = entry.slice(at + 1)
  return { url: cdnUrl(repo, file), file }
}

// Picture of a skin, or null when the library has none (after loadSkinIndex()).
export function skinPicture(id) {
  const entry = index?.[id]
  return entry ? fromEntry(entry) : null
}

// For skins added after the last build: try the usual file names directly.
export async function findSkinPicture(id) {
  await loadSkinIndex()
  const known = skinPicture(id)
  if (known) return known
  const s = SKIN_BY_ID.get(id)
  if (!s) return null
  for (const repo of ASSET_REPOS) {
    for (const ext of ['jpg', 'png', 'webp']) {
      const file = `${s.heroName} ${s.skinName}.${ext}`
      const url = cdnUrl(repo, file)
      try {
        const r = await fetch(url, { method: 'HEAD' })
        if (r.ok) { index[id] = `${repo}/${file}`; return { url, file } }
      } catch { /* offline: try the next */ }
    }
  }
  return null
}

// Library file name of a picture URL (the Ryuk effect uses it to find the logo).
export function libraryFile(url) {
  const m = /^https:\/\/raw\.githubusercontent\.com\/ryukofficial\/mlbb-assets(?:-\d+)?\/(?:refs\/heads\/)?main\/([^?#]+)$/.exec(String(url || ''))
  if (!m) return null
  try { return decodeURIComponent(m[1]) } catch { return null }
}

// Search by hero and/or skin name ("gus cosmic", "starhawk")
export function searchSkins(query, limit = 40) {
  const words = norm(query).split(' ').filter(Boolean)
  if (!words.length) return []
  const out = []
  for (const s of ALL_SKINS) {
    if (words.every(w => s.hay.includes(w))) { out.push(s); if (out.length >= limit) break }
  }
  return out
}
