import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { T } from '../lib/i18n'
import { practiceCheck } from '../lib/api'
import { levelInfo } from '../lib/store'
import { Tex, Rich } from './Tex'

const BADGES_SPEC = [
  { id: 'first_step', icon: '🎯', title: 'Birinchi Qadam', desc: 'Kamida 1 ta masalani to‘liq yeching', check: (u) => (u?.problems || 0) >= 1, progress: (u) => `${Math.min(u?.problems || 0, 1)}/1` },
  { id: 'streak_3', icon: '🔥', title: '3 Kunlik Streak', desc: '3 kun ketma-ket matematik bilan shug‘ullaning', check: (u) => (u?.best_streak || u?.streak || 0) >= 3, progress: (u) => `${Math.min(u?.best_streak || u?.streak || 0, 3)}/3 kun` },
  { id: 'streak_7', icon: '⚡', title: '7 Kunlik Streak', desc: '7 kunlik o‘qish seriyasiga erishing', check: (u) => (u?.best_streak || u?.streak || 0) >= 7, progress: (u) => `${Math.min(u?.best_streak || u?.streak || 0, 7)}/7 kun` },
  { id: 'problem_10', icon: '🧠', title: '10 ta Misol Ustasi', desc: '10 ta turli masalani yeching', check: (u) => (u?.problems || 0) >= 10, progress: (u) => `${Math.min(u?.problems || 0, 10)}/10` },
  { id: 'xp_500', icon: '💎', title: '500 XP Klubi', desc: '500 dan ortiq tajriba balli to‘plang', check: (u) => (u?.xp || 0) >= 500, progress: (u) => `${Math.min(u?.xp || 0, 500)}/500 XP` },
  { id: 'accuracy_master', icon: '👑', title: 'Xatosiz Mergan', desc: 'Kamida 5 ta to‘g‘ri javob va 80%+ aniqlik', check: (u) => (u?.correct || 0) >= 5 && (u?.correct / Math.max(u?.correct + u?.wrong, 1)) >= 0.8, progress: (u) => `${u?.correct || 0} to‘g‘ri` },
]

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

export default function Progress({ lang, open, onClose, user, mistakes, onFixed, onDelete, onLogin, onTrainMistakes }) {
  const t = T[lang]
  const [tab, setTab] = useState('prog') // 'prog' | 'mist' | 'badges'
  const total = user ? user.correct + user.wrong : 0
  const acc = total ? Math.round((user.correct / total) * 100) : 0
  const L = levelInfo(user?.xp || 0)
  const weak = Object.entries(mistakes.reduce((a, m) => ({ ...a, [m.topic || '—']: (a[m.topic || '—'] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const card = 'rounded-xl border border-slate-200 dark:border-slate-800 p-3 text-center'

  const unlockedBadgesCount = BADGES_SPEC.filter((b) => b.check(user)).length

  const handleTrainMistakes = () => {
    if (!mistakes.length) return
    const topicsMap = {}
    mistakes.forEach((m) => {
      const topicName = (m.topic || '').trim() || 'Kvadrat tenglamalar'
      topicsMap[topicName] = (topicsMap[topicName] || 0) + 1
    })
    const sorted = Object.entries(topicsMap).sort((a, b) => b[1] - a[1])
    const chosenTopics = sorted.slice(0, 3).map(([name]) => name)
    onClose()
    onTrainMistakes?.(chosenTopics)
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside initial={{ x: 420 }} animate={{ x: 0 }} exit={{ x: 420 }} transition={{ type: 'tween', duration: 0.25 }}
            className="fixed z-50 right-0 top-0 h-full w-[28rem] max-w-[94vw] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
            <div className="flex items-center gap-2 p-3 border-b border-slate-200 dark:border-slate-800">
              <div role="tablist" className="flex gap-1 mr-auto overflow-x-auto no-scrollbar">
                {[
                  ['prog', '📊 ' + t.prog],
                  ['mist', `❌ ${t.mist} (${mistakes.length})`],
                  ['badges', `🏆 Yutuqlar (${unlockedBadgesCount}/${BADGES_SPEC.length})`],
                ].map(([k, l]) => (
                  <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition ${tab === k ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>{l}</button>
                ))}
              </div>
              <button className="btn-ghost" onClick={onClose} aria-label={t.close}>✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
              ) : tab === 'mist' ? (
                <div className="space-y-3">
                  {mistakes.length > 0 && (
                    <button type="button" onClick={handleTrainMistakes}
                      className="btn-gold w-full !py-2.5 text-sm font-bold flex items-center justify-center gap-2 shadow-md">
                      🔥 Xatolarim asosida mashq tuzish
                    </button>
                  )}
                  {mistakes.length === 0 ? <p className="text-sm text-slate-500 py-6 text-center">{t.noMist}</p> : (
                    <ul className="space-y-2">{mistakes.map((m) => <Mistake key={m.id} lang={lang} m={m} onFixed={onFixed} onDelete={onDelete} />)}</ul>
                  )}
                </div>
              ) : (
                /* Tab 3: Achievement Badges */
                <div className="space-y-3">
                  <div className="rounded-2xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-yellow-500/10 p-3.5 border border-amber-300/40 dark:border-amber-500/20 text-center">
                    <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-400">
                      🏆 {unlockedBadgesCount} / {BADGES_SPEC.length}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Faoliyatingiz orqali barcha nishonlarni oching</div>
                  </div>

                  <div className="grid gap-2.5">
                    {BADGES_SPEC.map((b) => {
                      const unlocked = b.check(user)
                      return (
                        <div key={b.id}
                          className={`flex items-start gap-3 rounded-2xl border p-3.5 transition ${unlocked ? 'border-amber-400 bg-amber-50/70 shadow-sm dark:bg-amber-950/30 dark:border-amber-500/40' : 'border-slate-200 bg-slate-50/50 opacity-60 dark:border-white/10 dark:bg-white/5'}`}>
                          <span className={`grid size-11 shrink-0 place-items-center rounded-2xl text-2xl shadow-sm ${unlocked ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-amber-500/30' : 'bg-slate-200 dark:bg-slate-800 grayscale'}`}>
                            {b.icon}
                          </span>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`font-bold text-sm ${unlocked ? 'text-amber-950 dark:text-amber-200' : 'text-slate-600 dark:text-slate-400'}`}>{b.title}</span>
                              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${unlocked ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                                {unlocked ? '✓ Ochildi' : b.progress(user)}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{b.desc}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
