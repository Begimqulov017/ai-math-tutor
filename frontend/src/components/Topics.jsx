import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { T } from '../lib/i18n'
import { CURRICULUM, pick } from '../lib/curriculum'
import { Tex, Rich } from './Tex'

const LEVEL = {
  easy: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  hard: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
}

/** "Mavzular": rich mini-lesson (explanation + Key Formulas Cheat-Sheet + Worked Example) + subtopic problems + 1-click Test Generator. */
export default function Topics({ lang, onStart, onGenerateTest }) {
  const t = T[lang]
  const [openId, setOpenId] = useState(null)
  const cat = CURRICULUM.find((c) => c.id === openId)

  const lblFormulas = lang === 'ru' ? 'Основные формулы (Шпаргалка)' : lang === 'en' ? 'Key Formulas Cheat-Sheet' : 'Asosiy formulalar (Shpargalka)'
  const lblExample = lang === 'ru' ? 'Разобранный пример' : lang === 'en' ? 'Worked Example' : 'Namuna misol (Yechimi bilan)'
  const lblPracticeSolve = lang === 'ru' ? 'Тренировать решение' : lang === 'en' ? 'Practice solving' : 'Yechishni mashq qilish'
  const lblBuildTest = lang === 'ru' ? 'Составить тест по этой теме' : lang === 'en' ? 'Generate a test on this topic' : 'Shu mavzudan test tuzish'

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
          <motion.div key={cat.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button className="btn-ghost text-sm font-bold" onClick={() => setOpenId(null)}>{t.topicsBack}</button>
              <div className="flex flex-wrap gap-2">
                <button className="btn text-sm" onClick={() => onStart(pick(cat.subs[0].q, lang))}>🎯 {lblPracticeSolve}</button>
                {onGenerateTest && (
                  <button className="btn-gold text-sm" onClick={() => onGenerateTest(cat)}>📝 {lblBuildTest}</button>
                )}
              </div>
            </div>

            {/* Topic Mini-Lesson Overview Card */}
            <div className="glass space-y-5 p-6">
              <div className="flex flex-wrap items-center gap-4">
                <span className={`grid size-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-4xl shadow-lg ${cat.color}`} aria-hidden="true">{cat.icon}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-2xl font-extrabold">{cat.name[lang]}</h3>
                  {cat.desc && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300"><Rich text={cat.desc[lang] || cat.desc.en} /></p>}
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                {/* 1. Key Formulas Cheat-Sheet */}
                {cat.formulas?.length > 0 && (
                  <div className="rounded-2xl border border-indigo-200/70 bg-indigo-50/40 p-4 dark:border-indigo-500/20 dark:bg-indigo-950/25 space-y-3">
                    <h4 className="font-display text-base font-bold text-indigo-900 dark:text-indigo-200">📌 {lblFormulas}</h4>
                    <ul className="space-y-2.5">
                      {cat.formulas.map((f, idx) => (
                        <li key={idx} className="rounded-xl bg-white/85 px-3.5 py-2.5 shadow-sm dark:bg-slate-900/80">
                          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">{f.label[lang] || f.label.en}</div>
                          <div className="mt-1 overflow-x-auto no-scrollbar text-base"><Tex tex={f.tex} /></div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 2. Worked Example */}
                {cat.example && (
                  <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/40 p-4 dark:border-emerald-500/20 dark:bg-emerald-950/20 space-y-3">
                    <h4 className="font-display text-base font-bold text-emerald-900 dark:text-emerald-200">💡 {lblExample}</h4>
                    <div className="rounded-xl bg-white/90 px-3.5 py-2.5 font-bold shadow-sm dark:bg-slate-900/80 overflow-x-auto no-scrollbar text-lg">
                      <Tex tex={cat.example.problem} />
                    </div>
                    <ol className="space-y-2">
                      {cat.example.steps.map((st, idx) => (
                        <li key={idx} className="flex items-start gap-2.5 rounded-xl bg-white/75 px-3 py-2 text-sm dark:bg-slate-900/60">
                          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-emerald-600 text-xs font-bold text-white">{idx + 1}</span>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="overflow-x-auto no-scrollbar font-medium"><Tex tex={st.tex} /></div>
                            <div className="text-xs text-slate-500 dark:text-slate-400"><Rich text={st.note[lang] || st.note.en} /></div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            </div>

            {/* Subtopic cards */}
            <ul className="grid gap-4 md:grid-cols-2">
              {cat.subs.map((s) => {
                const q = pick(s.q, lang)
                return (
                  <li key={s.name.en} className="glass flex flex-col gap-3 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="font-display text-lg font-bold leading-snug">{s.name[lang]}</h4>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${LEVEL[s.lv]}`}>{t[s.lv]}</span>
                    </div>
                    <div className="flex-1 overflow-x-auto no-scrollbar rounded-xl bg-slate-50 px-3.5 py-2.5 text-lg dark:bg-white/5 flex items-center"><Tex tex={q} /></div>
                    <div className="flex flex-wrap gap-2">
                      <button className="btn flex-1" onClick={() => onStart(q)}>▶ {t.startLesson}</button>
                      {onGenerateTest && (
                        <button className="btn-ghost text-sm font-semibold" onClick={() => onGenerateTest(cat, s.name[lang])}>📝 Test</button>
                      )}
                    </div>
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
