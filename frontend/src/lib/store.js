const K = { history: 'mathtutor.history.v1', mistakes: 'mathtutor.mistakes.v2', auth: 'mathtutor.auth.v2' }
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage full/blocked */ } }

export const loadHistory = () => read(K.history, [])
export const saveHistory = (v) => write(K.history, v.slice(0, 50))
export const loadMistakes = () => read(K.mistakes, [])
export const saveMistakes = (v) => write(K.mistakes, v.slice(0, 200))
export const loadAuth = () => read(K.auth, null) // { token, user }
export const saveAuth = (v) => write(K.auth, v)
export const clearAuth = () => { try { localStorage.removeItem(K.auth) } catch { /* ignore */ } }
export const clearData = () => { saveHistory([]); saveMistakes([]) }

// level n starts at 100*(n-1)^2 XP
export function levelInfo(xp = 0) {
  const level = Math.floor(Math.sqrt(xp / 100)) + 1
  const start = 100 * (level - 1) ** 2
  const next = 100 * level ** 2
  return { level, start, next, pct: Math.min(100, Math.round(((xp - start) / (next - start)) * 100)) }
}

export function mergeData(local, cloud = {}) {
  const byId = (a, b) => {
    const m = new Map()
    ;[...(b || []), ...(a || [])].forEach((i) => m.set(i.id, i))
    return [...m.values()].sort((x, y) => y.ts - x.ts)
  }
  return {
    history: byId(local.history, cloud.history).slice(0, 50),
    mistakes: byId(local.mistakes, cloud.mistakes).slice(0, 200),
  }
}
