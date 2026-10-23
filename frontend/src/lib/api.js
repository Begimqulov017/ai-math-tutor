import { loadAuth } from './store'

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// retries: only for requests that are safe to repeat. A sleeping free server (Render) answers its first
// requests without CORS headers, which the browser reports as "Network error" - waiting a bit fixes it.
async function call(method, path, body, retries = 0) {
  for (let attempt = 0; ; attempt++) {
    const a = loadAuth()
    let r
    try {
      r = await fetch(API_URL + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(a?.token ? { Authorization: 'Bearer ' + a.token } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      })
    } catch {
      if (attempt < retries) { await sleep(3000 * (attempt + 1)); continue }
      const e = new Error('Network error')
      e.status = 0
      throw e
    }
    const txt = await r.text()
    let json = null
    try { json = JSON.parse(txt) } catch { /* not json */ }
    if (!r.ok) {
      if ((r.status === 502 || r.status === 503 || r.status === 504) && !json && attempt < retries) { await sleep(3000 * (attempt + 1)); continue }
      const d = json?.detail
      const e = new Error(typeof d === 'string' ? d : Array.isArray(d) ? d.map((x) => x.msg).join('; ') : txt.slice(0, 200) || r.statusText)
      e.status = r.status
      throw e
    }
    return json
  }
}

/** Wakes a sleeping free server while the user is still reading the page. */
export const warmUp = () => fetch(API_URL + '/api/health').catch(() => {})

export const analyzeProblem = (p) => call('POST', '/api/analyze-problem', p, 3)
export const practiceCheck = (p) => call('POST', '/api/practice/check', p, 3)
export const chatApi = (p) => call('POST', '/api/chat', p, 2)
export const checkSolution = (p) => call('POST', '/api/check-solution', p, 2)
export const getGuestStatus = () => call('GET', '/api/guest-status', null, 3)
export const login = (p) => call('POST', '/api/auth/login', p)
export const register = (p) => call('POST', '/api/auth/register', p)
export const getMe = () => call('GET', '/api/me', null, 3)
export const getSync = () => call('GET', '/api/sync', null, 3)
export const putSync = (d) => call('PUT', '/api/sync', d, 2)
export const fileToBase64 = (file) =>
  new Promise((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(String(fr.result).split(',')[1])
    fr.onerror = rej
    fr.readAsDataURL(file)
  })
