import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { T } from '../lib/i18n'

export default function Auth({ lang, open, mode: startMode, onClose, onSubmit, user, onLogout }) {
  const t = T[lang]
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setMode(startMode || 'login'); setErr('') } }, [open, startMode])
  if (!open) return null

  const go = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try { await onSubmit(mode, name.trim(), email.trim(), password); setPassword('') } catch (x) { setErr(String(x.message)) }
    setBusy(false)
  }
  const input = 'w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 focus-visible:outline-2 focus-visible:outline-indigo-400'
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <motion.div initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} role="dialog" aria-modal="true"
        className="glass !bg-white dark:!bg-slate-900 w-full max-w-sm p-6 space-y-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {user ? (
          <>
            <h2 className="font-display text-xl">👤 {user.name}</h2>
            <p className="text-sm text-slate-500">{user.email}</p>
            <p className="text-sm text-slate-500">{t.cloud}</p>
            <button className="btn w-full" onClick={onLogout}>{t.logout}</button>
          </>
        ) : (
          <form onSubmit={go} className="space-y-3">
            <div className="grid grid-cols-2 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700" role="tablist">
              {[['login', t.login], ['register', t.reg]].map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => { setMode(k); setErr('') }}
                  className={`py-2 font-bold ${mode === k ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{l}</button>
              ))}
            </div>
            <p className="text-sm text-slate-500">{t.cloud}</p>
            {mode === 'register' && (
              <input className={input} required maxLength={40} placeholder={t.nameLbl} aria-label={t.nameLbl} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            )}
            <input className={input} type="email" required placeholder={t.email} aria-label={t.email} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            <input className={input} type="password" required minLength={6} placeholder={t.pass} aria-label={t.pass} value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            {err && <p role="alert" className="text-rose-600 text-sm font-bold">{err}</p>}
            <button className="btn w-full" disabled={busy}>{busy ? '…' : mode === 'login' ? t.login : t.reg}</button>
          </form>
        )}
        <button className="btn-ghost w-full text-sm" onClick={onClose}>{t.close}</button>
      </motion.div>
    </div>
  )
}
