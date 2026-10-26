// POST /api/admin-save-tiers  { tiers: { "heroId__Skin Name": "Legend", … } }
// Admin only. Writes the tiers into skins.json on GitHub with a server-side token.
import { handler, readJson, send, bearer, httpError } from './_http.js'
import { userFromToken, rpcAsUser, supabaseConfigured } from './_supabase.js'

const TOKEN = () => process.env.GITHUB_TOKEN || ''
const REPO = () => process.env.GITHUB_REPO || 'ryukofficial/Collage-Editor---Ryuk'
const FILE = () => process.env.GITHUB_FILE_PATH || 'skins.json'
const TIER_RE = /^[A-Za-z ]{0,20}$/

export default handler(['POST'], async (req, res) => {
  if (!supabaseConfigured() || !TOKEN()) throw httpError(503, 'not_configured')
  const token = bearer(req)
  await userFromToken(token)
  if (!(await rpcAsUser(token, 'is_wallet_admin', {}))) throw httpError(403, 'not_admin')

  const { tiers } = await readJson(req, 512 * 1024)
  if (!tiers || typeof tiers !== 'object' || Array.isArray(tiers)) throw httpError(400, 'invalid_request')
  for (const [k, v] of Object.entries(tiers)) {
    if (typeof k !== 'string' || k.length > 120 || typeof v !== 'string' || !TIER_RE.test(v)) throw httpError(400, 'invalid_request')
  }

  const gh = (method, body) => fetch(`${process.env.GITHUB_API_BASE || 'https://api.github.com'}/repos/${REPO()}/contents/${FILE()}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN()}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'ryukcreates-admin' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const cur = await gh('GET')
  if (!cur.ok) throw new Error(`github get ${cur.status}`)
  const file = await cur.json()
  const heroes = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'))

  // only the tier of existing skins changes; nothing else in the file can be touched
  const updated = heroes.map(hero => ({
    ...hero,
    skins: (hero.skins || []).map(skin => {
      const k = `${hero.id}__${skin.name}`
      return Object.prototype.hasOwnProperty.call(tiers, k) ? { ...skin, tier: tiers[k] } : skin
    }),
  }))
  const put = await gh('PUT', {
    message: 'Update skin tiers from admin panel',
    content: Buffer.from(JSON.stringify(updated, null, 2)).toString('base64'),
    sha: file.sha,
  })
  if (!put.ok) throw new Error(`github put ${put.status}`)
  send(res, 200, { ok: true })
})
