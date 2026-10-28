// POST /api/scan-retry  { scan_id, pages }  → lets some screenshots of an earlier
// paid scan be read again, free (only within 30 minutes of the scan, at most as
// many re-reads as the scan had screenshots, and not after a refund).
import { handler, readJson, send, bearer, httpError } from './_http.js'
import { userFromToken, rpcService, supabaseConfigured } from './_supabase.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default handler(['POST'], async (req, res) => {
  if (!supabaseConfigured()) throw httpError(503, 'not_configured')
  const uid = await userFromToken(bearer(req))
  const { scan_id, pages } = await readJson(req)
  const n = Number(pages)
  if (!UUID.test(String(scan_id || '')) || !Number.isInteger(n) || n < 1 || n > 40) throw httpError(400, 'invalid_request')
  await rpcService('svc_retry_scan', { p_scan: scan_id, p_user: uid, p_pages: n })
  send(res, 200, { ok: true })
})
