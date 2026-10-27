// Small helpers shared by the /api functions. Files starting with _ are not public URLs.

// Reads the raw request body (up to `limit` bytes). Works whether or not the
// platform already buffered it.
export async function readBody(req, limit) {
  if (Buffer.isBuffer(req.rawBody)) {
    if (req.rawBody.length > limit) throw httpError(413, 'too_large')
    return req.rawBody
  }
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw httpError(413, 'too_large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export async function readJson(req, limit = 16 * 1024) {
  const raw = await readBody(req, limit)
  if (!raw.length) return {}
  try { return JSON.parse(raw.toString('utf8')) } catch { throw httpError(400, 'bad_json') }
}

export function httpError(status, code) {
  const e = new Error(code)
  e.status = status
  e.code = code
  return e
}

export function send(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.end(JSON.stringify(body))
}

// Only same-site browser requests (or none, for server-to-server webhooks).
export function sameOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host
    return new URL(origin).host === host
  } catch { return false }
}

export function bearer(req) {
  const h = req.headers.authorization || ''
  const m = /^Bearer\s+([A-Za-z0-9._-]{20,4096})$/.exec(h)
  return m ? m[1] : null
}

// Error codes the website knows how to explain. Anything else becomes a
// generic message, so internal details never reach the browser.
const PUBLIC_CODES = new Set([
  'not_logged_in', 'insufficient_balance', 'too_many_orders', 'too_many_scans', 'invalid_request',
  'scan_closed', 'scan_used_up', 'unknown_scan', 'too_large', 'bad_image', 'bad_json',
  'not_admin', 'not_configured', 'method_not_allowed', 'forbidden', 'busy', 'scan_busy',
  'too_many_exports', 'unknown_export', 'export_closed', 'export_used_up',
])

// Wraps a handler: method check, same-origin check, error → JSON.
export function handler(methods, fn, { checkOrigin = true } = {}) {
  return async (req, res) => {
    try {
      if (!methods.includes(req.method)) throw httpError(405, 'method_not_allowed')
      if (checkOrigin && !sameOrigin(req)) throw httpError(403, 'forbidden')
      await fn(req, res)
    } catch (err) {
      const code = PUBLIC_CODES.has(err?.code) ? err.code : 'server_error'
      if (code === 'server_error') console.error('[api]', err?.message || err)
      if (code === 'too_large') res.setHeader('Connection', 'close')      // don't read the rest of an oversized upload
      if (!res.headersSent) send(res, err?.status || (code === 'server_error' ? 500 : 400), { error: code })
      if (code === 'too_large') res.on('finish', () => req.destroy())
    }
  }
}
