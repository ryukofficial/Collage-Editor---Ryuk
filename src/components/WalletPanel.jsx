import { useCallback, useEffect, useState } from 'react'
import { X, LogOut, RefreshCw, Copy, Check } from 'lucide-react'
import QRCode from 'qrcode'
import {
  useWallet, walletEnabled, signUp, logIn, logOut, refreshWallet, walletHistory,
  AUTO_COLLAGE_PRICE, walletError, cleanPhone, UPI_ID, UPI_NAME, upiLink, whatsappLink,
  adminAdjustBalance, adminFindWallet, adminRecentAdjustments,
} from '../utils/wallet'

// ── Look (same palette as the rest of the app) ───────────────────────────────
const C = {
  bg: '#0f1115', surface: '#16181d', raised: '#1c1f26', border: '#2a2e37', divider: '#23262e',
  text: '#e6e8ec', text2: '#a1a7b3', text3: '#6b717c', accent: '#3b82f6',
  green: '#22c55e', amber: '#f59e0b', red: '#f87171',
}
const input = {
  width: '100%', boxSizing: 'border-box', height: '42px', background: C.raised, border: `1px solid ${C.border}`,
  borderRadius: '8px', color: C.text, fontSize: '15px', padding: '0 12px', outline: 'none',
}
const btn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '42px',
  borderRadius: '8px', border: `1px solid ${C.border}`, background: C.raised, color: C.text,
  fontSize: '14px', fontWeight: 600, cursor: 'pointer', padding: '0 14px',
}
const btnPrimary = { ...btn, background: C.accent, border: `1px solid ${C.accent}`, color: '#fff' }
const label = { display: 'block', margin: '0 0 6px', color: C.text2, fontSize: '12px', fontWeight: 600 }
const section = { background: C.surface, border: `1px solid ${C.divider}`, borderRadius: '12px', padding: '14px', marginBottom: '12px' }
const errorText = { margin: '8px 0 0', color: C.red, fontSize: '13px', lineHeight: 1.45 }
// short code that proves which account a WhatsApp message came from
const walletCode = user => String(user?.id || '').replace(/-/g, '').slice(0, 6).toUpperCase()
const rupees = n => `₹${Number(n || 0).toLocaleString('en-IN')}`
const when = t => new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

// ── Log in / sign up ─────────────────────────────────────────────────────────
function AuthForm({ reason }) {
  const [mode, setMode] = useState('login')      // login | signup
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async e => {
    e.preventDefault()
    setError('')
    if (mode === 'signup' && password !== password2) { setError('The two passwords are different.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    setBusy(true)
    try {
      if (mode === 'signup') await signUp(phone, password)
      else await logIn(phone, password)
    } catch (err) {
      setError(walletError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} style={section}>
      {reason && <p style={{ margin: '0 0 12px', color: C.text2, fontSize: '13px', lineHeight: 1.5 }}>{reason}</p>}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
        {[['login', 'Log in'], ['signup', 'Create account']].map(([m, t]) => (
          <button key={m} type="button" onClick={() => { setMode(m); setError('') }}
            style={{ ...btn, flex: 1, height: '36px', fontSize: '13px', background: mode === m ? C.border : 'none', color: mode === m ? C.text : C.text3 }}>
            {t}
          </button>
        ))}
      </div>

      <label style={label} htmlFor="w-phone">Mobile number</label>
      <input id="w-phone" style={{ ...input, marginBottom: '12px' }} inputMode="numeric" autoComplete="tel"
        placeholder="10-digit number" value={phone} onChange={e => setPhone(e.target.value)} />

      <label style={label} htmlFor="w-pass">Password</label>
      <input id="w-pass" style={{ ...input, marginBottom: mode === 'signup' ? '12px' : 0 }} type="password"
        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        placeholder="At least 6 characters" value={password} onChange={e => setPassword(e.target.value)} />

      {mode === 'signup' && (
        <>
          <label style={label} htmlFor="w-pass2">Password again</label>
          <input id="w-pass2" style={input} type="password" autoComplete="new-password"
            value={password2} onChange={e => setPassword2(e.target.value)} />
        </>
      )}

      {error && <p style={errorText}>{error}</p>}
      <button type="submit" disabled={busy} style={{ ...btnPrimary, width: '100%', marginTop: '14px', opacity: busy ? 0.6 : 1 }}>
        {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}
      </button>
      {mode === 'login' && (
        <p style={{ margin: '10px 0 0', color: C.text3, fontSize: '12px', lineHeight: 1.5 }}>
          Forgot your password? Contact the developer from the ☰ menu.
        </p>
      )}
    </form>
  )
}

// ── Add money: pay by UPI, then message the admin on WhatsApp ────────────────
function AddMoney({ phone, code }) {
  const [amount, setAmount] = useState('')
  const [utr, setUtr] = useState('')
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  const n = Number(amount) || 0

  // the QR holds only your UPI ID (+ amount if typed); it is made on the phone
  useEffect(() => {
    if (!UPI_ID) return
    let alive = true
    QRCode.toDataURL(upiLink(n), { margin: 1, width: 440, errorCorrectionLevel: 'M' })
      .then(url => { if (alive) setQr(url) })
      .catch(() => { if (alive) setQr('') })
    return () => { alive = false }
  }, [n])

  const copyId = async () => {
    try { await navigator.clipboard.writeText(UPI_ID); setCopied(true); setTimeout(() => setCopied(false), 1500) }
    catch { /* clipboard blocked: the ID is on screen anyway */ }
  }

  if (!UPI_ID) {
    return <div style={section}><p style={{ margin: 0, color: C.text2, fontSize: '13px' }}>Adding money isn’t set up yet. (Admin: set VITE_UPI_ID in Vercel.)</p></div>
  }

  const message = [
    'Hi! I added money to my Ryuk Creates wallet.',
    `Wallet phone: ${phone}`,
    `Wallet code: ${code}`,
    `Amount: ${n > 0 ? rupees(n) : '(amount)'}`,
    `UPI reference (UTR): ${utr.trim() || '(attached screenshot)'}`,
  ].join('\n')

  return (
    <div style={section}>
      <p style={{ margin: '0 0 12px', color: C.text, fontSize: '14px', fontWeight: 700 }}>Add money</p>

      <label style={label}>1. Pay any amount to this UPI</label>
      <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 10px' }}>
        {qr
          ? <img src={qr} alt={`UPI QR code for ${UPI_ID}`} style={{ width: '200px', height: '200px', borderRadius: '10px', background: '#fff', padding: '6px' }} />
          : <div style={{ width: '200px', height: '200px', borderRadius: '10px', background: C.raised }} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: C.raised, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '8px 10px', marginBottom: '8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, color: C.text3, fontSize: '11px' }}>{UPI_NAME}</p>
          <p style={{ margin: '2px 0 0', color: C.text, fontSize: '14px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{UPI_ID}</p>
        </div>
        <button type="button" onClick={copyId} style={{ ...btn, height: '32px', padding: '0 10px', fontSize: '12px' }}>
          {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
        </button>
      </div>
      <input style={{ ...input, marginBottom: '8px' }} inputMode="numeric" placeholder="Amount (optional), e.g. 100" aria-label="Amount in rupees"
        value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, '').slice(0, 5))} />
      <a href={upiLink(n)} style={{ ...btnPrimary, width: '100%', boxSizing: 'border-box', textDecoration: 'none' }}>
        {n > 0 ? `Pay ${rupees(n)} with a UPI app` : 'Open a UPI app to pay'}
      </a>
      <p style={{ margin: '6px 0 14px', color: C.text3, fontSize: '12px' }}>
        ₹{AUTO_COLLAGE_PRICE} = 1 Auto Collage scan.
      </p>

      <label style={label} htmlFor="w-utr">2. UPI reference number (optional, helps us find your payment)</label>
      <input id="w-utr" style={{ ...input, marginBottom: '10px' }} placeholder="e.g. 412345678901" value={utr} onChange={e => setUtr(e.target.value.replace(/[^\w]/g, '').slice(0, 30))} />

      <label style={label}>3. Tell us on WhatsApp</label>
      <a href={whatsappLink(message)} target="_blank" rel="noopener noreferrer"
        style={{ ...btn, width: '100%', boxSizing: 'border-box', textDecoration: 'none', background: '#16a34a', borderColor: '#16a34a', color: '#fff' }}>
        I’ve paid — message on WhatsApp
      </a>
      <p style={{ margin: '8px 0 0', color: C.text3, fontSize: '11px', lineHeight: 1.5 }}>
        Send the payment screenshot in the chat too. The money is added to your wallet by hand after we check the payment.
      </p>
    </div>
  )
}

// ── Activity list ────────────────────────────────────────────────────────────
const TITLES = { topup: 'Money added', charge: 'Auto Collage scan', refund: 'Refund · nothing found' }
function History({ data }) {
  if (!data) return <p style={{ color: C.text3, fontSize: '13px', margin: '4px 0 12px' }}>Loading…</p>
  if (!data.length) return <p style={{ color: C.text3, fontSize: '13px', margin: '4px 0 12px' }}>No activity yet.</p>
  return (
    <div style={{ ...section, padding: '4px 14px' }}>
      {data.map((x, i) => (
        <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderTop: i ? `1px solid ${C.divider}` : 'none' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, color: C.text, fontSize: '13px', fontWeight: 600 }}>{TITLES[x.kind] || x.note || 'Changed by admin'}</p>
            <p style={{ margin: '2px 0 0', color: C.text3, fontSize: '11px' }}>{when(x.created_at)}</p>
          </div>
          <span style={{ color: x.amount < 0 ? C.text2 : C.green, fontSize: '14px', fontWeight: 700, flexShrink: 0 }}>
            {x.amount < 0 ? '−' : '+'}{rupees(Math.abs(x.amount))}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Admin: add money for customers, recent payments ──────────────────────────
function AdminSection() {
  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [found, setFound] = useState(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [payments, setPayments] = useState(null)

  const loadPayments = useCallback(async () => {
    try { setPayments(await adminRecentAdjustments()) } catch (err) { setPayments([]); setMsg(walletError(err)) }
  }, [])
  useEffect(() => { loadPayments() }, [loadPayments])

  const look = async () => {
    setMsg(''); setFound(null)
    try {
      const w = await adminFindWallet(phone)
      if (!w) setMsg('No account with that phone number.')
      setFound(w)
    } catch (err) { setMsg(walletError(err)) }
  }

  const apply = async e => {
    e.preventDefault()
    const n = Number(amount)
    if (!Number.isInteger(n) || n === 0) { setMsg('Enter a whole amount, e.g. 50 to add or -20 to remove.'); return }
    if (!window.confirm(`${n > 0 ? 'Add' : 'Remove'} ₹${Math.abs(n)} ${n > 0 ? 'to' : 'from'} ${cleanPhone(phone)}?`)) return
    setBusy(true); setMsg('')
    try {
      const bal = await adminAdjustBalance(phone, n, n > 0 ? 'Added by admin' : 'Removed by admin')
      setMsg(`Done. ${cleanPhone(phone)} now has ${rupees(bal)}.`)
      setFound(f => (f ? { ...f, balance: bal } : f))
      setAmount('')
      loadPayments()
    } catch (err) { setMsg(walletError(err)) }
    finally { setBusy(false) }
  }

  return (
    <>
      <p style={{ margin: '18px 0 8px', color: C.text, fontSize: '14px', fontWeight: 700 }}>Admin</p>
      <form onSubmit={apply} style={section}>
        <p style={{ margin: '0 0 10px', color: C.text, fontSize: '13px', fontWeight: 700 }}>Add or remove money for a customer</p>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <input style={{ ...input, flex: 1 }} inputMode="numeric" placeholder="Customer phone" value={phone} onChange={e => { setPhone(e.target.value); setFound(null) }} />
          <button type="button" onClick={look} disabled={!phone} style={{ ...btn, opacity: phone ? 1 : 0.5 }}>Check</button>
        </div>
        {found && (
          <p style={{ margin: '0 0 8px', color: C.text2, fontSize: '12px', lineHeight: 1.5 }}>
            {found.phone} · balance {rupees(found.balance)} · code <b style={{ color: C.text }}>{found.code}</b>
            <br /><span style={{ color: C.text3 }}>Add money only if this code matches the one in their WhatsApp message.</span>
          </p>
        )}
        <input style={input} inputMode="numeric" placeholder="₹ amount (use − to remove)" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d-]/g, '').slice(0, 7))} />
        <button type="submit" disabled={busy || !phone || !amount} style={{ ...btnPrimary, width: '100%', marginTop: '10px', opacity: busy || !phone || !amount ? 0.5 : 1 }}>
          {busy ? 'Saving…' : 'Apply'}
        </button>
        {msg && <p style={{ margin: '8px 0 0', color: C.text2, fontSize: '12px' }}>{msg}</p>}
      </form>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 0 8px' }}>
        <p style={{ margin: 0, color: C.text, fontSize: '13px', fontWeight: 700 }}>Money you added recently</p>
        <button type="button" onClick={loadPayments} aria-label="Refresh" style={{ ...btn, height: '32px', padding: '0 10px' }}><RefreshCw size={14} /></button>
      </div>
      <div style={{ ...section, padding: payments?.length ? '4px 14px' : '14px' }}>
        {!payments && <p style={{ margin: 0, color: C.text3, fontSize: '13px' }}>Loading…</p>}
        {payments && !payments.length && <p style={{ margin: 0, color: C.text3, fontSize: '13px' }}>Nothing yet.</p>}
        {payments?.map((p, i) => (
          <div key={`${p.created_at}${i}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0', borderTop: i ? `1px solid ${C.divider}` : 'none' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, color: C.text, fontSize: '13px', fontWeight: 600 }}>{p.phone}</p>
              <p style={{ margin: '2px 0 0', color: C.text3, fontSize: '11px' }}>{when(p.created_at)} · balance now {rupees(p.balance_after)}</p>
            </div>
            <span style={{ color: p.amount < 0 ? C.text2 : C.green, fontSize: '14px', fontWeight: 700 }}>{p.amount < 0 ? '−' : '+'}{rupees(Math.abs(p.amount))}</span>
          </div>
        ))}
      </div>
    </>
  )
}

// ── The sheet ────────────────────────────────────────────────────────────────
//   reason: optional line shown above the login form (e.g. why it opened)
export default function WalletPanel({ onClose, reason }) {
  const w = useWallet()
  const [history, setHistory] = useState(null)
  const [showAdd, setShowAdd] = useState(false)

  const loadHistory = useCallback(async () => {
    try { setHistory(await walletHistory()) } catch { setHistory([]) }
  }, [])

  useEffect(() => {
    if (w.user) { loadHistory(); refreshWallet().catch(() => {}) } else setHistory(null)
  }, [w.user, loadHistory])

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 350, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: C.bg, borderRadius: '16px 16px 0 0', border: `1px solid ${C.border}`, borderBottom: 'none', width: '100%', maxWidth: '520px', maxHeight: '90dvh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${C.divider}`, flexShrink: 0 }}>
          <p style={{ margin: 0, color: C.text, fontSize: '16px', fontWeight: 700 }}>Wallet</p>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', display: 'flex' }}><X size={20} /></button>
        </div>

        <div style={{ overflowY: 'auto', padding: '14px 16px 24px' }}>
          {!walletEnabled && (
            <div style={section}>
              <p style={{ margin: 0, color: C.text2, fontSize: '13px', lineHeight: 1.5 }}>
                The wallet isn’t switched on yet, so Auto Collage is free for now.
              </p>
            </div>
          )}

          {walletEnabled && !w.ready && <p style={{ color: C.text3, fontSize: '13px' }}>Loading…</p>}

          {walletEnabled && w.ready && !w.user && <AuthForm reason={reason} />}

          {walletEnabled && w.ready && w.user && (
            <>
              <div style={{ ...section, display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, color: C.text3, fontSize: '12px' }}>Balance · {w.phone} · code {walletCode(w.user)}</p>
                  <p style={{ margin: '2px 0 0', color: C.text, fontSize: '28px', fontWeight: 700 }}>{w.balance == null ? '…' : rupees(w.balance)}</p>
                  <p style={{ margin: '2px 0 0', color: C.text3, fontSize: '12px' }}>Auto Collage costs ₹{AUTO_COLLAGE_PRICE} per scan, refunded automatically if no skin is found.</p>
                </div>
              </div>

              {reason && <p style={{ margin: '0 0 12px', color: C.amber, fontSize: '13px', lineHeight: 1.5 }}>{reason}</p>}

              {!showAdd ? (
                <button type="button" onClick={() => setShowAdd(true)} style={{ ...btnPrimary, width: '100%', marginBottom: '12px' }}>Add money</button>
              ) : (
                <AddMoney phone={w.phone} code={walletCode(w.user)} />
              )}

              <p style={{ margin: '6px 0 8px', color: C.text, fontSize: '14px', fontWeight: 700 }}>Activity</p>
              <History data={history} />

              {w.admin && <AdminSection />}

              <button type="button" onClick={() => logOut()} style={{ ...btn, width: '100%', marginTop: '6px', color: C.text2 }}>
                <LogOut size={15} /> Log out
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
