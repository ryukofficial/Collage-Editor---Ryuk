// Ryuk Creates — app shell: Home or Editor, plus the panels that slide up.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Toaster } from 'react-hot-toast'
import toast from 'react-hot-toast'
import { X, FolderOpen, Contact, Wallet, Shield, PlusSquare, MessageCircle, Store, Gem, Scissors } from 'lucide-react'
import Home from './Home.jsx'
import Editor from './editor/Editor.jsx'
import { useBack, Spinner } from './ui/Sheet.jsx'
import { useCollage } from './lib/store.js'
import { startStorage, rememberVersion, cleanUnusedUploads } from './lib/projects.js'
import { loadSkinIndex } from './lib/skins.js'
import { addUploads } from './lib/add.js'
import { persistStorage } from './lib/db.js'
import { useWallet, walletEnabled } from './lib/wallet.js'

const PickerSheet = lazy(() => import('./editor/PickerSheet.jsx'))
const AutoCollageSheet = lazy(() => import('./editor/AutoCollageSheet.jsx'))
const ArrangeSheet = lazy(() => import('./editor/ArrangeSheet.jsx'))
const CropSheet = lazy(() => import('./editor/CropSheet.jsx'))
const ProjectsSheet = lazy(() => import('./editor/ProjectsSheet.jsx'))
const ExportSheet = lazy(() => import('./export/ExportSheet.jsx'))
const BackgroundSheet = lazy(() => import('./editor/SmallSheets.jsx').then(m => ({ default: m.BackgroundSheet })))
const BannerSheet = lazy(() => import('./editor/SmallSheets.jsx').then(m => ({ default: m.BannerSheet })))
const CutSheet = lazy(() => import('./editor/ToolsSheets.jsx').then(m => ({ default: m.CutSheet })))
const WalletPanel = lazy(() => import('./components/WalletPanel.jsx'))
const AdminPanel = lazy(() => import('./components/AdminPanel.jsx'))
const AddSkinPanel = lazy(() => import('./components/AddSkinPanel.jsx'))
const RyukProfile = lazy(() => import('./components/RyukProfile/RyukProfile.jsx'))

// the older panels draw themselves; this adds the phone back button
function Legacy({ onClose, children }) { useBack(onClose); return children }

function Drawer({ onClose, open, admin }) {
  useBack(onClose)
  const wallet = useWallet()
  const go = (k, a) => { onClose(); setTimeout(() => open(k, a), 90) }
  const Item = ({ icon: I, title, sub, onClick, href, color }) => {
    const inner = <><span className="li-icon" style={color ? { color } : undefined}><I size={19} /></span><span className="grow"><span style={{ fontWeight: 700 }}>{title}</span><br /><span className="tiny muted">{sub}</span></span></>
    return href ? <a className="list-item" href={href} target="_blank" rel="noopener noreferrer">{inner}</a> : <button className="list-item" onClick={onClick}>{inner}</button>
  }
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <nav className="drawer">
        <div className="row" style={{ padding: '16px 14px 10px' }}>
          <div className="brand grow">Ryuk <b>Creates</b></div>
          <button className="icon-btn plain" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
          <Item icon={FolderOpen} title="Projects & history" sub="Saved, recent, exports" onClick={() => go('projects')} />
          <Item icon={Contact} title="Ryuk Profile" sub="Profile showcase edit" onClick={() => go('profile')} />
          <Item icon={Scissors} title="Cut skins" sub="From a screenshot" onClick={() => go('cut')} />
          {walletEnabled && <Item icon={Wallet} title="Wallet" sub={wallet.user ? `Balance ₹${wallet.balance ?? '…'}` : 'Log in or create an account'} onClick={() => go('wallet')} />}
          {admin && <Item icon={Shield} title="Admin panel" sub="Skin tiers, wallets" onClick={() => go('admin')} />}
          <Item icon={PlusSquare} title="Add skins / series" sub="Password protected" onClick={() => go('addskin')} />
          <div className="divider" />
          <Item icon={MessageCircle} title="Contact developer" sub="Chat on WhatsApp" href="https://wa.me/+918453899194" color="#8fb58f" />
          <Item icon={Store} title="Buy MLBB accounts" sub="WhatsApp channel" href="https://www.whatsapp.com/channel/0029Vb7BZhZ7oQhVBdxFo73a" color="#8fb58f" />
          <Item icon={Gem} title="Recharge diamonds" sub="ryukgames.com" href="https://ryukgames.com" color="#c9a66b" />
        </div>
        <div className="tiny muted" style={{ textAlign: 'center', padding: 14 }}>Ryuk Creates © {new Date().getFullYear()}</div>
      </nav>
    </>
  )
}

export default function App() {
  const loaded = useCollage(s => s.loaded)
  const count = useCollage(s => s.items.length)
  const [screen, setScreen] = useState(null)           // 'home' | 'editor'
  const [sheets, setSheets] = useState([])             // stack: [{ k, a }]
  const [drawer, setDrawer] = useState(false)
  const wallet = useWallet()
  const taps = useRef({ n: 0, t: 0 })

  useEffect(() => {
    startStorage().then(doc => setScreen(doc?.items?.length ? 'editor' : 'home'))
    loadSkinIndex()
    persistStorage()
    setTimeout(cleanUnusedUploads, 8000)
    const keep = setInterval(rememberVersion, 120000)
    return () => clearInterval(keep)
  }, [])

  const open = useCallback((k, a) => setSheets(s => [...s, { k, a }]), [])
  const closeTop = useCallback(k => setSheets(s => (k ? s.filter(x => x.k !== k) : s.slice(0, -1))), [])
  const goEditor = () => setScreen('editor')

  // a new collage from Home: once skins are added, show the editor
  const prevCount = useRef(count)
  useEffect(() => { if (count > prevCount.current && screen === 'home') setScreen('editor'); prevCount.current = count }, [count, screen])

  const upload = async files => {
    if (!files.length) return
    const t = toast.loading('Adding pictures…')
    const added = await addUploads(files, n => toast.loading(`Adding pictures… ${n}/${files.length}`, { id: t }))
    toast.success(`Added ${added.length} picture${added.length === 1 ? '' : 's'}`, { id: t })
  }

  // admin: tap the name 3 times (only admin accounts get in)
  const onBrand = () => {
    const now = Date.now(), t = taps.current
    t.n = now - t.t < 700 ? t.n + 1 : 1; t.t = now
    if (t.n >= 3) {
      t.n = 0
      if (!walletEnabled || wallet.admin) open('admin')
      else open('wallet', 'Admin area: log in with the admin account, then tap the name 3 times again.')
    }
  }

  const renderSheet = ({ k, a }, i) => {
    const close = () => closeTop(k)
    const toWallet = reason => open('wallet', reason)
    switch (k) {
      case 'picker': return <PickerSheet key={i} onClose={close} startTab={a || 'heroes'} />
      case 'auto': return <AutoCollageSheet key={i} onClose={close} onOpenWallet={toWallet} />
      case 'arrange': return <ArrangeSheet key={i} onClose={close} />
      case 'crop': return <CropSheet key={i} item={a} onClose={close} />
      case 'projects': return <ProjectsSheet key={i} onClose={close} onOpened={goEditor} />
      case 'export': return <ExportSheet key={i} onClose={close} onOpenWallet={toWallet} />
      case 'background': return <BackgroundSheet key={i} onClose={close} />
      case 'banner': return <BannerSheet key={i} onClose={close} />
      case 'cut': return <CutSheet key={i} onClose={close} onAdded={goEditor} />
      case 'wallet': return <Legacy key={i} onClose={close}><WalletPanel onClose={close} reason={a} /></Legacy>
      case 'admin': return <Legacy key={i} onClose={close}><AdminPanel onClose={close} /></Legacy>
      case 'addskin': return <Legacy key={i} onClose={close}><AddSkinPanel onClose={close} /></Legacy>
      case 'profile': return <Legacy key={i} onClose={close}><RyukProfile onClose={close} onOpenWallet={toWallet} /></Legacy>
      default: return null
    }
  }

  if (!loaded || !screen) return <div className="app"><div className="center-fill"><Spinner size={30} /></div></div>

  return (
    <>
      {screen === 'home'
        ? <Home open={open} onContinue={goEditor} onMenu={() => setDrawer(true)} onUpload={upload} onBrand={onBrand} />
        : <Editor open={open} onHome={() => { rememberVersion(); setScreen('home') }} />}
      {drawer && <Drawer onClose={() => setDrawer(false)} open={open} admin={wallet.admin} />}
      <Suspense fallback={<div className="sheet-backdrop"><Spinner size={30} /></div>}>
        {sheets.map(renderSheet)}
      </Suspense>
      <Toaster position="top-center" toastOptions={{ className: 'toast', duration: 3000 }} containerStyle={{ zIndex: 9999, top: 72 }} />
    </>
  )
}
