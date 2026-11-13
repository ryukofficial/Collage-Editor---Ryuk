import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/app.css'

ReactDOM.createRoot(document.getElementById('root')).render(<App />)

// Keeps the app, the text reader, the effect data and skins you've used on the
// phone, so the site opens fast and works on weak (or no) internet.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}

// a page that was open while the site was updated can't load new pieces: reload once
window.addEventListener('vite:preloadError', () => {
  try {
    if (sessionStorage.getItem('ryuk_reloaded')) return
    sessionStorage.setItem('ryuk_reloaded', '1')
  } catch { /* */ }
  location.reload()
})
