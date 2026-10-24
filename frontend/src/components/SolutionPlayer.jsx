import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { T } from '../lib/i18n'
import { Tex, Rich } from './Tex'
import { unlockAudio } from '../lib/useVoice'

// what is read aloud for one step: the formula, then the explanation (the server turns LaTeX into words)
const stepSpeech = (s) => (s ? `$${s.latex}$. ${s.comment || ''}` : '')

export default function SolutionPlayer({ lang, steps = [], voiceOn, speak, onStep }) {
  const t = T[lang]
  const [i, setI] = useState(0)
  const [auto, setAuto] = useState(false)
  const [open, setOpen] = useState(false)
  const [loadingK, setLoadingK] = useState(null)
  const last = steps.length - 1
  const listenStep = async (s, k) => { // manual "read this step aloud"
    unlockAudio()
    setLoadingK(k)
    try { await speak(stepSpeech(s)) } finally { setLoadingK(null) }
  }

  useEffect(() => { setI(0); setAuto(false) }, [steps])
  useEffect(() => { setOpen(false); onStep?.(i); if (voiceOn) speak(stepSpeech(steps[i])) }, [i]) // eslint-disable-line
  useEffect(() => {
    if (!auto) return
    if (i >= last) { setAuto(false); return }
    const id = setTimeout(() => setI((n) => n + 1), 4000)
    return () => clearTimeout(id)
  }, [auto, i, last])

  return (
    <section className="glass p-5 md:p-6">
      <h3 className="font-bold mb-3">{t.solution}</h3>
      <ol className="space-y-3" aria-live="polite">
        <AnimatePresence initial={false}>
          {steps.slice(0, i + 1).map((s, k) => {
            const cur = k === i
            return (
              <motion.li key={k} layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: cur ? 1 : 0.55, y: 0 }}
                transition={{ duration: 0.35 }}
                className={`rounded-xl p-4 border ${cur ? 'border-indigo-400 bg-indigo-50/70 dark:bg-indigo-950/40' : 'border-slate-200 dark:border-slate-800'}`}>
                <div className="flex items-center gap-3">
                  <span className="grid place-items-center size-7 rounded-full bg-indigo-600 text-white text-sm font-bold shrink-0">{k + 1}</span>
                  <div className="flex-1 min-w-0 text-xl overflow-x-auto"><Tex tex={s.latex} block /></div>
                  <button className="ml-auto shrink-0 btn-ghost !px-2 !py-1 text-sm print:hidden" onClick={() => listenStep(s, k)}
                    title={t.listenTitle} aria-label={`${t.listenTitle} (${k + 1})`}>
                    {loadingK === k ? '…' : `🔊 ${t.listenBtn}`}
                  </button>
                </div>
                {cur && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 pl-10 space-y-2">
                    <p className="max-w-prose"><Rich text={s.comment} /></p>
                    <button className="text-sm font-bold text-indigo-600 dark:text-indigo-300 underline" onClick={() => setOpen(!open)} aria-expanded={open}>
                      {t.why}
                    </button>
                    <AnimatePresence>
                      {open && (
                        <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden rounded-lg bg-amber-50 dark:bg-amber-950/40 p-3 text-sm">
                          <Rich text={s.why} />
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ol>
      <div className="mt-4 flex gap-2">
        <button className="btn-ghost" disabled={i === 0} onClick={() => { unlockAudio(); setI(i - 1) }}>← {t.prev}</button>
        <button className="btn" disabled={i === last} onClick={() => { unlockAudio(); setI(i + 1) }}>{t.next} →</button>
        <button className="btn-ghost ml-auto" onClick={() => { unlockAudio(); if (i === last) setI(0); setAuto(!auto) }}>{auto ? `⏸ ${t.pause}` : `▶ ${t.play}`}</button>
      </div>
    </section>
  )
}
