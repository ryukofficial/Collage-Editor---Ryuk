// POST /api/profile-export → takes ₹10 for one Ryuk Profile HD export
import { handler, send, bearer, httpError } from './_http.js'
import { userFromToken, rpcService, supabaseConfigured } from './_supabase.js'

export default handler(['POST'], async (req, res) => {
  if (!supabaseConfigured()) throw httpError(503, 'not_configured')
  const uid = await userFromToken(bearer(req))
  let rows
  try {
    rows = await rpcService('svc_charge_profile_export', { p_user: uid })
  } catch (err) {
    // the database function has not been added yet (supabase-ryuk-profile.sql)
    if (/PGRST202|Could not find the function|404/.test(err?.message || '')) throw httpError(503, 'not_configured')
    throw err
  }
  const row = Array.isArray(rows) ? rows[0] : rows
  send(res, 200, { balance: row?.balance ?? null })
})
