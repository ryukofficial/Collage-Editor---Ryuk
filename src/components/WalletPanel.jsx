import { useCallback, useEffect, useState } from 'react'
import { X, Copy, Check, LogOut, RefreshCw } from 'lucide-react'
import {
  useWallet, walletEnabled, signUp, logIn, logOut, refreshWallet, requestTopup, walletHistory,
  upiLink, UPI_ID, UPI_NAME, AUTO_COLLAGE_PRICE, walletError, cleanPhone,
  adminPendingTopups, adminDecideTopup, adminAdjustBalance,
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
const okText = { margin: '8px 0 0', color: C.green, fontSize: '13px', lineHeight: 1.45 }
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

// ── Add money (manual UPI) ───────────────────────────────────────────────────
function AddMoney({ onSent }) {
  const [amount, setAmount] = useState(50)
  const [utr, setUtr] = useState('')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const copyId = async () => {
    try { await navigator.clipboard.writeText(UPI_ID); setCopied(true); setTimeout(() => setCopied(false), 1500) }
    catch { /* clipboard blocked: the ID is shown on screen anyway */ }
  }

  const submit = async e => {
    e.preventDefault()
    setError(''); setDone('')
    setBusy(true)
    try {
      await requestTopup(amount, utr)
      setDone(`Sent! ${rupees(amount)} will be added once the payment is checked.`)
      setUtr('')
      onSent()
    } catch (err) {
      setError(walletError(err))
    } finally {
      setBusy(false)
    }
  }

  if (!UPI_ID) {
    return (
      <div style={section}>
        <p style={{ margin: 0, color: C.text2, fontSize: '13px' }}>Adding money isn’t available yet. (Admin: set VITE_UPI_ID in Vercel.)</p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} style={section}>
      <p style={{ margin: '0 0 10px', color: C.text, fontSize: '14px', fontWeight: 700 }}>Add money</p>

      <label style={label}>1. Choose an amount</label>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
        {[20, 50, 100, 200, 500].map(a => (
          <button key={a} type="button" onClick={() => setAmount(a)}
            style={{ ...btn, height: '36px', padding: '0 12px', fontSize: '13px', background: amount === a ? C.accent : C.raised, borderColor: amount === a ? C.accent : C.border, color: amount === a ? '#fff' : C.text }}>
            {rupees(a)}
          </button>
        ))}
      </div>
      <input style={{ ...input, marginBottom: '6px' }} inputMode="numeric" aria-label="Amount in rupees"
        value={amount} onChange={e => setAmount(Number(e.target.value.replace(/\D/g, '')) || '')} />
      <p style={{ margin: '0 0 14px', color: C.text3, fontSize: '12px' }}>
        {amount >= AUTO_COLLAGE_PRICE ? `= ${Math.floor(amount / AUTO_COLLAGE_PRICE)} Auto Collage${Math.floor(amount / AUTO_COLLAGE_PRICE) === 1 ? '' : 's'} (₹${AUTO_COLLAGE_PRICE} each)` : `Minimum ₹10`}
      </p>

      <label style={label}>2. Pay with any UPI app</label>
      <a href={upiLink(amount || 0)} style={{ ...btnPrimary, width: '100%', boxSizing: 'border-box', textDecoration: 'none', marginBottom: '8px' }}>
        Pay {rupees(amount)} with UPI app
      </a>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: C.raised, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '8px 10px', marginBottom: '14px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, color: C.text3, fontSize: '11px' }}>or pay manually to {UPI_NAME}</p>
          <p style={{ margin: '2px 0 0', color: C.text, fontSize: '14px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{UPI_ID}</p>
        </div>
        <button type="button" onClick={copyId} style={{ ...btn, height: '32px', padding: '0 10px', fontSize: '12px' }}>
          {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
        </button>
      </div>

      <label style={label} htmlFor="w-utr">3. Enter the UPI reference number (UTR) from your payment app</label>
      <input id="w-utr" style={input} placeholder="e.g. 412345678901" autoCapitalize="characters"
        value={utr} onChange={e => setUtr(e.target.value)} />
      <p style={{ margin: '6px 0 0', color: C.text3, fontSize: '12px', lineHeight: 1.5 }}>
        Find it in your UPI app’s payment details (12 digits, sometimes called “UPI Ref No” or “UTR”).
      </p>

      {error && <p style={errorText}>{error}</p>}
      {done && <p style={okText}>{done}</p>}
      <button type="submit" disabled={busy || !utr.trim() || !amount} style={{ ...btnPrimary, width: '100%', marginTop: '12px', opacity: busy || !utr.trim() || !amount ? 0.5 : 1 }}>
        {busy ? 'Sending…' : "I've paid — send for approval"}
      </button>
    </form>
  )
}

// ── Activity list ────────────────────────────────────────────────────────────
function History({ data }) {
  if (!data) return <p style={{ color: C.text3, fontSize: '13px', margin: '4px 0 12px' }}>Loading…</p>
  const rows = [
    ...data.requests.map(r => ({
      key: `r${r.id}`, t: r.created_at, amount: r.amount,
      title: r.status === 'pending' ? 'Top-up waiting for approval' : 'Top-up rejected',
      sub: `UPI ${r.utr}`, color: r.status === 'pending' ? C.amber : C.red, sign: '',
    })),
    ...data.transactions.map(x => ({
      key: `t${x.id}`, t: x.created_at, amount: Math.abs(x.amount),
      title: x.kind === 'charge' ? 'Auto Collage' : x.kind === 'topup' ? 'Money added' : (x.note || 'Adjusted by admin'),
      sub: x.kind === 'topup' ? x.note : '', color: x.amount < 0 ? C.text2 : C.green, sign: x.amount < 0 ? '−' : '+',
    })),
  ].sort((a, b) => new Date(b.t) - new Date(a.t))

  if (!rows.length) return <p style={{ color: C.text3, fontSize: '13px', margin: '4px 0 12px' }}>No activity yet.</p>
  return (
    <div style={{ ...section, padding: '4px 14px' }}>
      {rows.map((r, i) => (
        <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderTop: i ? `1px solid ${C.divider}` : 'none' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, color: C.text, fontSize: '13px', fontWeight: 600 }}>{r.title}</p>
            <p style={{ margin: '2px 0 0', color: C.text3, fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {when(r.t)}{r.sub ? ` · ${r.sub}` : ''}
            </p>
          </div>
          <span style={{ color: r.color, fontSize: '14px', fontWeight: 700, flexShrink: 0 }}>{r.sign}{rupees(r.amount)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Admin: approve top-ups, adjust balances ──────────────────────────────────
function AdminSection() {
  const [pending, setPending] = useState(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [adjPhone, setAdjPhone] = useState('')
  const [adjAmount, setAdjAmount] = useState('')
  const [adjMsg, setAdjMsg] = useState('')

  const load = useCallback(async () => {
    setError('')
    try { setPending(await adminPendingTopups()) } catch (err) { setError(walletError(err)) }
  }, [])
  useEffect(() => { load() }, [load])

  const decide = async (id, approve) => {
    setBusyId(id); setError('')
    try { await adminDecideTopup(id, approve); await load() }
    catch (err) { setError(walletError(err)) }
    finally { setBusyId(null) }
  }

  const adjust = async e => {
    e.preventDefault()
    setAdjMsg('')
    try {
      const bal = await adminAdjustBalance(adjPhone, adjAmount, 'Adjusted by admin')
      setAdjMsg(`Done. ${cleanPhone(adjPhone)} now has ${rupees(bal)}.`)
      setAdjAmount('')
    } catch (err) { setAdjMsg(walletError(err)) }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '18px 0 8px' }}>
        <p style={{ margin: 0, color: C.text, fontSize: '14px', fontWeight: 700 }}>Admin · top-ups to check {pending ? `(${pending.length})` : ''}</p>
        <button type="button" onClick={load} aria-label="Refresh" style={{ ...btn, height: '32px', padding: '0 10px' }}><RefreshCw size={14} /></button>
      </div>
      <div style={{ ...section, padding: pending?.length ? '4px 14px' : '14px' }}>
        {!pending && !error && <p style={{ margin: 0, color: C.text3, fontSize: '13px' }}>Loading…</p>}
        {pending && !pending.length && <p style={{ margin: 0, color: C.text3, fontSize: '13px' }}>Nothing waiting.</p>}
        {pending?.map((p, i) => (
          <div key={p.id} style={{ padding: '10px 0', borderTop: i ? `1px solid ${C.divider}` : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ color: C.text, fontSize: '14px', fontWeight: 700 }}>{rupees(p.amount)}</span>
              <span style={{ color: C.text3, fontSize: '11px' }}>{when(p.created_at)}</span>
            </div>
            <p style={{ margin: '2px 0 8px', color: C.text2, fontSize: '12px' }}>{p.phone} · UTR <b style={{ color: C.text }}>{p.utr}</b></p>
            <p style={{ margin: '0 0 8px', color: C.text3, fontSize: '11px' }}>Check your bank/UPI app for this reference and amount before approving.</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" disabled={busyId === p.id} onClick={() => decide(p.id, true)}
                style={{ ...btn, flex: 1, height: '36px', background: '#16a34a', borderColor: '#16a34a', color: '#fff' }}>Approve</button>
              <button type="button" disabled={busyId === p.id} onClick={() => decide(p.id, false)}
                style={{ ...btn, flex: 1, height: '36px', color: C.red }}>Reject</button>
            </div>
          </div>
        ))}
        {error && <p style={errorText}>{error}</p>}
      </div>

      <form onSubmit={adjust} style={section}>
        <p style={{ margin: '0 0 10px', color: C.text, fontSize: '13px', fontWeight: 700 }}>Add or remove money by phone number</p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input style={{ ...input, flex: 2 }} inputMode="numeric" placeholder="Phone" value={adjPhone} onChange={e => setAdjPhone(e.target.value)} />
          <input style={{ ...input, flex: 1 }} inputMode="numeric" placeholder="₹ (use − to remove)" value={adjAmount} onChange={e => setAdjAmount(e.target.value.replace(/[^\d-]/g, ''))} />
        </div>
        <button type="submit" disabled={!adjPhone || !adjAmount} style={{ ...btn, width: '100%', marginTop: '10px', opacity: !adjPhone || !adjAmount ? 0.5 : 1 }}>Apply</button>
        {adjMsg && <p style={{ margin: '8px 0 0', color: C.text2, fontSize: '12px' }}>{adjMsg}</p>}
      </form>
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
    try { setHistory(await walletHistory()) } catch { setHistory({ transactions: [], requests: [] }) }
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
                  <p style={{ margin: 0, color: C.text3, fontSize: '12px' }}>Balance · {w.phone}</p>
                  <p style={{ margin: '2px 0 0', color: C.text, fontSize: '28px', fontWeight: 700 }}>{w.balance == null ? '…' : rupees(w.balance)}</p>
                  <p style={{ margin: '2px 0 0', color: C.text3, fontSize: '12px' }}>Auto Collage costs ₹{AUTO_COLLAGE_PRICE} each time you add skins to the canvas.</p>
                </div>
              </div>

              {reason && <p style={{ margin: '0 0 12px', color: C.amber, fontSize: '13px', lineHeight: 1.5 }}>{reason}</p>}

              {!showAdd ? (
                <button type="button" onClick={() => setShowAdd(true)} style={{ ...btnPrimary, width: '100%', marginBottom: '12px' }}>Add money</button>
              ) : (
                <AddMoney onSent={loadHistory} />
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
