// POST /api/scan-start  { pages }  → takes ₹10 and opens a scan for that many screenshots
import { handler, readJson, send, bearer, httpError } from './_http.js'
import { userFromToken, rpcService, supabaseConfigured } from './_supabase.js'

export default handler(['POST'], async (req, res) => {
  if (!supabaseConfigured()) throw httpError(503, 'not_configured')
  const uid = await userFromToken(bearer(req))
  const { pages } = await readJson(req)
  const n = Number(pages)
  if (!Number.isInteger(n) || n < 1 || n > 40) throw httpError(400, 'invalid_request')
  const rows = await rpcService('svc_start_scan', { p_user: uid, p_pages: n })
  const row = Array.isArray(rows) ? rows[0] : rows
  send(res, 200, { scan_id: row.scan_id, balance: row.balance })
})
