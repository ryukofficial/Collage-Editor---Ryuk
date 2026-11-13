// POST /api/scan-charge { found } → takes ₹10 for one Auto Collage.
// Screenshots are read on the customer's phone; the app only calls this when
// at least one skin was found, so nobody pays for an empty scan.
import { handler, readJson, send, bearer, httpError } from './_http.js'
import { userFromToken, rpcService, supabaseConfigured } from './_supabase.js'

const one = rows => (Array.isArray(rows) ? rows[0] : rows)

export default handler(['POST'], async (req, res) => {
  if (!supabaseConfigured()) throw httpError(503, 'not_configured')
  const uid = await userFromToken(bearer(req))
  const { found } = await readJson(req)
  const n = Number(found)
  if (!Number.isInteger(n) || n < 1 || n > 5000) throw httpError(400, 'invalid_request')
  // same database steps as before (keeps the hourly scan limit and the history)
  const row = one(await rpcService('svc_start_scan', { p_user: uid, p_pages: 1 }))
  await rpcService('svc_use_scan_page', { p_scan: row.scan_id, p_user: uid })
  await rpcService('svc_record_scan_found', { p_scan: row.scan_id, p_user: uid, p_found: n })
  const fin = one(await rpcService('svc_finish_scan', { p_scan: row.scan_id, p_user: uid }))
  send(res, 200, { balance: fin?.balance ?? row.balance })
})
