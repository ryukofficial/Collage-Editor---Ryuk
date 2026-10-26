// POST /api/scan-page  (body: the screenshot file, header X-Scan-Id) → words read from it
// Only works for a paid, open scan that belongs to the caller.
import { handler, readBody, send, bearer, httpError } from './_http.js'
import { userFromToken, rpcService, supabaseConfigured } from './_supabase.js'
import { readScreenshotServer } from './_ocr.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BYTES = 4 * 1024 * 1024
let busy = 0

export default handler(['POST'], async (req, res) => {
  if (!supabaseConfigured()) throw httpError(503, 'not_configured')
  const uid = await userFromToken(bearer(req))
  const scanId = String(req.headers['x-scan-id'] || '')
  if (!UUID.test(scanId)) throw httpError(400, 'invalid_request')
  if (!/^image\/(png|jpe?g|webp)$/i.test(String(req.headers['content-type'] || ''))) throw httpError(400, 'bad_image')
  if (busy >= 2) throw httpError(503, 'busy')            // one instance reads at most 2 at a time
  busy++
  try {
    const image = await readBody(req, MAX_BYTES)
    if (image.length < 100) throw httpError(400, 'bad_image')
    await rpcService('svc_use_scan_page', { p_scan: scanId, p_user: uid })   // counts against the paid scan
    let out
    try {
      out = await readScreenshotServer(image)
    } catch (err) {
      // the page still counts as answered (with nothing found), so the scan can finish
      await rpcService('svc_record_scan_found', { p_scan: scanId, p_user: uid, p_found: 0 }).catch(() => {})
      throw err
    }
    // fails if the scan was already refunded: then nothing is sent back
    await rpcService('svc_record_scan_found', { p_scan: scanId, p_user: uid, p_found: out.found })
    send(res, 200, out)
  } finally {
    busy--
  }
})
