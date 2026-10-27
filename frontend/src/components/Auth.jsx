import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { T } from '../lib/i18n'
import { Avatar, Logo, PlanBadge } from './ui'

const USERNAME_RE = /^[a-z0-9_]{3,20}$/
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const SYMBOLS = [['∑', 'left-[8%] top-[12%]', '0s'], ['π', 'right-[10%] top-[20%]', '1.2s'], ['√', 'left-[18%] bottom-[22%]', '2.1s'], ['∞', 'right-[16%] bottom-[14%]', '0.6s'], ['∫', 'left-[52%] top-[8%]', '1.8s']]

// 0 = empty, 1 weak ... 4 strong
function strengthSegments(p) {
  if (!p) return 0
  if (p.length < 8) return 1
  const s = (p.length >= 8) + (p.length >= 12) + (/[a-z]/.test(p) && /[A-Z]/.test(p)) + /\d/.test(p) + /[^A-Za-z0-9]/.test(p)
  return s <= 1 ? 1 : s === 2 ? 2 : s <= 4 ? 3 : 4
}

function Field({ id, label, icon, hint, tone, right, children }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      <div className="relative flex items-center">
        {icon && (
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-slate-400 select-none">
            {icon}
          </span>
        )}
        {children}
        {right}
      </div>
      {hint && <p className={`text-xs ${tone === 'bad' ? 'text-rose-600' : tone === 'ok' ? 'text-emerald-600' : 'text-slate-500 dark:text-slate-400'}`}>{hint}</p>}
    </div>
  )
}

/** Log in / sign up / e-mail code / forgot password in one split-screen window. */
export default function Auth({ lang, open, mode: startMode, onClose, onSubmit, onVerify, onResend, onForgot, onReset, onCheckUsername, user, onLogout }) {
  const t = T[lang]
  const [view, setView] = useState('login') // login | register | code | forgot | reset
  const [f, setF] = useState({ name: '', username: '', email: '', password: '', confirm: '' })
  const [show, setShow] = useState(false)
  const [code, setCode] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [uname, setUname] = useState('idle') // idle | checking | ok | taken | bad
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  useEffect(() => { if (open) { setView(startMode === 'register' ? 'register' : 'login'); setErr(''); setInfo(''); setCode(''); setLoading(false) } }, [open, startMode])
  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])
  useEffect(() => { // live "is this username free?"
    if (view !== 'register') return
    const u = f.username.trim().toLowerCase()
    if (!u) { setUname('idle'); return }
    if (!USERNAME_RE.test(u)) { setUname('bad'); return }
    setUname('checking')
    let live = true
    const id = setTimeout(() => {
      Promise.resolve(onCheckUsername ? onCheckUsername(u) : { valid: true, available: true })
        .then((r) => live && setUname(r.available ? 'ok' : r.valid ? 'taken' : 'bad')).catch(() => live && setUname('idle'))
    }, 450)
    return () => { live = false; clearTimeout(id) }
  }, [f.username, view]) // eslint-disable-line

  const verify = async (value = code) => {
    if (loading || value.length !== 6) return
    setLoading(true); setErr(''); setInfo('')
    try {
      await onVerify(pendingEmail, value)
    } catch (x) {
      setErr(String(x?.message || x))
      setCode('')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { if (view === 'code' && code.length === 6) verify(code) }, [code]) // eslint-disable-line

  const run = (fn) => async (e) => {
    e?.preventDefault()
    if (loading) return
    setLoading(true); setErr(''); setInfo('')
    try {
      await fn()
    } catch (x) {
      setErr(String(x?.message || x))
    } finally {
      setLoading(false)
    }
  }
  const login = run(async () => { await onSubmit('login', { email: f.email.trim(), password: f.password }); setF((x) => ({ ...x, password: '' })) })
  const register = run(async () => {
    const r = await onSubmit('register', { name: f.name.trim(), username: f.username.trim().toLowerCase(), email: f.email.trim(), password: f.password, confirm: f.confirm })
    if (r?.pending) { setPendingEmail(r.email); setCooldown(r.resend_after || 60); setCode(''); setView('code'); setF((x) => ({ ...x, password: '', confirm: '' })) }
  })
  const resend = run(async () => { if (cooldown > 0) return; const r = await onResend(pendingEmail); setCooldown(r.resend_after || 60); setInfo(t.otpResent); setCode('') })
  const forgot = run(async () => {
    const r = await onForgot(f.email.trim())
    setPendingEmail(f.email.trim().toLowerCase()); setCooldown(r?.resend_after || 60); setCode(''); setView('reset')
  })
  const resendReset = run(async () => { if (cooldown > 0) return; const r = await onForgot(pendingEmail); setCooldown(r?.resend_after || 60); setInfo(t.otpResent) })
  const reset = run(async () => {
    await onReset({ email: pendingEmail, code, password: f.password, confirm: f.confirm })
    setF((x) => ({ ...x, email: pendingEmail, password: '', confirm: '' })); setCode(''); setView('login'); setInfo(t.resetDone)
  })

  if (!open) return null
  const seg = strengthSegments(f.password)
  const segLabel = [null, t.pwWeak, t.pwFair, t.pwGood, t.pwStrong][seg]
  const segColor = ['', 'bg-rose-500', 'bg-amber-500', 'bg-lime-500', 'bg-emerald-500'][seg]
  const matches = f.confirm && f.password === f.confirm
  const mismatch = f.confirm && f.password !== f.confirm
  const unameHint = { idle: t.usernameHint, bad: t.userBad, checking: t.userChecking, ok: t.userOk, taken: t.userTaken }[uname]
  const unameTone = uname === 'ok' ? 'ok' : uname === 'bad' || uname === 'taken' ? 'bad' : ''
  const canRegister = f.name.trim() && f.username && !['bad', 'taken'].includes(uname) && EMAIL_RE.test(f.email) && f.password.length >= 8 && f.password === f.confirm
  const canReset = code.length === 6 && f.password.length >= 8 && f.password === f.confirm

  const eye = (
    <button type="button" onClick={() => setShow(!show)} aria-label={show ? t.hidePw : t.showPw} aria-pressed={show}
      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">{show ? '🙈' : '👁️'}</button>
  )
  const inp = (extra = '') => `field ${extra}`
  const passwordField = (id, label, key, auto, right = eye) => (
    <Field id={id} label={label} icon="🔒" right={right}>
      <input id={id} className={inp('!pl-11 !pr-11')} type={show ? 'text' : 'password'} required minLength={key === 'password' && view === 'login' ? 1 : 8} value={f[key]} onChange={set(key)} autoComplete={auto} />
    </Field>
  )
  const strengthMeter = f.password && (
    <div aria-live="polite">
      <div className="flex gap-1">{[1, 2, 3, 4].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= seg ? segColor : 'bg-slate-200 dark:bg-white/10'}`} />)}</div>
      <p className="mt-1 text-xs text-slate-500">{segLabel}{f.password.length < 8 ? ` · ${t.pwMin}` : ''}</p>
    </div>
  )
  const msgs = (<>
    {err && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{err}</p>}
    {info && <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{info}</p>}
  </>)

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} role="dialog" aria-modal="true"
        className="relative grid w-full max-w-4xl overflow-hidden rounded-[2rem] bg-white shadow-2xl md:grid-cols-[1fr_1.05fr] dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        {/* brand panel */}
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-10 text-white md:flex">
          {SYMBOLS.map(([s, pos, delay]) => <span key={s} aria-hidden="true" className={`animate-float absolute font-display text-5xl font-extrabold text-white/15 ${pos}`} style={{ animationDelay: delay }}>{s}</span>)}
          <div className="relative flex items-center gap-3"><Logo size={42} /><span className="font-display text-xl font-extrabold">AI Math Tutor</span></div>
          <div className="relative space-y-6">
            <h2 className="font-display text-4xl font-extrabold leading-tight">{t.authTag}</h2>
            <ul className="space-y-3 text-white/90">{[t.authB1, t.authB2, t.authB3].map((b) => <li key={b} className="flex items-start gap-3"><span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-white/20 text-sm">✓</span>{b}</li>)}</ul>
          </div>
          <p className="relative text-sm text-white/70">UZ · RU · EN</p>
        </aside>

        <div className="relative p-6 sm:p-10">
          <button className="absolute right-4 top-4 rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10" onClick={onClose} aria-label={t.close}>✕</button>
          <motion.div key={user ? 'profile' : view} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
            {user ? (
              <div className="space-y-4 pt-4 text-center">
                <Avatar name={user.name} size={72} className="mx-auto" />
                <div><h2 className="font-display text-2xl font-bold">{user.name} <PlanBadge plan={user.plan} /></h2><p className="text-sm text-slate-500">@{user.username} · {user.email}</p></div>
                <button className="btn w-full" onClick={onLogout}>🚪 {t.logout}</button>
              </div>
            ) : view === 'code' ? (
              <div className="space-y-4 pt-4">
                <h2 className="font-display text-2xl font-bold">✉️ {t.otpTitle}</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">{t.otpSent.replace('{email}', pendingEmail)}</p>
                <Field id="auth-code" label={t.otpLabel}>
                  <input id="auth-code" className={inp('text-center font-mono text-2xl tracking-[0.5em]')} inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="one-time-code" autoFocus
                    value={code} disabled={loading} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                </Field>
                {msgs}
                <button className="btn w-full" disabled={loading || code.length !== 6} onClick={() => verify()}>{loading ? '…' : t.otpVerify}</button>
                <button type="button" className="btn-ghost w-full text-sm" disabled={loading || cooldown > 0} onClick={resend}>{cooldown > 0 ? t.otpResendIn.replace('{s}', cooldown) : t.otpResend}</button>
                <p className="text-xs text-slate-500">{t.otpSpam}</p>
                <button type="button" className="text-sm font-semibold text-indigo-600 underline dark:text-indigo-300" onClick={() => { setView('register'); setErr(''); setInfo('') }}>{t.otpChangeEmail}</button>
              </div>
            ) : view === 'forgot' ? (
              <form onSubmit={forgot} className="space-y-4 pt-4">
                <h2 className="font-display text-2xl font-bold">🔑 {t.forgotTitle}</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">{t.forgotInfo}</p>
                <Field id="auth-email" label={t.email} icon="✉️"><input id="auth-email" className={inp('!pl-11')} type="email" required value={f.email} onChange={set('email')} autoComplete="email" autoFocus /></Field>
                {msgs}
                <button className="btn w-full" disabled={loading || !EMAIL_RE.test(f.email)}>{loading ? '…' : t.sendCode}</button>
                <button type="button" className="text-sm font-semibold text-indigo-600 underline dark:text-indigo-300" onClick={() => { setView('login'); setErr('') }}>{t.backLogin}</button>
              </form>
            ) : view === 'reset' ? (
              <form onSubmit={reset} className="space-y-4 pt-4">
                <h2 className="font-display text-2xl font-bold">🔐 {t.resetTitle}</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">{t.resetInfo.replace('{email}', pendingEmail)}</p>
                <Field id="auth-code" label={t.otpLabel}>
                  <input id="auth-code" className={inp('text-center font-mono text-2xl tracking-[0.5em]')} inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="one-time-code" autoFocus
                    value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                </Field>
                {passwordField('auth-newpass', t.newPass, 'password', 'new-password')}
                {strengthMeter}
                <Field id="auth-confirm" label={t.confirmLbl} icon="🔒" hint={mismatch ? t.pwMismatch : matches ? t.pwMatch : ''} tone={mismatch ? 'bad' : 'ok'}>
                  <input id="auth-confirm" className={inp('!pl-11 !pr-11')} type={show ? 'text' : 'password'} required value={f.confirm} onChange={set('confirm')} autoComplete="new-password" />
                </Field>
                {msgs}
                <button className="btn w-full" disabled={loading || !canReset}>{loading ? '…' : t.resetBtn}</button>
                <button type="button" className="btn-ghost w-full text-sm" disabled={loading || cooldown > 0} onClick={resendReset}>{cooldown > 0 ? t.otpResendIn.replace('{s}', cooldown) : t.otpResend}</button>
                <button type="button" className="text-sm font-semibold text-indigo-600 underline dark:text-indigo-300" onClick={() => { setView('login'); setErr(''); setInfo('') }}>{t.backLogin}</button>
              </form>
            ) : (
              <form onSubmit={view === 'login' ? login : register} className="space-y-4 pt-4" noValidate={false}>
                <div>
                  <h2 className="font-display text-3xl font-extrabold">{t.authWelcome}</h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{view === 'login' ? t.authLoginSub : t.authRegSub}</p>
                </div>
                <div role="tablist" className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1 dark:bg-white/10">
                  {[['login', t.login], ['register', t.reg]].map(([k, l]) => (
                    <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => { setView(k); setErr(''); setInfo('') }}
                      className={`rounded-xl py-2 text-sm font-bold transition ${view === k ? 'bg-white shadow dark:bg-slate-800' : 'text-slate-500'}`}>{l}</button>
                  ))}
                </div>
                {view === 'register' && (<>
                  <Field id="auth-name" label={t.nameLbl} icon="🙂"><input id="auth-name" className={inp('!pl-11')} required maxLength={40} value={f.name} onChange={set('name')} autoComplete="name" /></Field>
                  <Field id="auth-username" label={t.usernameLbl} icon="@" hint={unameHint} tone={unameTone}>
                    <input id="auth-username" className={inp('!pl-11')} required maxLength={20} value={f.username} onChange={(e) => setF((x) => ({ ...x, username: e.target.value.replace(/[^A-Za-z0-9_]/g, '') }))} autoComplete="username" autoCapitalize="none" spellCheck="false" />
                  </Field>
                </>)}
                <Field id="auth-email" label={t.email} icon="✉️"><input id="auth-email" className={inp('!pl-11')} type="email" required value={f.email} onChange={set('email')} autoComplete="email" /></Field>
                {passwordField('auth-pass', t.pass, 'password', view === 'login' ? 'current-password' : 'new-password')}
                {view === 'register' && (<>
                  {strengthMeter}
                  <Field id="auth-confirm" label={t.confirmLbl} icon="🔒" hint={mismatch ? t.pwMismatch : matches ? t.pwMatch : ''} tone={mismatch ? 'bad' : 'ok'}>
                    <input id="auth-confirm" className={inp('!pl-11 !pr-11')} type={show ? 'text' : 'password'} required value={f.confirm} onChange={set('confirm')} autoComplete="new-password" />
                  </Field>
                </>)}
                {view === 'login' && <button type="button" className="text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-300" onClick={() => { setView('forgot'); setErr(''); setInfo('') }}>{t.forgot}</button>}
                {msgs}
                <button className="btn w-full !py-3" disabled={loading || (view === 'register' && !canRegister)}>{loading ? '…' : view === 'login' ? t.login : t.reg}</button>
              </form>
            )}
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}
