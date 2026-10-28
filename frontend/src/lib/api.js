import { loadAuth } from './store'

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const REQUEST_TIMEOUT_MS = 15000

// retries: only for requests that are safe to repeat. A sleeping free server (Render) answers its first
// requests without CORS headers, which the browser reports as "Network error" - waiting a bit fixes it.
// tokenOverride: the admin panel uses its own short-lived token instead of the user's.
async function call(method, path, body, retries = 0, tokenOverride = null, timeoutMs = REQUEST_TIMEOUT_MS) {
  for (let attempt = 0; ; attempt++) {
    const bearer = tokenOverride || loadAuth()?.token
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let r
    try {
      r = await fetch(API_URL + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
    } catch {
      clearTimeout(timer)
      if (attempt < retries) { await sleep(2000 * (attempt + 1)); continue }
      const e = new Error('Network error')
      e.status = 0
      throw e
    }
    let txt = ''
    try {
      txt = await r.text()
    } finally {
      clearTimeout(timer)
    }
    let json = null
    try { json = JSON.parse(txt) } catch { /* not json */ }
    if (!r.ok) {
      if ((r.status === 502 || r.status === 503 || r.status === 504) && !json && attempt < retries) { await sleep(2000 * (attempt + 1)); continue }
      const d = json?.detail
      const obj = d && typeof d === 'object' && !Array.isArray(d)
      const e = new Error(typeof d === 'string' ? d : obj ? d.message || d.code : Array.isArray(d) ? d.map((x) => x.msg).join('; ') : txt.slice(0, 200) || r.statusText)
      if (obj) { e.code = d.code; e.data = d }
      e.status = r.status
      throw e
    }
    return json
  }
}

/** Wakes a sleeping free server while the user is still reading the page. */
export const warmUp = () => fetch(API_URL + '/api/health').catch(() => {})

export const analyzeProblem = (p) => call('POST', '/api/analyze-problem', p, 2, null, 25000)
export const practiceCheck = (p) => call('POST', '/api/practice/check', p, 2)
export const generateProblems = (p) => call('POST', '/api/generate-problems', p, 1, null, 35000)
export const chatApi = (p) => call('POST', '/api/chat', p, 1) // guests: stateless chat
export const checkSolution = (p) => call('POST', '/api/check-solution', p, 1, null, 25000)
export const getGuestStatus = () => call('GET', '/api/guest-status', null, 2)
export const login = (p) => call('POST', '/api/auth/login', p)
export const register = (p) => call('POST', '/api/auth/register', p)
export const verifyEmail = (p) => call('POST', '/api/auth/verify', p)
export const resendCode = (p) => call('POST', '/api/auth/resend', p)
export const getMe = () => call('GET', '/api/me', null, 1)
export const getSync = () => call('GET', '/api/sync', null, 1)
export const putSync = (d) => call('PUT', '/api/sync', d, 1)

// user profile & settings
export const updateProfile = (p) => call('PUT', '/api/me/profile', p)
export const updateEmail = (p) => call('PUT', '/api/me/email', p)
export const updatePassword = (p) => call('PUT', '/api/me/password', p)
export const clearMyThreads = () => call('DELETE', '/api/me/threads')
export const deleteMyAccount = (password) => call('DELETE', '/api/me', { password })

// persistent chat threads (logged-in users)
export const listThreads = () => call('GET', '/api/chat/threads', null, 1)
export const createThread = (p) => call('POST', '/api/chat/threads', p, 1)
export const getThread = (id) => call('GET', `/api/chat/threads/${id}/messages`, null, 1)
export const sendThreadMessage = (id, p) => call('POST', `/api/chat/threads/${id}/messages`, p, 1)
export const deleteThread = (id) => call('DELETE', `/api/chat/threads/${id}`)

// admin panel
export const adminLogin = (password) => call('POST', '/api/admin/login', { password })
export const adminUsers = (token, q = '', offset = 0) =>
  call('GET', `/api/admin/users?q=${encodeURIComponent(q)}&limit=50&offset=${offset}`, null, 0, token)
export const adminAdjustTokens = (token, id, amount) => call('POST', `/api/admin/users/${id}/tokens`, { amount }, 0, token) // amount < 0 subtracts
export const adminSetPlan = (token, id, plan, days) => call('POST', `/api/admin/users/${id}/plan`, { plan, days }, 0, token)
export const adminStats = (token) => call('GET', '/api/admin/stats', null, 0, token)

// accounts: username check + forgot password
export const checkUsername = (u) => call('GET', `/api/auth/username-available?u=${encodeURIComponent(u)}`)
export const forgotPassword = (p) => call('POST', '/api/auth/forgot', p)
export const resetPassword = (p) => call('POST', '/api/auth/reset', p)

// friends
export const getFriends = () => call('GET', '/api/friends', null, 1)
export const friendRequest = (username) => call('POST', '/api/friends/request', { username })
export const friendAccept = (id) => call('POST', `/api/friends/${id}/accept`)
export const friendRemove = (id) => call('DELETE', `/api/friends/${id}`)
export const getLeaderboard = (by) => call('GET', `/api/leaderboard?by=${by}`, null, 1)
export const getFeed = () => call('GET', '/api/feed', null, 1)

export const fileToBase64 = (file) =>
  new Promise((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(String(fr.result).split(',')[1])
    fr.onerror = rej
    fr.readAsDataURL(file)
  })

/** Neural voice (OpenAI TTS / edge-tts on the server): text with LaTeX in, an MP3 Blob out. */
export async function ttsBlob(text, lang, signal) {
  const r = await fetch(API_URL + '/api/tts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang }), signal,
  })
  if (!r.ok) { const e = new Error('tts ' + r.status); e.status = r.status; throw e }
  return r.blob()
}
