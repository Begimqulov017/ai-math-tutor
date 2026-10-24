import { motion } from 'framer-motion'
import { T } from '../lib/i18n'
import { levelInfo } from '../lib/store'
import { stopSpeaking, unlockAudio } from '../lib/useVoice'

export default function Navbar({ lang, setLang, dark, setDark, voiceOn, setVoiceOn, micActive, onMic, onHistory, onProgress, onChat, onLogin, user }) {
  const t = T[lang]
  const L = user ? levelInfo(user.xp) : null
  const tk = user ? user.tokens_remaining : 0
  return (
    <header className="sticky top-0 z-30 glass !rounded-none border-x-0 border-t-0">
      <div className="mx-auto max-w-6xl flex flex-wrap items-center gap-2 px-4 py-3">
        <h1 className="font-display text-xl text-ink dark:text-indigo-200 mr-auto">∑ {t.title}</h1>
        <div role="group" aria-label="Language" className="flex rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700">
          {['uz', 'ru', 'en'].map((l) => (
            <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l}
              className={`px-3 py-1.5 text-sm font-bold ${lang === l ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <button className="btn-ghost" onClick={onHistory} aria-label={t.hist} title={t.hist}>🕘</button>
        <button className="btn-ghost" onClick={onChat} aria-label={t.chatTitle} title={t.chatTitle}>💬</button>
        <button className={`btn-ghost ${micActive ? '!bg-red-500 text-white' : ''}`} onClick={onMic} aria-label={t.mic} title={t.mic}>🎤</button>
        <button className={`btn-ghost ${voiceOn ? '!bg-indigo-600 text-white' : ''}`} onClick={() => { unlockAudio(); if (voiceOn) stopSpeaking(); setVoiceOn(!voiceOn) }} aria-pressed={voiceOn} aria-label={t.voice} title={t.voice}>🔊</button>
        <button className="btn-ghost" onClick={() => setDark(!dark)} aria-label="Theme">{dark ? '☀️' : '🌙'}</button>
        {user ? (
          <>
            <span className={`rounded-xl border px-3 py-2 text-sm font-bold ${tk <= 0 ? 'border-rose-400 text-rose-600' : 'border-amber-400 text-amber-700 dark:text-amber-300'}`}
              title={t.tokensLbl} aria-label={`${t.tokensLbl}: ${tk} / ${user.daily_tokens}`}>
              ⚡ {t.tokensLbl}: {tk > user.daily_tokens ? tk : `${tk}/${user.daily_tokens}`}
            </span>
            <button className="btn-ghost flex items-center gap-3 text-sm" onClick={onProgress} title={t.prog} aria-label={`${t.prog}: ${user.name}, ${t.lvl} ${L.level}, ${user.xp} XP, ${user.streak} ${t.days}`}>
              <span className="font-bold max-w-24 truncate">{user.name}</span>
              <span className="rounded-lg bg-indigo-600 text-white px-2 py-0.5 font-bold">Lv {L.level}</span>
              <span className="flex flex-col w-24 text-left">
                <span className="text-xs leading-none mb-1">⭐ {user.xp} / {L.next}</span>
                <span className="block h-1.5 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <motion.span className="block h-full bg-amber-500" initial={false} animate={{ width: `${L.pct}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
                </span>
              </span>
              <motion.span key={user.streak} initial={{ scale: 1.7, rotate: -14 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 12 }} className="font-bold">
                🔥 {user.streak}
              </motion.span>
            </button>
          </>
        ) : (
          <>
            <button className="btn-ghost text-sm font-bold" onClick={() => onLogin('login')}>{t.login}</button>
            <button className="btn text-sm" onClick={() => onLogin('register')}>{t.reg}</button>
          </>
        )}
      </div>
    </header>
  )
}
