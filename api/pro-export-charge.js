// POST /api/pro-export-charge → takes ₹50 for one Ryuk export (Dark or Classic).
// The effect itself now runs on the customer's phone, so this is the only call
// the export needs: one tiny request, made after the picture is ready.
import { handler, send, bearer, httpError } from './_http.js'
import { userFromToken, rpcService, supabaseConfigured } from './_supabase.js'

const one = rows => (Array.isArray(rows) ? rows[0] : rows)

export default handler(['POST'], async (req, res) => {
  if (!supabaseConfigured()) throw httpError(503, 'not_configured')
  const uid = await userFromToken(bearer(req))
  // open → mark one part made → close: the ₹50 stays charged (no refund path)
  const row = one(await rpcService('svc_start_pro_export', { p_user: uid, p_pieces: 1 }))
  await rpcService('svc_use_pro_piece', { p_export: row.export_id, p_user: uid })
  await rpcService('svc_pro_piece_done', { p_export: row.export_id, p_user: uid })
  const fin = one(await rpcService('svc_finish_pro_export', { p_export: row.export_id, p_user: uid, p_failed: false }))
  send(res, 200, { balance: fin?.balance ?? row.balance })
})
