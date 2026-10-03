// ─────────────────────────────────────────────────────────────────────────────
// Skin image repositories
//
// When one repo gets full, create a new one, upload the extra skin images to
// its root folder, and add it to this list. Nothing else needs to change.
//
// Format: 'owner/repo'. Images must sit in the repo root on the `main` branch.
// If the same filename exists in two repos, the earlier repo in the list wins.
// ─────────────────────────────────────────────────────────────────────────────
export const ASSET_REPOS = [
  'ryukofficial/mlbb-assets',
  'ryukofficial/mlbb-assets-2',
  // 'ryukofficial/mlbb-assets-3',   ← next time: create it, then remove the // at the start of this line
]

const BRANCH   = 'main'
const IMAGE_RE = /\.(jpg|jpeg|png|webp)$/i

export const cdnUrl = (repo, filename) =>
  `https://raw.githubusercontent.com/${repo}/refs/heads/${BRANCH}/${encodeURIComponent(filename)}`

const apiUrl = repo => `https://api.github.com/repos/${repo}/contents/`

async function listRepo(repo) {
  const res = await fetch(apiUrl(repo), {
    headers: { Accept: 'application/vnd.github.v3+json' },
  })
  if (!res.ok) throw new Error(`${repo}: HTTP ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error(`${repo}: unexpected response`)
  return data
    .filter(f => f.type === 'file' && IMAGE_RE.test(f.name))
    .map(f => ({ name: f.name, url: cdnUrl(repo, f.name), repo }))
}

let _files   = null   // [{ name, url, repo }] once loaded
let _pending = null   // in-flight promise, so concurrent callers share one fetch

// Lists the image files of every repo in ASSET_REPOS (in parallel) and returns
// one merged list. The result is cached for the session, so HeroPicker and
// AutoCollage together cost one GitHub API call per repo.
// A repo that fails to load is skipped; this only rejects if ALL repos fail.
export function loadAssetFiles() {
  if (_files)   return Promise.resolve(_files)
  if (_pending) return _pending

  _pending = Promise.allSettled(ASSET_REPOS.map(listRepo))
    .then(results => {
      const merged = [], seen = new Set()
      let loaded = 0
      results.forEach((r, i) => {
        if (r.status !== 'fulfilled') {
          console.warn('[assetRepos] could not load', ASSET_REPOS[i], r.reason)
          return
        }
        loaded++
        for (const f of r.value) {
          if (seen.has(f.name)) continue
          seen.add(f.name)
          merged.push(f)
        }
      })
      if (loaded === 0) throw new Error('No asset repo could be loaded')
      _files = merged
      return merged
    })
    .catch(err => { _pending = null; throw err })

  return _pending
}
