const KEY = 'mathtutor.history.v1'
export const loadHistory = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch { return [] }
}
export const saveHistory = (list) => {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50))) } catch { /* storage full/blocked */ }
}
