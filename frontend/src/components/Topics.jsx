import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { T } from '../lib/i18n'
import { CURRICULUM, pick } from '../lib/curriculum'
import { Tex } from './Tex'

const LEVEL = {
  easy: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  hard: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
}

/** "Mavzular": the curriculum. A subtopic opens a full lesson (idea, steps, variations, practice) made by the AI. */
export default function Topics({ lang, onStart }) {
  const t = T[lang]
  const [openId, setOpenId] = useState(null)
  const cat = CURRICULUM.find((c) => c.id === openId)
  return (
    <section className="space-y-6 pb-4" aria-label={t.topicsTitle}>
      <header>
        <h2 className="font-display text-3xl font-extrabold sm:text-4xl"><span className="gradient-text">{t.topicsTitle}</span></h2>
        <p className="mt-1 max-w-2xl text-slate-600 dark:text-slate-300">{t.topicsSub}</p>
        <p className="mt-1 text-xs text-slate-500">ℹ️ {t.topicsNote}</p>
      </header>

      <AnimatePresence mode="wait">
        {!cat ? (
          <motion.div key="grid" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CURRICULUM.map((c, i) => (
              <motion.button key={c.id} type="button" onClick={() => setOpenId(c.id)} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                className="glass lift group flex items-center gap-4 p-5 text-left" aria-label={`${c.name[lang]} (${t.topicsCount.replace('{n}', c.subs.length)})`}>
                <span className={`grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-3xl shadow-lg ${c.color}`} aria-hidden="true">{c.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-lg font-bold leading-tight">{c.name[lang]}</span>
                  <span className="text-sm text-slate-500">{t.topicsCount.replace('{n}', c.subs.length)}</span>
                </span>
                <span className="text-xl text-slate-300 transition group-hover:translate-x-1 group-hover:text-indigo-500" aria-hidden="true">→</span>
              </motion.button>
            ))}
          </motion.div>
        ) : (
          <motion.div key={cat.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <button className="btn-ghost text-sm font-bold" onClick={() => setOpenId(null)}>{t.topicsBack}</button>
            <div className="flex items-center gap-4">
              <span className={`grid size-16 place-items-center rounded-2xl bg-gradient-to-br text-4xl shadow-lg ${cat.color}`} aria-hidden="true">{cat.icon}</span>
              <h3 className="font-display text-2xl font-extrabold">{cat.name[lang]}</h3>
            </div>
            <ul className="grid gap-4 md:grid-cols-2">
              {cat.subs.map((s) => {
                const q = pick(s.q, lang)
                return (
                  <li key={s.name.en} className="glass flex flex-col gap-3 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="font-display text-lg font-bold leading-snug">{s.name[lang]}</h4>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${LEVEL[s.lv]}`}>{t[s.lv]}</span>
                    </div>
                    <div className="flex-1 overflow-x-auto rounded-xl bg-slate-50 px-3 py-2 text-lg dark:bg-white/5"><Tex tex={q} /></div>
                    <button className="btn w-full" onClick={() => onStart(q)}>▶ {t.startLesson}</button>
                  </li>
                )
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
