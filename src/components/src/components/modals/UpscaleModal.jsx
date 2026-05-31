import { useState, useRef } from 'react';
import { X, Wand2, Download, AlertCircle, CheckCircle, Loader2, Key, Eye, EyeOff } from 'lucide-react';

/**
 * UpscaleModal
 *
 * Props:
 *   isOpen       {boolean}  – controls visibility
 *   onClose      {function} – called when modal is dismissed
 *   imageBlob    {Blob}     – the exported collage as a Blob (PNG or JPEG)
 *   imageName    {string}   – suggested filename, e.g. "my-collage"
 *
 * Usage (in your export / finish flow):
 *   <UpscaleModal
 *     isOpen={showUpscale}
 *     onClose={() => setShowUpscale(false)}
 *     imageBlob={exportedBlob}
 *     imageName="collage"
 *   />
 */

const MAX_SIZE_BYTES = 1.2 * 1024 * 1024; // 1.2 MB limit from imageupscaler API

export default function UpscaleModal({ isOpen, onClose, imageBlob, imageName = 'collage' }) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('upscaler_api_key') || '');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [errorMsg, setErrorMsg] = useState('');
  const [resultUrl, setResultUrl] = useState('');
  const [originalPreview, setOriginalPreview] = useState('');
  const abortRef = useRef(null);

  // Generate a preview URL from the blob when it's available
  const previewUrl = imageBlob ? URL.createObjectURL(imageBlob) : '';

  if (!isOpen) return null;

  const saveKey = (val) => {
    setApiKey(val);
    if (val) localStorage.setItem('upscaler_api_key', val);
    else localStorage.removeItem('upscaler_api_key');
  };

  const handleUpscale = async () => {
    if (!apiKey.trim()) {
      setErrorMsg('Please enter your imageupscaler.com API key.');
      setStatus('error');
      return;
    }
    if (!imageBlob) {
      setErrorMsg('No collage image found. Please export your collage first.');
      setStatus('error');
      return;
    }
    if (imageBlob.size > MAX_SIZE_BYTES) {
      setErrorMsg(
        `Image is ${(imageBlob.size / 1024).toFixed(0)} KB — the API limit is 1.2 MB. ` +
        `Try reducing the canvas size before exporting.`
      );
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMsg('');
    setResultUrl('');

    const formData = new FormData();
    // Convert blob to a File so the API gets a proper filename + type
    const file = new File([imageBlob], `${imageName}.jpg`, { type: 'image/jpeg' });
    formData.append('file_image', file);

    try {
      const response = await fetch(
        'https://imageupscaler.com/api/update_image.php?method=upscale-image-4x&outscale=4&saveFormat=jpeg',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey.trim()}`,
            'User-Agent': 'Mozilla/5.0',
          },
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error || data.error_code) {
        const code = data.error_code || '';
        const msgs = {
          101: 'Invalid API key. Check your key at imageupscaler.com/dashboard.',
          102: 'Monthly credit limit reached. Upgrade your plan.',
          103: 'Subscription expired.',
          107: 'File too large (max 1.2 MB).',
          111: 'This method is temporarily unavailable. Try again later.',
          112: 'This feature requires a business subscription.',
        };
        throw new Error(msgs[code] || data.error_message || `API error ${code}`);
      }

      if (!data.processes_image) {
        throw new Error('No result returned from API. Please try again.');
      }

      setResultUrl(data.processes_image);
      setStatus('done');
    } catch (err) {
      setErrorMsg(err.message);
      setStatus('error');
    }
  };

  const handleDownload = () => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = `${imageName}_4x_upscaled.jpg`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleClose = () => {
    setStatus('idle');
    setErrorMsg('');
    setResultUrl('');
    onClose();
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      {/* Modal panel */}
      <div className="relative w-full max-w-lg mx-4 bg-[#0d0d14] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Wand2 size={18} className="text-violet-400" />
            <h2 className="text-sm font-semibold text-white">Upscale Collage 4×</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-medium">JPEG</span>
          </div>
          <button
            onClick={handleClose}
            className="text-white/40 hover:text-white/80 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Preview row */}
          {(previewUrl || resultUrl) && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-xs text-white/40 font-medium uppercase tracking-wider">Original</p>
                <div className="rounded-xl overflow-hidden bg-white/5 border border-white/10 aspect-video flex items-center justify-center">
                  {previewUrl
                    ? <img src={previewUrl} alt="Original collage" className="w-full h-full object-contain" />
                    : <span className="text-white/20 text-xs">No preview</span>
                  }
                </div>
                {imageBlob && (
                  <p className="text-xs text-white/30">{(imageBlob.size / 1024).toFixed(0)} KB</p>
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-white/40 font-medium uppercase tracking-wider">4× upscaled</p>
                <div className="rounded-xl overflow-hidden bg-white/5 border border-white/10 aspect-video flex items-center justify-center">
                  {resultUrl
                    ? <img src={resultUrl} alt="Upscaled result" className="w-full h-full object-contain" />
                    : status === 'loading'
                      ? <Loader2 size={24} className="text-violet-400 animate-spin" />
                      : <span className="text-white/20 text-xs">Result here</span>
                  }
                </div>
                {status === 'done' && (
                  <p className="text-xs text-emerald-400 flex items-center gap-1">
                    <CheckCircle size={12} /> Ready to download
                  </p>
                )}
              </div>
            </div>
          )}

          {/* API key input */}
          <div className="space-y-1.5">
            <label className="text-xs text-white/50 font-medium flex items-center gap-1.5">
              <Key size={12} />
              imageupscaler.com API key
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => saveKey(e.target.value)}
                  placeholder="Bearer token from imageupscaler.com/dashboard"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500/60 transition-colors pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <p className="text-xs text-white/30">
              Get your free key at{' '}
              <a
                href="https://imageupscaler.com/dashboard#api-key"
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-400 hover:text-violet-300 underline underline-offset-2"
              >
                imageupscaler.com/dashboard
              </a>
              {' '}· First 100 calls/month are free
            </p>
          </div>

          {/* Error message */}
          {status === 'error' && errorMsg && (
            <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <AlertCircle size={15} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-300">{errorMsg}</p>
            </div>
          )}

          {/* Loading status */}
          {status === 'loading' && (
            <div className="flex items-center gap-2.5 bg-violet-500/10 border border-violet-500/20 rounded-xl px-4 py-3">
              <Loader2 size={15} className="text-violet-400 animate-spin shrink-0" />
              <p className="text-sm text-violet-300">Upscaling… this takes 10–40 seconds</p>
            </div>
          )}

          {/* Success banner */}
          {status === 'done' && (
            <div className="flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
              <CheckCircle size={15} className="text-emerald-400 shrink-0" />
              <p className="text-sm text-emerald-300">Done! Your collage has been upscaled 4× as JPEG.</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            {status !== 'done' ? (
              <>
                <button
                  onClick={handleClose}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm text-white/60 hover:text-white hover:border-white/20 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpscale}
                  disabled={status === 'loading' || !apiKey.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {status === 'loading' ? (
                    <><Loader2 size={15} className="animate-spin" /> Upscaling…</>
                  ) : (
                    <><Wand2 size={15} /> Upscale 4× JPEG</>
                  )}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => { setStatus('idle'); setResultUrl(''); }}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm text-white/60 hover:text-white hover:border-white/20 transition-colors"
                >
                  Upscale again
                </button>
                <button
                  onClick={handleDownload}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Download size={15} /> Download
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
