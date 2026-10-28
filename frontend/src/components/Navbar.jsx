import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { T } from '../lib/i18n'
import { levelInfo } from '../lib/store'
import { stopSpeaking, unlockAudio } from '../lib/useVoice'
import { Avatar, Logo, PlanBadge } from './ui'

const TABS = [['solve', '🧮', 'navSolve'], ['topics', '📚', 'navTopics'], ['test', '📝', 'navTest'], ['friends', '👥', 'navFriends']]

/** Avatar button + dropdown: profile summary, shortcuts, Settings and Log out. */
function ProfileMenu({ lang, user, onProgress, onHistory, onChat, onUpgrade, onSettings, onLogout }) {
  const t = T[lang]
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const L = levelInfo(user.xp)

  useEffect(() => {
    if (!open) return
    const down = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const key = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open])

  const go = (fn) => () => { setOpen(false); fn?.() }
  const item = 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-indigo-50 dark:hover:bg-white/10'
  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`${t.account}: ${user.name}`} onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/60 py-1 pl-1 pr-2.5 transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10">
        <Avatar name={user.name} size={34} />
        <span className="hidden text-left leading-tight md:block">
          <span className="block max-w-28 truncate text-sm font-bold">{user.name}</span>
          <span className="block text-[11px] text-slate-500 dark:text-slate-400">Lv {L.level} · 🔥 {user.streak}</span>
        </span>
        <span aria-hidden="true" className="text-xs text-slate-400">▾</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div role="menu" initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
            className="absolute right-0 z-50 mt-2 w-72 rounded-3xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 p-3 dark:from-indigo-500/10 dark:to-violet-500/10">
              <Avatar name={user.name} size={44} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5"><span className="truncate font-bold">{user.name}</span><PlanBadge plan={user.plan} /></div>
                <div className="truncate text-xs text-slate-500">@{user.username}</div>
                <div className="truncate text-xs text-slate-400">{user.email}</div>
              </div>
            </div>
            <div className="px-3 py-2.5">
              <div className="mb-1 flex justify-between text-xs font-semibold"><span>Lv {L.level}</span><span>⭐ {user.xp} / {L.next}</span></div>
              <div className="h-1.5 overflow-hidden rounded bg-slate-200 dark:bg-slate-700"><div className="h-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${L.pct}%` }} /></div>
            </div>
            <button role="menuitem" className={item} onClick={go(onSettings)}>⚙️ {t.settings}</button>
            <button role="menuitem" className={item} onClick={go(onProgress)}>📊 {t.prog}</button>
            <button role="menuitem" className={item} onClick={go(onHistory)}>🕘 {t.hist}</button>
            <button role="menuitem" className={item} onClick={go(onChat)}>💬 {t.chatTitle}</button>
            <button role="menuitem" className={item} onClick={go(onUpgrade)}>⭐ {t.menuUpgrade}</button>
            <div className="my-1 border-t border-slate-200 dark:border-white/10" />
            <button role="menuitem" onClick={go(onLogout)} className={`${item} text-rose-600 hover:!bg-rose-50 dark:text-rose-400 dark:hover:!bg-rose-500/10`}>🚪 {t.signOut}</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function Navbar({ lang, setLang, dark, setDark, voiceOn, setVoiceOn, micActive, onMic, page, setPage, user, onLogin, onHistory, onProgress, onChat, onUpgrade, onSettings, onLogout }) {
  const t = T[lang]
  const tk = user ? user.tokens_remaining : 0
  const icon = 'btn-ghost !px-2.5 !py-2'
  return (
    <header className="sticky top-0 z-30 border-b border-white/60 bg-white/70 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/60">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <button type="button" className="flex items-center gap-2.5" onClick={() => setPage('solve')} aria-label={t.title}>
          <Logo />
          <span className="hidden font-display text-lg font-extrabold leading-none text-ink dark:text-white sm:block">AI Math <span className="gradient-text">Tutor</span></span>
        </button>

        <nav role="tablist" aria-label="Pages" className="order-last flex w-full gap-1 overflow-x-auto md:order-none md:ml-3 md:w-auto">
          {TABS.map(([id, ic, key]) => (
            <button key={id} role="tab" aria-selected={page === id} onClick={() => setPage(id)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-bold transition ${page === id ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'}`}>
              <span aria-hidden="true">{ic}</span>{t[key]}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Language" className="flex overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
            {['uz', 'ru', 'en'].map((l) => (
              <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l}
                className={`px-2.5 py-1.5 text-xs font-bold ${lang === l ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-white/10'}`}>{l.toUpperCase()}</button>
            ))}
          </div>
          <button className={`${icon} ${micActive ? '!bg-red-500 !text-white' : ''}`} onClick={onMic} aria-label={t.mic} title={t.mic}>🎤</button>
          <button className={`${icon} ${voiceOn ? '!bg-indigo-600 !text-white' : ''}`} onClick={() => { unlockAudio(); if (voiceOn) stopSpeaking(); setVoiceOn(!voiceOn) }}
            aria-pressed={voiceOn} aria-label={t.voice} title={t.voice}>🔊</button>
          <button className={icon} onClick={() => setDark(!dark)} aria-label="Theme">{dark ? '☀️' : '🌙'}</button>

          {user?.plan !== 'vip' && <button className="btn-gold text-sm" onClick={onUpgrade}>⭐ {t.upgrade}</button>}
          {user ? (
            <>
              <span className={`rounded-xl border px-3 py-2 text-sm font-bold ${tk <= 0 ? 'border-rose-400 text-rose-600' : 'border-amber-300 text-amber-700 dark:text-amber-300'}`}
                title={t.tokensLbl} aria-label={`${t.tokensLbl}: ${tk} / ${user.daily_tokens}`}>
                ⚡ {t.tokensLbl}: {tk > user.daily_tokens ? tk : `${tk}/${user.daily_tokens}`}
              </span>
              <ProfileMenu {...{ lang, user, onProgress, onHistory, onChat, onUpgrade, onSettings, onLogout }} />
            </>
          ) : (
            <>
              <button className="btn-ghost text-sm font-bold" onClick={() => onLogin('login')}>{t.login}</button>
              <button className="btn text-sm" onClick={() => onLogin('register')}>{t.reg}</button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
