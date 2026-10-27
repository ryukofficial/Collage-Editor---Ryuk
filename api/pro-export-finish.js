// POST /api/pro-export-finish  { export_id, failed } → closes it; refunds ₹50 if nothing was made
import { handler, readJson, send, bearer, httpError } from './_http.js'
import { userFromToken, rpcService, supabaseConfigured } from './_supabase.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default handler(['POST'], async (req, res) => {
  if (!supabaseConfigured()) throw httpError(503, 'not_configured')
  const uid = await userFromToken(bearer(req))
  const { export_id, failed } = await readJson(req)
  if (!UUID.test(String(export_id || ''))) throw httpError(400, 'invalid_request')
  const rows = await rpcService('svc_finish_pro_export', { p_export: export_id, p_user: uid, p_failed: failed === true })
  const row = Array.isArray(rows) ? rows[0] : rows
  send(res, 200, { refunded: !!row?.refunded, balance: row?.balance ?? null })
})
