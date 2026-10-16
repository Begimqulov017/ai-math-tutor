import { loadAuth } from './store'

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')

async function call(method, path, body) {
  const a = loadAuth()
  let r
  try {
    r = await fetch(API_URL + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(a?.token ? { Authorization: 'Bearer ' + a.token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    const e = new Error('Network error')
    e.status = 0
    throw e
  }
  const txt = await r.text()
  let json = null
  try { json = JSON.parse(txt) } catch { /* not json */ }
  if (!r.ok) {
    const d = json?.detail
    const e = new Error(typeof d === 'string' ? d : Array.isArray(d) ? d.map((x) => x.msg).join('; ') : txt || r.statusText)
    e.status = r.status
    throw e
  }
  return json
}

export const analyzeProblem = (p) => call('POST', '/api/analyze-problem', p)
export const practiceCheck = (p) => call('POST', '/api/practice/check', p)
export const chatApi = (p) => call('POST', '/api/chat', p)
export const checkSolution = (p) => call('POST', '/api/check-solution', p)
export const login = (p) => call('POST', '/api/auth/login', p)
export const register = (p) => call('POST', '/api/auth/register', p)
export const getMe = () => call('GET', '/api/me')
export const getSync = () => call('GET', '/api/sync')
export const putSync = (d) => call('PUT', '/api/sync', d)
export const fileToBase64 = (file) =>
  new Promise((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(String(fr.result).split(',')[1])
    fr.onerror = rej
    fr.readAsDataURL(file)
  })
