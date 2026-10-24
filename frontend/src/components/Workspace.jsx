import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { T } from '../lib/i18n'
import { Tex } from './Tex'

/** Immersive, nearly full-screen study view: its own header + one scrolling area, nothing else on screen. */
export default function Workspace({ lang, user, title, onBack, onHistory, onProgress, onJumpChat, showJump, children }) {
  const t = T[lang]
  const [fs, setFs] = useState(false)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden' // only the workspace scrolls
    const sync = () => setFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', sync)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('fullscreenchange', sync)
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    }
  }, [])

  const toggleFs = () => {
    try {
      if (document.fullscreenElement) document.exitFullscreen()
      else document.documentElement.requestFullscreen()
    } catch { /* not supported (e.g. iPhone Safari): the layout is already full screen */ }
  }
  const tk = user ? user.tokens_remaining : null

  return (
    <motion.div className="workspace fixed inset-0 z-40 flex flex-col bg-slate-50 dark:bg-slate-950"
      initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 28 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
      <div className="print:hidden flex items-center gap-2 px-3 md:px-6 py-2 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur">
        <button className="btn-ghost text-sm font-bold" onClick={onBack}>← {t.back}</button>
        <div className="flex-1 min-w-0 overflow-hidden whitespace-nowrap text-ellipsis text-base md:text-lg px-2"><Tex tex={title} /></div>
        {user && (
          <span className={`hidden sm:inline-block rounded-xl border px-3 py-1.5 text-sm font-bold ${tk <= 0 ? 'border-rose-400 text-rose-600' : 'border-amber-400 text-amber-700 dark:text-amber-300'}`}>
            ⚡ {tk > user.daily_tokens ? tk : `${tk}/${user.daily_tokens}`}
          </span>
        )}
        <button className="btn-ghost" onClick={onHistory} aria-label={t.hist} title={t.hist}>🕘</button>
        {user && <button className="btn-ghost" onClick={onProgress} aria-label={t.prog} title={t.prog}>📊</button>}
        <button className="btn-ghost" onClick={toggleFs} aria-pressed={fs} aria-label={fs ? t.fsExit : t.fs} title={fs ? t.fsExit : t.fs}>{fs ? '🗗' : '⛶'}</button>
      </div>
      <div className="ws-scroll flex-1 overflow-y-auto scroll-smooth">
        <div className="mx-auto w-full max-w-[1800px] px-3 md:px-8 py-5 space-y-6 pb-24">{children}</div>
      </div>
      {showJump && (
        <button className="print:hidden btn fixed bottom-5 right-5 !rounded-full !px-5 !py-3 shadow-lg z-[45]" onClick={onJumpChat}>💬 {t.toChat} ↓</button>
      )}
    </motion.div>
  )
}

export function WorkspaceSkeleton({ lang }) {
  const t = T[lang]
  const bar = 'rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse'
  return (
    <div role="status" aria-live="polite" className="space-y-5">
      <div><p className="font-display text-2xl text-ink dark:text-indigo-100">{t.analyzingBig}</p><p className="text-sm text-slate-500">{t.analyzingSub}</p></div>
      <div className={`${bar} h-28`} />
      <div className="grid lg:grid-cols-2 gap-6"><div className={`${bar} h-80`} /><div className={`${bar} h-80`} /></div>
      <div className={`${bar} h-40`} />
    </div>
  )
}
