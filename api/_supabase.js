// Talks to Supabase from the server. The service-role key never leaves the server.
import { httpError } from './_http.js'

const URL_ = () => (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
const ANON = () => process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const SERVICE = () => process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export function supabaseConfigured() {
  return !!(URL_() && ANON() && SERVICE())
}

// Who is calling? Checks the login token with Supabase. Returns the user id.
export async function userFromToken(token) {
  if (!token) throw httpError(401, 'not_logged_in')
  const r = await fetch(`${URL_()}/auth/v1/user`, { headers: { apikey: ANON(), Authorization: `Bearer ${token}` } })
  if (r.status === 401 || r.status === 403) throw httpError(401, 'not_logged_in')
  if (!r.ok) throw new Error(`auth check failed: ${r.status}`)
  const u = await r.json()
  if (!u?.id || !/^[0-9a-f-]{36}$/i.test(u.id)) throw httpError(401, 'not_logged_in')
  return u.id
}

async function rpc(fn, args, key, token) {
  const r = await fetch(`${URL_()}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args || {}),
  })
  const text = await r.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!r.ok) {
    // database errors raised with a short code (e.g. 'insufficient_balance') are passed on
    const msg = String(data?.message || '')
    const e = httpError(r.status >= 500 ? 500 : 400, /^[a-z_]{3,40}$/.test(msg) ? msg : 'server_error')
    if (e.code === 'server_error') e.message = `rpc ${fn} failed: ${r.status} ${msg.slice(0, 120)}`
    throw e
  }
  return data
}

// Server-only database functions (svc_…)
export const rpcService = (fn, args) => rpc(fn, args, SERVICE(), SERVICE())
// Functions that run as the logged-in person (their own permissions)
export const rpcAsUser = (token, fn, args) => rpc(fn, args, ANON(), token)
