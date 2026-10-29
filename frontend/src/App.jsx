import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { T } from './lib/i18n'
import {
  analyzeProblem, checkUsername, clearMyThreads, deleteMyAccount, forgotPassword, getGuestStatus, getMe, getSync, login, putSync, register, resendCode, resetPassword, updateEmail, updatePassword, updateProfile, verifyEmail, warmUp,
} from './lib/api'
import { useVoice } from './lib/useVoice'
import {
  clearAuth, clearData, levelInfo, loadAuth, loadHistory, loadMistakes, mergeData,
  saveAuth, saveHistory, saveMistakes,
} from './lib/store'
import Navbar from './components/Navbar'
import ProblemInput from './components/ProblemInput'
import { AnalysisCard, ConceptCard, Variations } from './components/Analysis'
import SolutionPlayer from './components/SolutionPlayer'
import Board from './components/Board'
import History from './components/History'
import Progress from './components/Progress'
import Auth from './components/Auth'
import Admin from './components/Admin'
import Pricing from './components/Pricing'
import Topics from './components/Topics'
import TestGenerator from './components/TestGenerator'
import Friends from './components/Friends'
import Practice from './components/Practice'
import Handwritten from './components/Handwritten'
import ChatSection from './components/ChatSection'
import Workspace, { WorkspaceSkeleton } from './components/Workspace'
import { Tex, Rich } from './components/Tex'
import { Avatar, PlanBadge } from './components/ui'

const USERNAME_RE = /^[a-z0-9_]{3,20}$/
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const scrollToChat = () => document.getElementById('chat-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

/** Comprehensive Settings Modal: Profile (Name, Username), Security (Email, Password), App Preferences, and Data/Account management. */
function SettingsModal({
  lang, setLang, dark, setDark, voiceOn, setVoiceOn, open, onClose, user,
  onUserUpdate, onAuthTokenUpdate, onClearHistory, onClearMistakes, onAccountDeleted, onUpgrade,
}) {
  const t = T[lang]
  const [tab, setTab] = useState('profile') // 'profile' | 'security' | 'prefs' | 'data'
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [unameStatus, setUnameStatus] = useState('idle') // idle | checking | ok | taken | bad
  const [newEmail, setNewEmail] = useState('')
  const [emailPw, setEmailPw] = useState('')
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confPw, setConfPw] = useState('')
  const [delPw, setDelPw] = useState('')
  const [showDel, setShowDel] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null) // { ok, text }

  useEffect(() => {
    if (open && user) {
      setName(user.name || '')
      setUsername(user.username || '')
      setNewEmail(user.email || '')
      setEmailPw('')
      setCurPw('')
      setNewPw('')
      setConfPw('')
      setDelPw('')
      setShowDel(false)
      setMsg(null)
      setUnameStatus('idle')
    }
  }, [open, user?.id]) // eslint-disable-line

  useEffect(() => {
    if (!open || !user) return
    const u = username.trim().toLowerCase()
    if (!u || u === user.username) { setUnameStatus('idle'); return }
    if (!USERNAME_RE.test(u)) { setUnameStatus('bad'); return }
    setUnameStatus('checking')
    let live = true
    const id = setTimeout(() => {
      checkUsername(u)
        .then((r) => live && setUnameStatus(r.available ? 'ok' : r.valid ? 'taken' : 'bad'))
        .catch(() => live && setUnameStatus('idle'))
    }, 400)
    return () => { live = false; clearTimeout(id) }
  }, [username, open, user?.username])

  if (!open || !user) return null
  const L = levelInfo(user.xp || 0)

  const errMsg = (e) => {
    if (e?.status === 0) return t.net
    if (e?.code === 'wrong_password' || e?.status === 401) return t.wrongPassErr
    if (e?.code === 'username_taken') return t.userTakenErr
    if (e?.code === 'bad_username') return t.userBadErr
    if (e?.code === 'email_taken' || e?.status === 409) return t.emailTaken
    if (e?.code === 'password_mismatch') return t.pwMismatchErr
    return e?.message || t.err
  }

  const saveProfile = async (e) => {
    e.preventDefault()
    if (busy) return
    const cleanName = name.trim()
    const cleanUser = username.trim().toLowerCase()
    if (!cleanName || !USERNAME_RE.test(cleanUser) || ['bad', 'taken'].includes(unameStatus)) return
    setBusy(true); setMsg(null)
    try {
      const r = await updateProfile({ name: cleanName, username: cleanUser })
      onUserUpdate(r.user)
      setUnameStatus('idle')
      setMsg({ ok: true, text: t.savedOk })
    } catch (err) {
      setMsg({ ok: false, text: errMsg(err) })
    } finally {
      setBusy(false)
    }
  }

  const saveEmail = async (e) => {
    e.preventDefault()
    if (busy) return
    const cleanEmail = newEmail.trim().toLowerCase()
    if (!EMAIL_RE.test(cleanEmail) || !emailPw) return
    setBusy(true); setMsg(null)
    try {
      const r = await updateEmail({ email: cleanEmail, password: emailPw })
      onUserUpdate(r.user)
      setEmailPw('')
      setMsg({ ok: true, text: t.emailChangedOk })
    } catch (err) {
      setMsg({ ok: false, text: errMsg(err) })
    } finally {
      setBusy(false)
    }
  }

  const savePassword = async (e) => {
    e.preventDefault()
    if (busy) return
    if (!curPw || newPw.length < 8 || newPw !== confPw) return
    setBusy(true); setMsg(null)
    try {
      const r = await updatePassword({ current_password: curPw, new_password: newPw, password_confirm: confPw })
      onAuthTokenUpdate(r)
      setCurPw(''); setNewPw(''); setConfPw('')
      setMsg({ ok: true, text: t.passChangedOk })
    } catch (err) {
      setMsg({ ok: false, text: errMsg(err) })
    } finally {
      setBusy(false)
    }
  }

  const handleClearChats = async () => {
    if (busy) return
    setBusy(true); setMsg(null)
    try {
      await clearMyThreads()
      setMsg({ ok: true, text: t.dataClearedOk })
    } catch (err) {
      setMsg({ ok: false, text: errMsg(err) })
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteAccount = async (e) => {
    e.preventDefault()
    if (busy || !delPw) return
    if (!window.confirm(t.deleteAccConfirm)) return
    setBusy(true); setMsg(null)
    try {
      await deleteMyAccount(delPw)
      onAccountDeleted()
    } catch (err) {
      setMsg({ ok: false, text: errMsg(err) })
      setBusy(false)
    }
  }

  const unameHint = { idle: t.usernameHint, bad: t.userBad, checking: t.userChecking, ok: t.userOk, taken: t.userTaken }[unameStatus]
  const unameTone = unameStatus === 'ok' ? 'text-emerald-600' : unameStatus === 'bad' || unameStatus === 'taken' ? 'text-rose-600' : 'text-slate-500'

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} role="dialog" aria-modal="true" aria-label={t.settings}
        className="relative w-full max-w-3xl overflow-hidden rounded-[2rem] bg-white shadow-2xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-slate-200 bg-gradient-to-r from-indigo-600/10 via-violet-600/10 to-fuchsia-600/10 px-6 py-5 dark:border-white/10">
          <Avatar name={user.name} size={52} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl font-extrabold truncate">⚙️ {t.settings}</h2>
              <PlanBadge plan={user.plan} />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">@{user.username} · {user.email} · Lv {L.level} ({user.xp} XP)</p>
          </div>
          <button className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10" onClick={onClose} aria-label={t.close}>✕</button>
        </div>

        {/* Navigation Tabs */}
        <div role="tablist" className="flex gap-1.5 overflow-x-auto border-b border-slate-200 bg-slate-50/70 px-6 py-2.5 dark:border-white/10 dark:bg-white/5 no-scrollbar">
          {[
            ['profile', '👤 ' + t.setTabProfile],
            ['security', '🔐 ' + t.setTabSecurity],
            ['prefs', '🎨 ' + t.setTabPrefs],
            ['data', '🗂️ ' + t.setTabData],
          ].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id}
              onClick={() => { setTab(id); setMsg(null) }}
              className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition ${tab === id ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-white/10'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="max-h-[72vh] overflow-y-auto p-6 space-y-5">
          {msg && (
            <p role={msg.ok ? 'status' : 'alert'} className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${msg.ok ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'}`}>
              {msg.text}
            </p>
          )}

          {/* TAB 1: PROFILE (Name, Username, Plan summary) */}
          {tab === 'profile' && (
            <form onSubmit={saveProfile} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="set-name" className="text-sm font-semibold">{t.nameLbl}</label>
                  <div className="relative flex items-center">
                    <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-slate-400">🙂</span>
                    <input id="set-name" className="field !pl-11" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="set-uname" className="text-sm font-semibold">{t.usernameLbl}</label>
                  <div className="relative flex items-center">
                    <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-slate-400">@</span>
                    <input id="set-uname" className="field !pl-11" required maxLength={20} value={username}
                      onChange={(e) => setUsername(e.target.value.replace(/[^A-Za-z0-9_]/g, ''))} autoCapitalize="none" spellCheck="false" />
                  </div>
                  <p className={`text-xs ${unameTone}`}>{unameHint}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-500">{t.planCurrent}</div>
                  <div className="mt-0.5 flex items-center gap-2 font-display text-lg font-bold">
                    <span className="capitalize">{user.plan}</span>
                    <PlanBadge plan={user.plan} />
                    <span className="text-sm font-normal text-indigo-600 dark:text-indigo-300">· ⚡ {user.tokens_remaining} / {user.daily_tokens}</span>
                  </div>
                </div>
                {user.plan !== 'vip' && (
                  <button type="button" className="btn-gold text-sm" onClick={onUpgrade}>⭐ {t.menuUpgrade}</button>
                )}
              </div>

              <div className="flex justify-end">
                <button className="btn" disabled={busy || !name.trim() || !USERNAME_RE.test(username.trim().toLowerCase()) || ['bad', 'taken'].includes(unameStatus)}>
                  {busy ? '…' : '💾 ' + t.saveBtn}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: SECURITY (Change Email & Change Password) */}
          {tab === 'security' && (
            <div className="space-y-6">
              {/* Change Email */}
              <form onSubmit={saveEmail} className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                <h3 className="font-display text-lg font-bold">✉️ {t.changeEmailTitle}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="set-email" className="text-xs font-semibold text-slate-500">{t.newEmailLbl}</label>
                    <div className="relative flex items-center">
                      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-slate-400">✉️</span>
                      <input id="set-email" type="email" required className="field !pl-11" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="set-email-pw" className="text-xs font-semibold text-slate-500">{t.curPass}</label>
                    <div className="relative flex items-center">
                      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-slate-400">🔒</span>
                      <input id="set-email-pw" type={showPw ? 'text' : 'password'} required className="field !pl-11" value={emailPw} onChange={(e) => setEmailPw(e.target.value)} />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button className="btn text-sm" disabled={busy || !EMAIL_RE.test(newEmail.trim()) || !emailPw}>
                    {busy ? '…' : t.changeEmailBtn}
                  </button>
                </div>
              </form>

              {/* Change Password */}
              <form onSubmit={savePassword} className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-bold">🔑 {t.changePassTitle}</h3>
                  <button type="button" className="text-xs font-semibold text-indigo-600 dark:text-indigo-300" onClick={() => setShowPw(!showPw)}>
                    {showPw ? '🙈 ' + t.hidePw : '👁️ ' + t.showPw}
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <label htmlFor="set-cur-pw" className="text-xs font-semibold text-slate-500">{t.curPass}</label>
                    <input id="set-cur-pw" type={showPw ? 'text' : 'password'} required className="field" value={curPw} onChange={(e) => setCurPw(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="set-new-pw" className="text-xs font-semibold text-slate-500">{t.newPass}</label>
                    <input id="set-new-pw" type={showPw ? 'text' : 'password'} required minLength={8} placeholder={t.pwMin} className="field" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="set-conf-pw" className="text-xs font-semibold text-slate-500">{t.confirmLbl}</label>
                    <input id="set-conf-pw" type={showPw ? 'text' : 'password'} required minLength={8} className="field" value={confPw} onChange={(e) => setConfPw(e.target.value)} />
                  </div>
                </div>
                {confPw && newPw !== confPw && <p className="text-xs text-rose-600">{t.pwMismatch}</p>}
                <div className="flex justify-end">
                  <button className="btn text-sm" disabled={busy || !curPw || newPw.length < 8 || newPw !== confPw}>
                    {busy ? '…' : t.changePassBtn}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: APP PREFERENCES (Language, Theme, Voice TTS) */}
          {tab === 'prefs' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                <div>
                  <div className="font-bold">🌐 {t.prefLang}</div>
                  <div className="text-xs text-slate-500">O‘zbekcha · Русский · English</div>
                </div>
                <div className="flex rounded-xl border border-slate-200 p-1 dark:border-white/10">
                  {[['uz', 'O‘zbek'], ['ru', 'Русский'], ['en', 'English']].map(([code, label]) => (
                    <button key={code} type="button" onClick={() => setLang(code)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${lang === code ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-white/10'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                <div>
                  <div className="font-bold">{dark ? '🌙' : '☀️'} {t.prefTheme}</div>
                  <div className="text-xs text-slate-500">{dark ? t.themeDark : t.themeLight}</div>
                </div>
                <div className="flex rounded-xl border border-slate-200 p-1 dark:border-white/10">
                  <button type="button" onClick={() => setDark(false)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${!dark ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-white/10'}`}>
                    ☀️ {t.themeLight}
                  </button>
                  <button type="button" onClick={() => setDark(true)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${dark ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-white/10'}`}>
                    🌙 {t.themeDark}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                <div>
                  <div className="font-bold">🔊 {t.prefVoice}</div>
                  <div className="text-xs text-slate-500">{voiceOn ? t.voiceEnabled : t.voiceDisabled}</div>
                </div>
                <button type="button" onClick={() => setVoiceOn(!voiceOn)}
                  className={`rounded-xl px-4 py-2 text-sm font-bold transition ${voiceOn ? 'bg-indigo-600 text-white' : 'border border-slate-200 dark:border-white/10'}`}>
                  {voiceOn ? '🔊 ' + t.voiceEnabled : '🔇 ' + t.voiceDisabled}
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: DATA & ACCOUNT MANAGEMENT */}
          {tab === 'data' && (
            <div className="space-y-5">
              <div className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                <h3 className="font-display text-lg font-bold">🗂️ {t.dataTitle}</h3>
                <div className="flex flex-wrap gap-2.5">
                  <button type="button" className="btn-ghost text-sm" onClick={() => { onClearHistory(); setMsg({ ok: true, text: t.dataClearedOk }) }}>
                    🗑️ {t.clearHistBtn}
                  </button>
                  <button type="button" className="btn-ghost text-sm" onClick={() => { onClearMistakes(); setMsg({ ok: true, text: t.dataClearedOk }) }}>
                    📓 {t.clearMistBtn}
                  </button>
                  <button type="button" className="btn-ghost text-sm" disabled={busy} onClick={handleClearChats}>
                    💬 {t.clearChatsBtn}
                  </button>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-rose-300 bg-rose-50/50 p-4 dark:border-rose-500/30 dark:bg-rose-950/20">
                <h3 className="font-display text-lg font-bold text-rose-700 dark:text-rose-300">⚠️ {t.deleteAccTitle}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300">{t.deleteAccDesc}</p>
                {!showDel ? (
                  <button type="button" className="rounded-xl border border-rose-400 bg-white px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50 dark:bg-slate-900 dark:text-rose-400"
                    onClick={() => setShowDel(true)}>
                    🗑️ {t.deleteAccBtn}
                  </button>
                ) : (
                  <form onSubmit={handleDeleteAccount} className="flex flex-wrap items-center gap-2 pt-1">
                    <input type="password" required placeholder={t.curPass} className="field flex-1 min-w-48 !py-2 text-sm" value={delPw} onChange={(e) => setDelPw(e.target.value)} />
                    <button type="submit" disabled={busy || !delPw} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-40">
                      {busy ? '…' : t.deleteAccBtn}
                    </button>
                    <button type="button" className="btn-ghost !py-2 text-sm" onClick={() => { setShowDel(false); setDelPw('') }}>
                      {t.frCancel}
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

export default function App() {
  const [lang, setLang] = useState('uz')
  const [dark, setDark] = useState(window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  const [voiceOn, setVoiceOn] = useState(false)
  const [micActive, setMicActive] = useState(false)
  const [text, setText] = useState('')
  const [data, setData] = useState(null)
  const [screen, setScreen] = useState('home') // 'home' (pages) | 'work' (immersive workspace)
  const [page, setPage] = useState('solve') // 'solve' | 'topics' | 'test' | 'friends'
  const [presetTopic, setPresetTopic] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState(0)
  const [history, setHistory] = useState(loadHistory)
  const [mistakes, setMistakes] = useState(loadMistakes)
  const [auth, setAuth] = useState(loadAuth) // { token, user } | null  (null = guest mode)
  const [synced, setSynced] = useState(false)
  const [activeId, setActiveId] = useState(null)
  const [panel, setPanel] = useState(null) // 'history' | 'progress' | 'auth' | 'admin' | 'pricing' | 'settings'
  const [authMode, setAuthMode] = useState('login')
  const [gain, setGain] = useState(null)
  const [guest, setGuest] = useState(null) // { used, limit } for guests
  const user = auth?.user || null
  const t = T[lang]
  const { speak, listen, stop } = useVoice(lang)
  const errText = (e) => (e.status === 0 ? t.net : e.message === 'guest_limit' ? t.guestLimit : e.code === 'tokens_exhausted' ? t.tokensOut
    : e.code === 'password_mismatch' ? t.pwMismatchErr : e.code === 'username_taken' ? t.userTakenErr : e.code === 'bad_username' ? t.userBadErr
    : e.code === 'email_taken' ? t.emailTaken : e.code === 'wrong_code' ? t.otpWrong.replace('{n}', e.data?.attempts_left ?? '') : e.code === 'code_expired' ? t.otpExpired
    : e.code === 'too_many_attempts' ? t.otpTooMany : e.code === 'resend_wait' ? t.otpWait.replace('{s}', e.data?.retry_after ?? 60)
    : e.code === 'mail_failed' ? t.mailFail : e.code === 'mail_not_configured' ? t.mailOff : e.status === 409 ? t.emailTaken
    : e.status === 401 ? t.badLogin
    : e.status === 429 || e.status === 503 ? t.busy : t.err + ': ' + String(e.message).slice(0, 200))

  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])
  useEffect(() => { document.documentElement.lang = lang }, [lang])
  useEffect(() => { warmUp() }, []) // wake a sleeping free server while the user is still reading the page
  useEffect(() => {
    if (user) setGuest(null)
    else getGuestStatus().then(setGuest).catch(() => {})
  }, [user?.id]) // eslint-disable-line
  useEffect(() => { // secure-ish entry point: /#admin (the real protection is the server-side password)
    const check = () => { if (window.location.hash === '#admin') setPanel('admin') }
    check()
    window.addEventListener('hashchange', check)
    return () => window.removeEventListener('hashchange', check)
  }, [])

  const updHistory = (fn) => setHistory((h) => { const n = fn(h); saveHistory(n); return n })
  const updMistakes = (fn) => setMistakes((m) => { const n = fn(m); saveMistakes(n); return n })
  const applyUser = (u) => { if (u) setAuth((a) => { if (!a) return a; const n = { ...a, user: u }; saveAuth(n); return n }) }
  const applyAuthToken = (r) => { if (r?.token && r?.user) { const n = { token: r.token, user: r.user }; saveAuth(n); setAuth(n) } }
  const showGain = (n) => {
    if (!(n > 0)) return
    const id = Date.now()
    setGain({ n, id })
    setTimeout(() => setGain((g) => (g?.id === id ? null : g)), 2600)
  }
  const openAuth = (mode = 'login') => { setAuthMode(mode); setPanel('auth') }
  const closePanel = () => { if (panel === 'admin' && window.location.hash === '#admin') window.history.replaceState(null, '', window.location.pathname); setPanel(null) }

  // ---- account + cloud sync ----
  const pull = async () => {
    const m = mergeData({ history, mistakes }, await getSync())
    setHistory(m.history); saveHistory(m.history)
    setMistakes(m.mistakes); saveMistakes(m.mistakes)
    setSynced(true)
  }
  const localLogout = () => { clearAuth(); setAuth(null); setSynced(false) }
  useEffect(() => {
    if (!auth) return
    getMe().then((r) => applyUser(r.user)).catch((e) => { if (e.status === 401) localLogout() })
    pull().catch(() => {})
  }, []) // eslint-disable-line
  useEffect(() => {
    if (!auth || !synced) return
    const id = setTimeout(() => putSync({ history, mistakes }).catch(() => {}), 1500)
    return () => clearTimeout(id)
  }, [history, mistakes, auth, synced]) // eslint-disable-line

  const finishLogin = (r) => {
    const a = { token: r.token, user: r.user }
    saveAuth(a); setAuth(a)
    setPanel(null)
    // Run cloud sync asynchronously in the background so login never hangs or clears the token
    pull().catch(() => { setSynced(true) })
  }
  // log in, or sign up step 1 (a 6-digit code is e-mailed; the account exists only after step 2)
  const handleAuth = async (mode, p) => {
    let r
    try {
      r = await (mode === 'login' ? login({ email: p.email, password: p.password })
        : register({ name: p.name, username: p.username, email: p.email, password: p.password, password_confirm: p.confirm, lang }))
    } catch (e) { throw new Error(errText(e)) }
    if (r.token) { finishLogin(r); return { done: true } } // logged in (or verification is switched off on the server)
    return { pending: true, email: r.email, resend_after: r.resend_after }
  }
  const handleVerify = async (email, code) => { // sign up step 2
    let r
    try { r = await verifyEmail({ email, code }) } catch (e) { throw new Error(errText(e)) }
    finishLogin(r)
  }
  const handleResend = async (email) => {
    try { return await resendCode({ email, lang }) } catch (e) { throw new Error(errText(e)) }
  }
  const handleForgot = async (email) => { // forgot password, step 1: e-mail a 6-digit code
    try { return await forgotPassword({ email, lang }) } catch (e) { throw new Error(errText(e)) }
  }
  const handleReset = async ({ email, code, password, confirm }) => { // step 2: code + new password
    try { await resetPassword({ email, code, password, password_confirm: confirm }) } catch (e) { throw new Error(errText(e)) }
  }
  const logout = async () => {
    try { await putSync({ history, mistakes }) } catch { /* offline: the last debounced sync stays */ }
    localLogout(); clearData()
    setHistory([]); setMistakes([]); setData(null); setActiveId(null); setScreen('home'); setPage('solve'); setPanel(null)
  }
  const handleAccountDeleted = () => {
    localLogout(); clearData()
    setHistory([]); setMistakes([]); setData(null); setActiveId(null); setScreen('home'); setPage('solve'); setPanel(null)
  }

  // ---- solving ----
  const submit = async (img, override) => {
    const problem = override ?? text
    setLoading(true); setError('')
    setData(null); setStep(0); setScreen('work') // the immersive workspace opens at once; a skeleton shows while the AI works
    window.scrollTo({ top: 0 })
    try {
      const { progress, guest: g, ...view } = await analyzeProblem({ text: problem, lang, image_base64: img?.data ?? null, image_mime: img?.mime ?? 'image/png' })
      setData(view)
      if (view.demo) setActiveId(null)
      else {
        const id = Date.now()
        setActiveId(id)
        updHistory((h) => [{ id, ts: id, text: problem, data: view }, ...h])
      }
      if (g) setGuest(g)
      if (progress) { applyUser(progress.user); showGain(progress.xp_gained) }
    } catch (e) {
      setScreen('home'); setPage('solve') // back to the input with a clear message
      if (e.message === 'guest_limit') { // this IP used all its free problems
        setGuest((x) => ({ limit: x?.limit || 3, used: x?.limit || 3 }))
        openAuth('register')
      }
      if (e.code === 'tokens_exhausted' && user) applyUser({ ...user, tokens_remaining: 0 })
      setError(errText(e))
    }
    setLoading(false)
  }

  const openItem = (i) => {
    setText(i.text || ''); setData(i.data); setActiveId(i.id); setStep(0)
    setScreen('work'); setPanel(null)
  }
  const newProblem = () => { setData(null); setText(''); setActiveId(null); setScreen('home'); setPanel(null) }
  const removeItem = (id) => { updHistory((h) => h.filter((i) => i.id !== id)); if (id === activeId) setActiveId(null) }
  const clearAll = () => { updHistory(() => []); setActiveId(null) }
  const startTopic = (q) => { setText(q); setPage('solve'); submit(null, q) }
  const openTestForTopic = (cat, subName) => { setPresetTopic(subName || cat); setPage('test'); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const handleTrainMistakes = (topics) => {
    const topicStr = Array.isArray(topics) ? topics.join(', ') : (topics || '')
    setPresetTopic(topicStr || 'Aralash mashqlar')
    setPage('test')
    setScreen('home')
    setPanel(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const openChat = () => { setScreen('work'); setPanel(null); setTimeout(scrollToChat, 350) }

  const onPractice = ({ level, index, q, userAnswer, user: u, xpGained, firstWrong }) => {
    applyUser(u); showGain(xpGained)
    if (firstWrong) {
      updMistakes((m) => [{ id: Date.now(), ts: Date.now(), key: data?.key, topic: data?.topic?.topic || '', q, level, index, userAnswer }, ...m])
    }
  }
  const fixMistake = (id, u, xp) => { updMistakes((m) => m.filter((x) => x.id !== id)); applyUser(u); showGain(xp) }
  const deleteMistake = (id) => updMistakes((m) => m.filter((x) => x.id !== id))

  const toggleMic = () => {
    if (micActive) { stop(); setMicActive(false); return }
    setMicActive(true)
    listen((x) => setText(x), () => setMicActive(false))
  }

  return (
    <>
      {screen === 'home' && (
        <Navbar {...{ lang, setLang, dark, setDark, voiceOn, setVoiceOn, micActive, user, page, setPage }} onMic={toggleMic}
          onHistory={() => setPanel('history')} onProgress={() => setPanel('progress')} onChat={openChat} onLogin={openAuth}
          onUpgrade={() => setPanel('pricing')} onSettings={() => setPanel('settings')} onLogout={logout} />
      )}
      <History lang={lang} open={panel === 'history'} onClose={closePanel} items={history} activeId={activeId}
        onOpen={openItem} onDelete={removeItem} onClear={clearAll} onNew={newProblem} />
      <Progress lang={lang} open={panel === 'progress'} onClose={closePanel} user={user} mistakes={mistakes}
        onFixed={fixMistake} onDelete={deleteMistake} onLogin={openAuth} onTrainMistakes={handleTrainMistakes} />
      <Auth lang={lang} open={panel === 'auth'} mode={authMode} onClose={closePanel} onSubmit={handleAuth} onVerify={handleVerify} onResend={handleResend}
        onForgot={handleForgot} onReset={handleReset} onCheckUsername={checkUsername} user={user} onLogout={logout} />
      <Pricing lang={lang} open={panel === 'pricing'} onClose={closePanel} user={user} />
      <SettingsModal lang={lang} setLang={setLang} dark={dark} setDark={setDark} voiceOn={voiceOn} setVoiceOn={setVoiceOn}
        open={panel === 'settings'} onClose={closePanel} user={user} onUserUpdate={applyUser} onAuthTokenUpdate={applyAuthToken}
        onClearHistory={clearAll} onClearMistakes={() => updMistakes(() => [])} onAccountDeleted={handleAccountDeleted}
        onUpgrade={() => setPanel('pricing')} />
      <Admin open={panel === 'admin'} onClose={closePanel} />

      <AnimatePresence>
        {gain && (
          <motion.div key={gain.id} initial={{ opacity: 0, y: 20, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20 }}
            className="fixed z-[70] top-20 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 text-white font-bold px-5 py-2 shadow-lg" role="status">
            +{gain.n} XP ⭐
          </motion.div>
        )}
      </AnimatePresence>

      {screen === 'home' && (
        <main className="mx-auto max-w-6xl px-4 pb-16">
          {page === 'solve' && (
            <div className="space-y-5">
              {!user && (
                <div className="print:hidden glass mt-4 flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <span className="text-xl" aria-hidden="true">🔒</span>
                  <p className="min-w-56 flex-1 text-sm">
                    {t.guestNote}
                    {guest?.limit > 0 && (
                      <span className={`mt-0.5 block font-bold ${guest.used >= guest.limit ? 'text-rose-600' : 'text-indigo-600 dark:text-indigo-300'}`}>
                        {t.guestCount.replace('{u}', guest.used).replace('{l}', guest.limit)}
                      </span>
                    )}
                  </p>
                  <button className="btn text-sm" onClick={() => openAuth('register')}>{t.reg}</button>
                  <button className="btn-ghost text-sm" onClick={() => openAuth('login')}>{t.login}</button>
                </div>
              )}
              <div className="print:hidden"><ProblemInput {...{ lang, text, setText, loading }} onSubmit={submit} /></div>
              {error && <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
              {data && <button className="btn-ghost" onClick={() => setScreen('work')}>↩ {t.resume}</button>}
            </div>
          )}
          {page === 'topics' && <div className="pt-8"><Topics lang={lang} onStart={startTopic} onGenerateTest={openTestForTopic} /></div>}
          {page === 'test' && (
            <div className="pt-8">
              <TestGenerator lang={lang} presetTopic={presetTopic} onClearPreset={() => setPresetTopic(null)}
                onAnalyzeProblem={startTopic} onUserUpdate={applyUser} />
            </div>
          )}
          {page === 'friends' && <div className="pt-8"><Friends lang={lang} user={user} onLogin={openAuth} /></div>}
          <footer className="pt-10 text-center">
            <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setPanel('admin')} aria-label="Admin">⚙</button>
          </footer>
        </main>
      )}

      <AnimatePresence>
        {screen === 'work' && (
          <Workspace key="workspace" lang={lang} user={user} title={data?.problem || (loading ? text.trim() || t.analyzingBig : t.chatTitle)}
            onBack={() => setScreen('home')} onHistory={() => setPanel('history')} onProgress={() => setPanel('progress')}
            showJump={!!data} onJumpChat={scrollToChat}>
            {loading && !data && <WorkspaceSkeleton lang={lang} />}
            {data && (
              <>
                {data.demo && <p className="text-sm text-amber-600">{t.demo}</p>}
                <div className="flex justify-end print:hidden">
                  <button className="btn-ghost" onClick={() => window.print()}>🖨 {t.pdf}</button>
                </div>
                <div className="grid xl:grid-cols-3 gap-5 items-start">
                  <div className="xl:col-span-2"><AnalysisCard lang={lang} data={data} /></div>
                  <ConceptCard lang={lang} text={data.concept} />
                </div>
                <div className="grid lg:grid-cols-2 gap-6 items-start">
                  <div className="lg:sticky lg:top-2"><Board lang={lang} data={data} step={step} /></div>
                  <div className="print:hidden"><SolutionPlayer lang={lang} steps={data.steps} voiceOn={voiceOn} speak={speak} onStep={setStep} /></div>
                </div>
                <Variations lang={lang} items={data.variations} />
                <div className="grid xl:grid-cols-2 gap-5 items-start print:hidden">
                  <Practice lang={lang} practice={data.practice} dataKey={data.key} voiceOn={voiceOn} speak={speak} onResult={onPractice} />
                  <Handwritten lang={lang} problem={data.problem} />
                </div>

                {/* print-only: full solution + all exercises */}
                <section className="hidden print:block space-y-3">
                  <h3 className="font-bold">{t.pSol}</h3>
                  <ol className="list-decimal pl-6 space-y-2">
                    {data.steps?.map((s, i) => <li key={i}><Tex tex={s.latex} block /><p><Rich text={s.comment} /></p></li>)}
                  </ol>
                  <h3 className="font-bold">{t.pPr}</h3>
                  {['easy', 'medium', 'hard'].map((k) => (
                    <div key={k}><h4 className="font-bold">{t[k]}</h4>
                      <ol className="list-decimal pl-6">{(data.practice?.[k] || []).map((x, i) => <li key={i}><Tex tex={x.q} /></li>)}</ol>
                    </div>
                  ))}
                </section>
              </>
            )}
            {!(loading && !data) && (
              <ChatSection lang={lang} user={user} data={data} step={step} voiceOn={voiceOn} speak={speak} listen={listen} onLogin={openAuth} onUser={applyUser} />
            )}
          </Workspace>
        )}
      </AnimatePresence>
    </>
  )
}
