import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { adminAdjustTokens, adminLogin, adminSetPlan, adminStats, adminUsers } from '../lib/api'
import { Avatar, PlanBadge } from './ui'

// Admin dashboard (Uzbek only, for the owner). The master password is checked by the SERVER (it lives only in the server's
// environment); the browser keeps just the short-lived admin token in memory, so closing the panel or reloading logs out.
export default function Admin({ open, onClose }) {
  const [pw, setPw] = useState('')
  const [token, setToken] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState(null)
  const [amounts, setAmounts] = useState({})
  const [plans, setPlans] = useState({})
  const [days, setDays] = useState({})
  const [note, setNote] = useState('')

  useEffect(() => { if (!open) { setToken(null); setPw(''); setRows([]); setErr(''); setQ(''); setNote(''); setStats(null) } }, [open])

  const fail = useCallback((e) => {
    if (e.status === 401) { setToken(null); setErr('Seans tugadi, qayta kiring') } else setErr(e.status === 0 ? 'Serverga ulanib bo‘lmadi' : e.message)
  }, [])
  const loadStats = useCallback(() => adminStats(token).then(setStats).catch(fail), [token, fail])
  const load = useCallback(async (query, offset = 0) => {
    try {
      const r = await adminUsers(token, query, offset)
      setTotal(r.total); setRows((old) => (offset ? [...old, ...r.users] : r.users)); setErr('')
    } catch (e) { fail(e) }
  }, [token, fail])

  useEffect(() => { if (token) loadStats() }, [token, loadStats])
  useEffect(() => {
    if (!token) return
    const id = setTimeout(() => load(q), 350)
    return () => clearTimeout(id)
  }, [token, q, load])

  const login = async (e) => {
    e.preventDefault()
    if (!/^\d{16}$/.test(pw)) { setErr('Parol aynan 16 ta raqamdan iborat bo‘lishi kerak'); return }
    setBusy(true); setErr('')
    try { setToken((await adminLogin(pw)).token); setPw('') } catch (x) {
      setErr(x.status === 429 ? 'Juda ko‘p urinish. 10 daqiqadan keyin qayta urinib ko‘ring' : x.status === 503 ? 'Admin panel serverda o‘chirilgan (ADMIN_PASSWORD yo‘q)' : x.status === 0 ? 'Serverga ulanib bo‘lmadi' : 'Noto‘g‘ri parol')
    }
    setBusy(false)
  }
  const patch = (id, user) => setRows((old) => old.map((x) => (x.id === id ? { ...x, ...user } : x)))

  const adjust = async (u, sign) => { // sign +1 adds tokens, -1 subtracts them
    const n = parseInt(amounts[u.id], 10)
    if (!(n >= 1)) { setNote('Token miqdorini kiriting (1 yoki undan katta)'); return }
    try {
      const r = await adminAdjustTokens(token, u.id, sign * n)
      patch(u.id, r.user); setAmounts((a) => ({ ...a, [u.id]: '' }))
      setNote(`✅ @${u.username}: ${sign > 0 ? '+' : '−'}${n} token → jami ${r.user.tokens_remaining}`)
    } catch (e) { fail(e) }
  }
  const activate = async (u) => {
    const plan = plans[u.id] || u.plan
    const d = parseInt(days[u.id] ?? '30', 10)
    try {
      const r = await adminSetPlan(token, u.id, plan, Number.isNaN(d) ? 30 : d)
      patch(u.id, r.user); loadStats()
      setNote(`✅ @${u.username}: ${plan.toUpperCase()} tarifi faollashtirildi${r.user.plan_expires_at ? ` (${new Date(r.user.plan_expires_at * 1000).toLocaleDateString()} gacha)` : ''}`)
    } catch (e) { fail(e) }
  }

  if (!open) return null
  const cell = 'px-3 py-3 align-middle'
  const mini = 'field !rounded-xl !px-2.5 !py-1.5 text-sm'
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/70 p-3 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} role="dialog" aria-modal="true" aria-label="Admin panel"
        className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-4 text-white">
          <span className="text-2xl" aria-hidden="true">🛡️</span>
          <div className="mr-auto"><h2 className="font-display text-xl font-bold leading-tight">Admin panel</h2><p className="text-xs text-white/70">Foydalanuvchilar, tokenlar va tariflar</p></div>
          <button className="rounded-xl p-2 hover:bg-white/15" onClick={onClose} aria-label="Yopish">✕</button>
        </div>

        {!token ? (
          <form onSubmit={login} className="mx-auto w-full max-w-sm space-y-4 p-8">
            <div className="text-center text-5xl" aria-hidden="true">🔐</div>
            <label className="block text-sm font-bold" htmlFor="admin-pw">Asosiy parol (16 raqam)</label>
            <input id="admin-pw" className="field text-center tracking-[0.35em]" type="password" inputMode="numeric" autoComplete="off" maxLength={16}
              value={pw} onChange={(e) => setPw(e.target.value.replace(/\D/g, ''))} autoFocus />
            {err && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{err}</p>}
            <button className="btn w-full" disabled={busy || pw.length !== 16}>{busy ? '…' : 'Kirish'}</button>
          </form>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[['👥', 'Foydalanuvchilar', stats?.users], ['⭐', 'Premium', stats?.premium], ['👑', 'VIP', stats?.vip], ['🔥', 'Bugun faol', stats?.active_today]].map(([ic, label, v]) => (
                <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                  <div className="text-xs font-semibold text-slate-500">{ic} {label}</div><div className="mt-1 font-display text-3xl font-extrabold">{v ?? '…'}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input className="field flex-1 min-w-56" type="search" placeholder="Username yoki email bo‘yicha qidirish…" aria-label="Username yoki email bo‘yicha qidirish" value={q} onChange={(e) => setQ(e.target.value)} />
              <span className="text-sm text-slate-500">Topildi: <b>{total}</b></span>
            </div>
            {err && <p role="alert" className="text-sm font-bold text-rose-600">{err}</p>}
            {note && <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">{note}</p>}
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-white/5">
                  <tr>{['Foydalanuvchi', 'Tarif', '⚡ Token', '⭐ XP · 🔥', 'Masala', 'Faollik', 'Tokenlarni boshqarish', 'Tarifni boshqarish'].map((h) => <th key={h} className="whitespace-nowrap px-3 py-3 font-bold">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <tr key={u.id} className="border-t border-slate-200 hover:bg-indigo-50/40 dark:border-white/10 dark:hover:bg-white/5">
                      <td className={cell}>
                        <div className="flex items-center gap-3"><Avatar name={u.name} size={36} />
                          <div className="min-w-0"><div className="truncate font-bold">{u.name} <span className="font-normal text-indigo-600 dark:text-indigo-300">@{u.username}</span></div><div className="truncate text-xs text-slate-500">{u.email}</div></div>
                        </div>
                      </td>
                      <td className={cell}>{u.plan === 'free' ? <span className="text-xs text-slate-500">Bepul</span> : <><PlanBadge plan={u.plan} />{u.plan_expires_at && <div className="mt-1 text-[11px] text-slate-500">{new Date(u.plan_expires_at * 1000).toLocaleDateString()} gacha</div>}</>}</td>
                      <td className={`${cell} font-display text-lg font-bold`}>{u.tokens_remaining}<span className="text-xs font-normal text-slate-400"> / {u.daily_tokens}</span></td>
                      <td className={cell}>{u.xp} · {u.streak}</td>
                      <td className={cell}>{u.problems} <span className="text-xs text-slate-500">({u.correct}/{u.wrong})</span></td>
                      <td className={`${cell} whitespace-nowrap text-xs text-slate-500`}>{u.last_active || '—'}</td>
                      <td className={cell}>
                        <div className="flex items-center gap-1.5">
                          <input className={`${mini} w-20`} type="number" min="1" max="100000" placeholder="50" aria-label={`${u.email}: token miqdori`} value={amounts[u.id] || ''} onChange={(e) => setAmounts((a) => ({ ...a, [u.id]: e.target.value }))} />
                          <button className="btn-ghost !px-3 !py-1.5 font-bold text-rose-600" onClick={() => adjust(u, -1)} aria-label={`${u.email}: tokenlarni ayirish`} title="Ayirish">−</button>
                          <button className="btn !px-3 !py-1.5" onClick={() => adjust(u, 1)} aria-label={`${u.email}: token qo‘shish`} title="Qo‘shish">＋</button>
                        </div>
                      </td>
                      <td className={cell}>
                        <div className="flex items-center gap-1.5">
                          <select className={`${mini} w-28`} aria-label={`${u.email}: tarif`} value={plans[u.id] || u.plan} onChange={(e) => setPlans((p) => ({ ...p, [u.id]: e.target.value }))}>
                            <option value="free">Bepul</option><option value="premium">Premium</option><option value="vip">VIP</option>
                          </select>
                          <input className={`${mini} w-16`} type="number" min="0" max="3650" aria-label={`${u.email}: kunlar`} title="Kunlar (0 = muddatsiz)" value={days[u.id] ?? '30'} onChange={(e) => setDays((d) => ({ ...d, [u.id]: e.target.value }))} />
                          <button className="btn-gold !px-3 !py-1.5 text-xs" onClick={() => activate(u)} aria-label={`${u.email}: tarifni faollashtirish`}>Faollashtirish</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-500">Foydalanuvchi topilmadi</td></tr>}
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
