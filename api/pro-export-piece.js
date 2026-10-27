// POST /api/pro-export-piece  (body: PNG of one part of the collage)
//   headers: X-Export-Id, X-Cells = JSON [[x, y, size], …] skin cells inside this part
// Only for a paid, open export that belongs to the caller. Returns the processed PNG.
import { handler, readBody, send, bearer, httpError } from './_http.js'
import { userFromToken, rpcService, supabaseConfigured } from './_supabase.js'
import { processPiece } from './_pro.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BYTES = 4 * 1024 * 1024
let busy = 0

function parseCells(h) {
  if (!h) return []
  if (h.length > 4000) throw httpError(400, 'invalid_request')
  let cells
  try { cells = JSON.parse(h) } catch { throw httpError(400, 'invalid_request') }
  if (!Array.isArray(cells) || cells.length > 100) throw httpError(400, 'invalid_request')
  for (const c of cells) {
    if (!Array.isArray(c) || c.length !== 3 || !c.every(v => Number.isInteger(v) && v >= 0 && v <= 8000) || c[2] < 16) throw httpError(400, 'invalid_request')
  }
  return cells
}

export default handler(['POST'], async (req, res) => {
  if (!supabaseConfigured()) throw httpError(503, 'not_configured')
  const uid = await userFromToken(bearer(req))
  const exportId = String(req.headers['x-export-id'] || '')
  if (!UUID.test(exportId)) throw httpError(400, 'invalid_request')
  if (!/^image\/png$/i.test(String(req.headers['content-type'] || ''))) throw httpError(400, 'bad_image')
  const cells = parseCells(String(req.headers['x-cells'] || ''))
  if (busy >= 3) throw httpError(503, 'busy')
  busy++
  try {
    const image = await readBody(req, MAX_BYTES)
    if (image.length < 60) throw httpError(400, 'bad_image')
    await rpcService('svc_use_pro_piece', { p_export: exportId, p_user: uid })   // counts against the paid export
    let out
    try { out = await processPiece(image, cells) } catch { throw httpError(400, 'bad_image') }
    await rpcService('svc_pro_piece_done', { p_export: exportId, p_user: uid })   // fails if already refunded
    res.statusCode = 200
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.end(out)
  } finally {
    busy--
  }
})
