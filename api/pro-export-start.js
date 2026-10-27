// POST /api/pro-export-start  { pieces } → takes ₹50 and opens an "Export for editing"
import { handler, readJson, send, bearer, httpError } from './_http.js'
import { userFromToken, rpcService, supabaseConfigured } from './_supabase.js'

export default handler(['POST'], async (req, res) => {
  if (!supabaseConfigured()) throw httpError(503, 'not_configured')
  const uid = await userFromToken(bearer(req))
  const { pieces } = await readJson(req)
  const n = Number(pieces)
  if (!Number.isInteger(n) || n < 1 || n > 400) throw httpError(400, 'invalid_request')
  const rows = await rpcService('svc_start_pro_export', { p_user: uid, p_pieces: n })
  const row = Array.isArray(rows) ? rows[0] : rows
  send(res, 200, { export_id: row.export_id, balance: row.balance })
})
