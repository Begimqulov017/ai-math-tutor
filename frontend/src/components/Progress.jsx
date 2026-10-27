import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { T } from '../lib/i18n'
import { practiceCheck } from '../lib/api'
import { levelInfo } from '../lib/store'
import { Tex, Rich } from './Tex'

function Mistake({ lang, m, onFixed, onDelete }) {
  const t = T[lang]
  const [open, setOpen] = useState(false)
  const [val, setVal] = useState('')
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const run = async () => {
    if (!val.trim() || !m.key) return
    setBusy(true); setMsg('')
    try {
      const r = await practiceCheck({ key: m.key, level: m.level, index: m.index, answer: val, lang })
      setRes(r)
      if (r.correct) setTimeout(() => onFixed(m.id, r.user, r.xp_gained), 900)
    } catch (e) { setMsg(e.status === 410 ? t.expired : t.err) }
    setBusy(false)
  }
  return (
    <li className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-1">
      <div className="overflow-x-auto no-scrollbar"><Tex tex={m.q} /></div>
      <div className="text-xs text-slate-500">{[m.topic, t[m.level]].filter(Boolean).join(' • ')} • {t.yourAns}: <b><Tex tex={m.userAnswer} /></b></div>
      {open ? (
        <div className="flex gap-2">
          <input value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} aria-label={t.answer} placeholder={t.answer}
            className="flex-1 min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2" />
          <button className="btn !py-1" onClick={run} disabled={busy}>{t.check}</button>
        </div>
      ) : (
        <button className="text-sm font-bold text-indigo-600 dark:text-indigo-300 underline" onClick={() => setOpen(true)}>{t.retry}</button>
      )}
      {msg && <p className="text-sm text-rose-600">{msg}</p>}
      {res && <p className={`text-sm font-bold ${res.correct ? 'text-emerald-600' : 'text-rose-600'}`}>{res.correct ? t.ok : t.no} {res.feedback && <span className="font-normal"><Rich text={res.feedback} /></span>}</p>}
      <div><button className="text-xs text-rose-600 underline" onClick={() => onDelete(m.id)}>{t.del}</button></div>
    </li>
  )
}

export default function Progress({ lang, open, onClose, user, mistakes, onFixed, onDelete, onLogin }) {
  const t = T[lang]
  const [tab, setTab] = useState('prog')
  const total = user ? user.correct + user.wrong : 0
  const acc = total ? Math.round((user.correct / total) * 100) : 0
  const L = levelInfo(user?.xp || 0)
  const weak = Object.entries(mistakes.reduce((a, m) => ({ ...a, [m.topic || '—']: (a[m.topic || '—'] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const card = 'rounded-xl border border-slate-200 dark:border-slate-800 p-3 text-center'
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside initial={{ x: 380 }} animate={{ x: 0 }} exit={{ x: 380 }} transition={{ type: 'tween', duration: 0.25 }}
            className="fixed z-50 right-0 top-0 h-full w-96 max-w-[92vw] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
            <div className="flex items-center gap-2 p-3 border-b border-slate-200 dark:border-slate-800">
              <div role="tablist" className="flex gap-1 mr-auto">
                {[['prog', '📊 ' + t.prog], ['mist', `❌ ${t.mist} (${mistakes.length})`]].map(([k, l]) => (
                  <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                    className={`px-3 py-1.5 rounded-xl text-sm font-bold ${tab === k ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{l}</button>
                ))}
              </div>
              <button className="btn-ghost" onClick={onClose} aria-label={t.close}>✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {tab === 'prog' ? (
                !user ? (
                  <div className="space-y-3 text-center py-8">
                    <p className="text-3xl">🔒</p>
                    <p className="text-sm">{t.guestNote}</p>
                    <button className="btn" onClick={() => onLogin('register')}>{t.reg}</button>
                  </div>
                ) : (
                  <>
                    <div className={card}>
                      <div className="font-bold">{t.lvl} {L.level}</div>
                      <div className="h-2 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden my-1"><div className="h-full bg-amber-500" style={{ width: `${L.pct}%` }} /></div>
                      <div className="text-xs text-slate-500">{user.xp} / {L.next} XP</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className={card}><div className="text-2xl font-bold">🔥 {user.streak}</div><div className="text-xs text-slate-500">{t.days} (max {user.best_streak})</div></div>
                      <div className={card}><div className="text-2xl font-bold">⭐ {user.xp}</div><div className="text-xs text-slate-500">XP</div></div>
                      <div className={card}><div className="text-2xl font-bold">{acc}%</div><div className="text-xs text-slate-500">{t.acc} ({user.correct}/{total})</div></div>
                      <div className={card}><div className="text-2xl font-bold">{user.problems}</div><div className="text-xs text-slate-500">{t.problems}</div></div>
                    </div>
                    <h3 className="font-bold">{t.weak}</h3>
                    {weak.length === 0 ? <p className="text-sm text-slate-500">{t.noMist}</p> : (
                      <ul className="space-y-1">{weak.map(([topic, n]) => (
                        <li key={topic} className="flex justify-between rounded-lg bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm"><span>{topic}</span><b>{n}</b></li>
                      ))}</ul>
                    )}
                  </>
                )
              ) : mistakes.length === 0 ? <p className="text-sm text-slate-500">{t.noMist}</p> : (
                <ul className="space-y-2">{mistakes.map((m) => <Mistake key={m.id} lang={lang} m={m} onFixed={onFixed} onDelete={onDelete} />)}</ul>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
