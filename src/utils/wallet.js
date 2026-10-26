// ─────────────────────────────────────────────────────────────────────────────
// Wallet — phone + password accounts, ₹ balance, manual UPI top-ups.
//
// Runs on Supabase (free). Set these in Vercel → Project → Settings →
// Environment Variables, then redeploy:
//   VITE_SUPABASE_URL       https://xxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY  the "anon public" key
//   VITE_UPI_ID             your UPI ID, e.g. ryuk@okaxis
//   VITE_UPI_NAME           the name shown in the UPI app, e.g. Ryuk Creates
//
// Until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set, the wallet is
// switched off and Auto Collage stays free, so nothing breaks before setup.
// The database side (prices, balances, approvals) is in supabase/wallet_setup.sql.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'

const URL_  = import.meta.env.VITE_SUPABASE_URL
const KEY   = import.meta.env.VITE_SUPABASE_ANON_KEY
export const UPI_ID   = import.meta.env.VITE_UPI_ID || ''
export const UPI_NAME = import.meta.env.VITE_UPI_NAME || 'Ryuk Creates'
export const AUTO_COLLAGE_PRICE = 10            // shown in the app; the real price is in the database
export const walletEnabled = !!(URL_ && KEY)

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
        console.warn('[wallet] could not start', err)
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
  utr_already_used:     'This UPI reference number has already been used.',
  invalid_request:      'Please check the amount (₹10–₹10,000) and the UPI reference number (6–30 letters/numbers).',
  too_many_pending:     'You already have 5 top-ups waiting for approval. Please wait for them to be checked.',
  not_admin:            'Only the admin can do this.',
  not_pending:          'This top-up was already approved or rejected.',
  no_such_user:         'No account with that phone number.',
}
export function walletError(err) {
  const msg = String(err?.message || err || '')
  for (const [code, text] of Object.entries(MESSAGES)) if (msg.includes(code)) return text
  if (/invalid login credentials/i.test(msg)) return 'Wrong phone number or password.'
  if (/already registered|already been registered|user already exists/i.test(msg)) return 'This phone number already has an account. Log in instead.'
  if (/password should be at least|weak password/i.test(msg)) return 'Password must be at least 6 characters.'
  if (/failed to fetch|network/i.test(msg)) return 'Could not reach the wallet server. Check your internet and try again.'
  return msg || 'Something went wrong. Please try again.'
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
    throw new Error('Account created, but Supabase is asking for email confirmation. Turn off "Confirm email" in Supabase (see setup steps), then log in.')
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

// ── Money ────────────────────────────────────────────────────────────────────
// Takes ₹10 for one Auto Collage. Throws (insufficient_balance…) if it can't.
export async function chargeAutoCollage() {
  const sb = await client()
  const { data, error } = await sb.rpc('charge_auto_collage')
  if (error) throw error
  setState({ balance: data })
  return data
}

export async function requestTopup(amount, utr) {
  const sb = await client()
  const { data, error } = await sb.rpc('request_topup', { p_amount: Math.round(Number(amount)), p_utr: utr })
  if (error) throw error
  return data
}

// The latest wallet activity: money in/out plus top-ups still waiting.
export async function walletHistory() {
  const sb = await client()
  const [tx, req] = await Promise.all([
    sb.from('wallet_transactions').select('id, amount, kind, note, created_at').order('created_at', { ascending: false }).limit(30),
    sb.from('topup_requests').select('id, amount, utr, status, created_at').neq('status', 'approved').order('created_at', { ascending: false }).limit(10),
  ])
  if (tx.error) throw tx.error
  if (req.error) throw req.error
  return { transactions: tx.data || [], requests: req.data || [] }
}

// A link that opens Google Pay / PhonePe / Paytm with the payment filled in.
export function upiLink(amount) {
  const p = new URLSearchParams({ pa: UPI_ID, pn: UPI_NAME, am: String(amount), cu: 'INR', tn: 'Ryuk Creates wallet' })
  return `upi://pay?${p.toString()}`
}

// ── Admin ────────────────────────────────────────────────────────────────────
export async function adminPendingTopups() {
  const sb = await client()
  const { data, error } = await sb.rpc('admin_pending_topups')
  if (error) throw error
  return data || []
}

export async function adminDecideTopup(id, approve) {
  const sb = await client()
  const { data, error } = await sb.rpc('admin_decide_topup', { p_id: id, p_approve: approve })
  if (error) throw error
  return data
}

export async function adminAdjustBalance(phone, amount, note) {
  const sb = await client()
  const { data, error } = await sb.rpc('admin_adjust_balance', { p_phone: cleanPhone(phone), p_amount: Math.round(Number(amount)), p_note: note || null })
  if (error) throw error
  if (cleanPhone(phone) === state.phone) setState({ balance: data })
  return data
}
