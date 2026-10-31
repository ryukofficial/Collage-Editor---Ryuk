// POST /api/pro-export-piece  (body: JPEG of one part of the collage)
//   header X-Export-Id; body = [len][preview][len][cells JSON [[x, y, size, fileName]]][part image]
// Only for a paid, open export that belongs to the caller. Returns the processed part as a high-quality JPEG.
import { handler, readBody, send, bearer, httpError } from './_http.js'
import { userFromToken, rpcService, supabaseConfigured } from './_supabase.js'
import { processPiece, paramsFromPreview, LOOK_NAMES } from './_pro.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BYTES = 4 * 1024 * 1024
let busy = 0

// cells: [[x, y, size, fileName or null], …]
function parseCells(text) {
  if (text.length > 20000) throw httpError(400, 'invalid_request')
  let cells
  try { cells = JSON.parse(text) } catch { throw httpError(400, 'invalid_request') }
  if (!Array.isArray(cells) || cells.length > 100) throw httpError(400, 'invalid_request')
  for (const c of cells) {
    if (!Array.isArray(c) || c.length !== 4 || !c.slice(0, 3).every(v => Number.isInteger(v) && v >= 0 && v <= 8000) || c[2] < 16) throw httpError(400, 'invalid_request')
    if (c[3] !== null && (typeof c[3] !== 'string' || c[3].length > 160)) throw httpError(400, 'invalid_request')
  }
  return cells
}

export default handler(['POST'], async (req, res) => {
  if (!supabaseConfigured()) throw httpError(503, 'not_configured')
  const uid = await userFromToken(bearer(req))
  const exportId = String(req.headers['x-export-id'] || '')
  if (!UUID.test(exportId)) throw httpError(400, 'invalid_request')
  const look = String(req.headers['x-look'] || 'dark')            // which effect the customer chose
  if (!LOOK_NAMES.includes(look)) throw httpError(400, 'invalid_request')
  if (!/^application\/octet-stream$/i.test(String(req.headers['content-type'] || ''))) throw httpError(400, 'bad_image')
  if (busy >= 3) throw httpError(503, 'busy')
  busy++
  try {
    const body = await readBody(req, MAX_BYTES)
    // [4-byte length][preview of the collage's skins][4-byte length][cells JSON][this part (JPEG or PNG)]
    if (body.length < 80) throw httpError(400, 'bad_image')
    const plen = body.readUInt32BE(0)
    if (plen < 60 || plen > 1_500_000 || 8 + plen + 60 > body.length) throw httpError(400, 'bad_image')
    const preview = body.subarray(4, 4 + plen)
    const mlen = body.readUInt32BE(4 + plen)
    if (mlen < 2 || mlen > 20000 || 8 + plen + mlen + 60 > body.length) throw httpError(400, 'invalid_request')
    const cells = parseCells(body.subarray(8 + plen, 8 + plen + mlen).toString('utf8'))
    const image = body.subarray(8 + plen + mlen)
    await rpcService('svc_use_pro_piece', { p_export: exportId, p_user: uid })   // counts against the paid export
    let out
    try { out = await processPiece(image, cells, await paramsFromPreview(preview), look) } catch { throw httpError(400, 'bad_image') }
    await rpcService('svc_pro_piece_done', { p_export: exportId, p_user: uid })   // fails if already refunded
    res.statusCode = 200
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Logos', JSON.stringify(out.logos))           // logo areas, kept crisp by HD upscale
    res.end(out.jpg)
  } finally {
    busy--
  }
})
