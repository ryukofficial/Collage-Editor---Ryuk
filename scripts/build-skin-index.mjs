// Runs before every build (npm "prebuild"): lists the skin-picture repos once and
// writes public/skin-index.json, so the website never has to ask GitHub for
// file lists (slow on weak internet, and limited to 60 requests an hour).
// If GitHub can't be reached the build still works: the site then falls back to
// listing the repos in the browser.
import fs from 'node:fs'
import { ASSET_REPOS, IMAGE_RE, resolveIndex } from '../src/lib/skinIndex.js'

const heroes = JSON.parse(fs.readFileSync(new URL('../skins.json', import.meta.url), 'utf8'))
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'ryukcreates-build' }
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`

try {
  const files = []
  for (const repo of ASSET_REPOS) {
    const r = await fetch(`https://api.github.com/repos/${repo}/git/trees/main`, { headers })
    if (!r.ok) throw new Error(`${repo}: HTTP ${r.status}`)
    const tree = await r.json()
    for (const t of tree.tree || []) if (t.type === 'blob' && IMAGE_RE.test(t.path) && !t.path.includes('/')) files.push({ name: t.path, repo })
  }
  const index = resolveIndex(files, heroes)
  fs.writeFileSync(new URL('../public/skin-index.json', import.meta.url), JSON.stringify({ built: new Date().toISOString(), index }))
  console.log(`[skin-index] ${Object.keys(index).length} skins, ${files.length} pictures`)
} catch (err) {
  console.warn('[skin-index] skipped:', err.message)
}
