import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { adminAddTokens, adminLogin, adminUsers } from '../lib/api'

// Admin panel (Uzbek only, for the owner). The master password is checked by the SERVER; the browser only keeps the
// short-lived admin token in memory, so closing the panel or reloading the page logs the admin out.
export default function Admin({ open, onClose }) {
  const [pw, setPw] = useState('')
  const [token, setToken] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [amounts, setAmounts] = useState({})
  const [note, setNote] = useState('')

  useEffect(() => { if (!open) { setToken(null); setPw(''); setRows([]); setErr(''); setQ(''); setNote('') } }, [open])

  const fail = useCallback((e) => {
    if (e.status === 401) { setToken(null); setErr('Seans tugadi, qayta kiring') } else setErr(e.status === 0 ? 'Serverga ulanib bo‘lmadi' : e.message)
  }, [])

  const load = useCallback(async (query, offset = 0) => {
    try {
      const r = await adminUsers(token, query, offset)
      setTotal(r.total)
      setRows((old) => (offset ? [...old, ...r.users] : r.users))
      setErr('')
    } catch (e) { fail(e) }
  }, [token, fail])

  useEffect(() => {
    if (!token) return
    const id = setTimeout(() => load(q), 350)
    return () => clearTimeout(id)
  }, [token, q, load])

  const login = async (e) => {
    e.preventDefault()
    if (!/^\d{16}$/.test(pw)) { setErr('Parol aynan 16 ta raqamdan iborat bo‘lishi kerak'); return }
    setBusy(true); setErr('')
    try { setToken((await adminLogin(pw)).token); setPw('') } catch (x) { setErr(x.status === 429 ? 'Juda ko‘p urinish. 10 daqiqadan keyin qayta urinib ko‘ring' : x.status === 503 ? 'Admin panel serverda o‘chirilgan (ADMIN_PASSWORD yo‘q)' : x.status === 0 ? 'Serverga ulanib bo‘lmadi' : 'Noto‘g‘ri parol') }
    setBusy(false)
  }

  const grant = async (u) => {
    const amount = parseInt(amounts[u.id], 10)
    if (!(amount >= 1)) { setNote('Token miqdorini kiriting (1 dan katta)'); return }
    try {
      const r = await adminAddTokens(token, u.id, amount)
      setRows((old) => old.map((x) => (x.id === u.id ? { ...x, tokens_remaining: r.user.tokens_remaining } : x)))
      setAmounts((a) => ({ ...a, [u.id]: '' }))
      setNote(`✅ ${u.email}: +${amount} token (jami ${r.user.tokens_remaining})`)
    } catch (e) { fail(e) }
  }

  if (!open) return null
  const input = 'rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2'
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-3" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} role="dialog" aria-modal="true" aria-label="Admin panel"
        className="glass !bg-white dark:!bg-slate-900 w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 p-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-display text-xl mr-auto">🛡️ Admin panel</h2>
          <button className="btn-ghost" onClick={onClose} aria-label="Yopish">✕</button>
        </div>

        {!token ? (
          <form onSubmit={login} className="p-6 space-y-3 max-w-sm mx-auto w-full">
            <label className="block text-sm font-bold" htmlFor="admin-pw">Asosiy parol (16 raqam)</label>
            <input id="admin-pw" className={`${input} w-full tracking-widest`} type="password" inputMode="numeric" autoComplete="off" maxLength={16}
              value={pw} onChange={(e) => setPw(e.target.value.replace(/\D/g, ''))} autoFocus />
            {err && <p role="alert" className="text-rose-600 text-sm font-bold">{err}</p>}
            <button className="btn w-full" disabled={busy || pw.length !== 16}>{busy ? '…' : 'Kirish'}</button>
          </form>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col p-4 gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input className={`${input} flex-1 min-w-56`} type="search" placeholder="Email bo‘yicha qidirish…" aria-label="Email bo‘yicha qidirish" value={q} onChange={(e) => setQ(e.target.value)} />
              <span className="text-sm text-slate-500">Jami: <b>{total}</b></span>
            </div>
            {err && <p role="alert" className="text-rose-600 text-sm font-bold">{err}</p>}
            {note && <p role="status" className="text-sm">{note}</p>}
            <div className="overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-left">
                  <tr>{['Email', 'Ism', '⚡ Token', '⭐ XP', '🔥', 'Masala', 'To‘g‘ri/Xato', 'Oxirgi faollik', 'Token qo‘shish'].map((h) => <th key={h} className="px-3 py-2 whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <tr key={u.id} className="border-t border-slate-200 dark:border-slate-800">
                      <td className="px-3 py-2">{u.email}</td>
                      <td className="px-3 py-2">{u.name}</td>
                      <td className="px-3 py-2 font-bold">{u.tokens_remaining}</td>
                      <td className="px-3 py-2">{u.xp}</td>
                      <td className="px-3 py-2">{u.streak}</td>
                      <td className="px-3 py-2">{u.problems}</td>
                      <td className="px-3 py-2">{u.correct}/{u.wrong}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{u.last_active || '—'}</td>
                      <td className="px-3 py-2">
                        <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); grant(u) }}>
                          <input className={`${input} !py-1 w-20`} type="number" min="1" max="100000" placeholder="50" aria-label={`${u.email}: token miqdori`} value={amounts[u.id] || ''} onChange={(e) => setAmounts((a) => ({ ...a, [u.id]: e.target.value }))} />
                          <button className="btn !py-1 text-sm">＋</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-500">Foydalanuvchi topilmadi</td></tr>}
                </tbody>
              </table>
            </div>
            {rows.length < total && <button className="btn-ghost self-center" onClick={() => load(q, rows.length)}>Yana yuklash</button>}
          </div>
        )}
      </motion.div>
    </div>
  )
}
