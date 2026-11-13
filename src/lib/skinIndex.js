// Which picture file belongs to which skin.
// Used at build time (scripts/build-skin-index.mjs writes public/skin-index.json,
// so phones don't have to ask GitHub for file lists) and, as a fallback, in the
// browser when that file is missing.
export const ASSET_REPOS = [
  'ryukofficial/mlbb-assets',
  'ryukofficial/mlbb-assets-2',
  // 'ryukofficial/mlbb-assets-3',   ← when a repo is full: create the next one and add it here
]
export const IMAGE_RE = /\.(jpg|jpeg|png|webp)$/i
export const cdnUrl = (repo, file) => `https://raw.githubusercontent.com/${repo}/refs/heads/main/${encodeURIComponent(file)}`

const slug = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
const HERO_ALIASES = {
  yuzhong: ['yu zhong', 'yuzhong'], gusion: ['gusion', 'gus'], franco: ['franco'],
  johnson: ['johnson', 'john'], odette: ['odette'], lancelot: ['lancelot', 'lance'],
  alucard: ['alucard', 'alu'], vexana: ['vexana', 'vex'], layla: ['layla'], miya: ['miya'], ling: ['ling'],
}

// how well a file name fits a skin: 0 … 1
function fit(fileSlug, heroId, skinName) {
  const joined = fileSlug.replace(/ /g, '')
  const aliases = HERO_ALIASES[heroId] || [heroId]
  if (!aliases.some(a => fileSlug.includes(a) || joined.includes(a))) return 0
  const kw = slug(skinName).split(' ').filter(w => w.length >= 3)
  if (!kw.length) return 1
  return kw.filter(k => fileSlug.includes(k)).length / kw.length
}

// files: [{ name, repo }] (earlier repos win on equal names)
// returns { "heroId__Skin Name": "repo/file name" }
export function resolveIndex(files, heroes) {
  const byName = new Map()
  for (const f of files) if (!byName.has(f.name.toLowerCase())) byName.set(f.name.toLowerCase(), f)
  const slugs = files.map(f => ({ f, s: slug(f.name.replace(IMAGE_RE, '')) }))
  const out = {}
  for (const hero of heroes) {
    // only files that mention the hero are worth scoring
    const mine = slugs.filter(x => fit(x.s, hero.id, '') > 0)
    for (const skin of hero.skins || []) {
      let hit = null
      for (const ext of ['jpg', 'png', 'webp']) {
        hit = byName.get(`${hero.name} ${skin.name}.${ext}`.toLowerCase())
        if (hit) break
      }
      if (!hit) {
        let best = 0.3
        for (const x of mine) { const s = fit(x.s, hero.id, skin.name); if (s > best) { best = s; hit = x.f } }
      }
      if (hit) out[`${hero.id}__${skin.name}`] = `${hit.repo}/${hit.name}`
    }
  }
  return out
}
