// POST /api/scan-finish  { scan_id }  → closes the scan; refunds ₹10 if nothing was found
import { handler, readJson, send, bearer, httpError } from './_http.js'
import { userFromToken, rpcService, supabaseConfigured } from './_supabase.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default handler(['POST'], async (req, res) => {
  if (!supabaseConfigured()) throw httpError(503, 'not_configured')
  const uid = await userFromToken(bearer(req))
  const { scan_id } = await readJson(req)
  if (!UUID.test(String(scan_id || ''))) throw httpError(400, 'invalid_request')
  const rows = await rpcService('svc_finish_scan', { p_scan: scan_id, p_user: uid })
  const row = Array.isArray(rows) ? rows[0] : rows
  send(res, 200, { refunded: !!row.refunded, balance: row.balance })
})
