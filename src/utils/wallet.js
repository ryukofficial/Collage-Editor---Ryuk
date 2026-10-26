// ─────────────────────────────────────────────────────────────────────────────
// Wallet — phone + password accounts, ₹ balance. Customers pay you by UPI and
// message you on WhatsApp; you add the money from the admin panel.
//
// The browser only ever gets PUBLIC settings (Vercel → Settings → Environment
// Variables):
//   VITE_SUPABASE_URL        https://xxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY   the "anon public" key (safe to be public)
//   VITE_UPI_ID              your UPI ID, e.g. ryuk@okaxis
//   VITE_UPI_NAME            the name shown in UPI apps, e.g. Ryuk Creates
//   VITE_WHATSAPP_NUMBER     your WhatsApp number with country code, e.g. 918453899194
// Everything secret (Supabase service key, GitHub token) lives
// only on the server, in the /api functions. Money only changes on the server.
//
// Until the two settings above exist, the wallet is switched off and Auto
// Collage stays free (and reads screenshots on the device), so nothing breaks.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'

const URL_ = import.meta.env.VITE_SUPABASE_URL
const KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY
export const AUTO_COLLAGE_PRICE = 10            // shown in the app; the real price is in the database
export const walletEnabled = !!(URL_ && KEY)
export const UPI_ID = import.meta.env.VITE_UPI_ID || ''
export const UPI_NAME = import.meta.env.VITE_UPI_NAME || 'Ryuk Creates'
export const WHATSAPP_NUMBER = String(import.meta.env.VITE_WHATSAPP_NUMBER || '918453899194').replace(/\D/g, '')

// Opens Google Pay / PhonePe / Paytm with the payment filled in (amount optional).
export function upiLink(amount) {
  const p = new URLSearchParams({ pa: UPI_ID, pn: UPI_NAME, cu: 'INR', tn: 'Ryuk Creates wallet' })
  if (amount > 0) p.set('am', String(amount))
  return `upi://pay?${p.toString()}`
}
export const whatsappLink = text => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`

// Phone numbers become a private login name; no email or SMS is ever sent.
const EMAIL_DOMAIN = 'phone.ryukcreates.app'
export const cleanPhone = p => String(p || '').replace(/\D/g, '').replace(/^(?:91|0)(?=\d{10}$)/, '')
export const validPhone = p => /^[6-9]\d{9}$/.test(cleanPhone(p))
const phoneToEmail = p => `${cleanPhone(p)}@${EMAIL_DOMAIN}`

// supabase-js is only downloaded when the wallet is actually used
let _client = null
async function client() {
  if (!walletEnabled) throw new Error('The wallet is not set up yet.')
  if (!_client) {
    const { createClient } = await import('@supabase/supabase-js')
    _client = createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true } })
    _client.auth.onAuthStateChange((_event, session) => {
      setState({ user: session?.user || null })
      // (Supabase asks not to call it again from inside this callback, hence the timeout)
      if (session?.user) setTimeout(() => { refreshWallet().catch(() => {}) }, 0)
      else setState({ balance: null, phone: '', admin: false })
    })
  }
  return _client
}

// ── Shared state (every component using useWallet() sees the same values) ────
let state = { ready: !walletEnabled, user: null, phone: '', balance: null, admin: false }
const listeners = new Set()
function setState(patch) {
  state = { ...state, ...patch }
  listeners.forEach(fn => fn(state))
}
export const walletState = () => state

export function useWallet() {
  const [s, set] = useState(state)
  useEffect(() => {
    listeners.add(set)
    set(state)
    if (walletEnabled && !state.ready) initWallet()
    return () => { listeners.delete(set) }
  }, [])
  return s
}

let _init = null
function initWallet() {
  if (!_init) {
    _init = (async () => {
      try {
        const sb = await client()
        const { data } = await sb.auth.getSession()
        setState({ user: data.session?.user || null })
        if (data.session?.user) await refreshWallet()
      } catch (err) {
        console.warn('[wallet] could not start', err?.message)
      } finally {
        setState({ ready: true })
      }
    })()
  }
  return _init
}

export async function refreshWallet() {
  const sb = await client()
  const [{ data: w }, { data: admin }] = await Promise.all([
    sb.from('wallets').select('phone, balance').maybeSingle(),
    sb.rpc('is_wallet_admin'),
  ])
  setState({ phone: w?.phone || '', balance: w ? w.balance : null, admin: !!admin })
  return w
}

// ── Friendly error messages ──────────────────────────────────────────────────
const MESSAGES = {
  not_logged_in:        'Please log in first.',
  insufficient_balance: `Not enough balance. Auto Collage costs ₹${AUTO_COLLAGE_PRICE} — add money to your wallet.`,
  too_many_scans:       'Too many scans in the last hour. Please try again later.',
  invalid_request:      'Something in the request was not valid. Please try again.',
  scan_closed:          'This scan has ended. Please start a new scan.',
  scan_used_up:         'This scan has no screenshots left.',
  unknown_scan:         'This scan could not be found. Please start a new scan.',
  too_large:            'That screenshot is too large.',
  bad_image:            'That file is not a screenshot we can read (use PNG or JPG).',
  busy:                 'The server is busy. Please try again in a moment.',
  scan_busy:            'Your screenshots are still being read. Please wait a moment.',
  not_admin:            'Only the admin can do this.',
  not_configured:       'This feature is not switched on yet.',
  no_such_user:         'No account with that phone number.',
  server_error:         'Something went wrong on the server. Please try again.',
}
export function walletError(err) {
  const msg = `${err?.code || ''} ${err?.message || (typeof err === 'string' ? err : '')}`
  for (const [code, text] of Object.entries(MESSAGES)) if (new RegExp(`\\b${code}\\b`).test(msg)) return text
  if (/invalid login credentials/i.test(msg)) return 'Wrong phone number or password.'
  if (/already registered|already been registered|user already exists/i.test(msg)) return 'This phone number already has an account. Log in instead.'
  if (/password should be at least|weak password/i.test(msg)) return 'Password must be at least 6 characters.'
  if (/failed to fetch|network|load failed/i.test(msg)) return 'Could not reach the server. Check your internet and try again.'
  if (/rate limit|too many requests/i.test(msg)) return 'Too many attempts. Please wait a few minutes and try again.'
  return 'Something went wrong. Please try again.'
}

// ── Accounts ─────────────────────────────────────────────────────────────────
export async function signUp(phone, password) {
  if (!validPhone(phone)) throw new Error('Enter a valid 10-digit mobile number.')
  const sb = await client()
  const { data, error } = await sb.auth.signUp({
    email: phoneToEmail(phone), password,
    options: { data: { phone: cleanPhone(phone) } },
  })
  if (error) throw error
  if (!data.session) {
    throw new Error('Account created, but sign-in is waiting for email confirmation. Turn off "Confirm email" in Supabase (see setup steps), then log in.')
  }
  await refreshWallet()
}

export async function logIn(phone, password) {
  if (!validPhone(phone)) throw new Error('Enter a valid 10-digit mobile number.')
  const sb = await client()
  const { error } = await sb.auth.signInWithPassword({ email: phoneToEmail(phone), password })
  if (error) throw error
  await refreshWallet()
}

export async function logOut() {
  const sb = await client()
  await sb.auth.signOut()
  setState({ user: null, phone: '', balance: null, admin: false })
}

async function accessToken() {
  const sb = await client()
  const { data } = await sb.auth.getSession()
  const token = data.session?.access_token
  if (!token) { const e = new Error('not_logged_in'); e.code = 'not_logged_in'; throw e }
  return token
}

// Calls one of our own /api functions as the logged-in person.
async function api(path, { json, body, headers = {}, signal } = {}) {
  const token = await accessToken()
  const r = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...(json ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: json ? JSON.stringify(json) : body,
    signal,
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    const e = new Error(data?.error || `http_${r.status}`)
    e.code = data?.error || (r.status === 413 ? 'too_large' : 'server_error')
    throw e
  }
  return data
}

// ── Money ────────────────────────────────────────────────────────────────────
export async function walletHistory() {
  const sb = await client()
  const { data, error } = await sb.from('wallet_transactions')
    .select('id, amount, kind, note, created_at').order('created_at', { ascending: false }).limit(30)
  if (error) throw error
  return data || []
}

// ── Paid scanning (the screenshots are read on the server) ───────────────────
export async function startScan(pages) {
  const out = await api('scan-start', { json: { pages } })
  setState({ balance: out.balance })
  return out.scan_id
}
export async function scanPage(scanId, blob, signal) {
  return api('scan-page', { body: blob, headers: { 'Content-Type': blob.type, 'X-Scan-Id': scanId }, signal })
}
export async function finishScan(scanId) {
  const out = await api('scan-finish', { json: { scan_id: scanId } })
  if (out.balance != null) setState({ balance: out.balance })
  return out
}

// ── Admin ────────────────────────────────────────────────────────────────────
async function rpc(fn, args) {
  const sb = await client()
  const { data, error } = await sb.rpc(fn, args)
  if (error) throw error
  return data
}
export async function adminAdjustBalance(phone, amount, note) {
  const bal = await rpc('admin_adjust_balance', { p_phone: cleanPhone(phone), p_amount: Math.round(Number(amount)), p_note: note || null })
  if (cleanPhone(phone) === state.phone) setState({ balance: bal })
  return bal
}
export const adminFindWallet = async phone => ((await rpc('admin_find_wallet', { p_phone: cleanPhone(phone) })) || [])[0] || null
export const adminRecentAdjustments = async () => (await rpc('admin_recent_adjustments', {})) || []
export const adminSaveTiers = tiers => api('admin-save-tiers', { json: { tiers } })
