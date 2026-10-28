import { useState } from 'react'
import { motion } from 'framer-motion'
import { T } from '../lib/i18n'
import { PLANS, TELEGRAM, fmtPrice } from '../lib/plans'
import { PlanBadge } from './ui'

const THEME = {
  free: { ring: 'border-slate-200 dark:border-white/10', head: 'from-slate-500 to-slate-600' },
  premium: { ring: 'border-amber-300 ring-4 ring-amber-300/30', head: 'from-amber-400 to-orange-500' },
  vip: { ring: 'border-fuchsia-300 dark:border-fuchsia-500/40', head: 'from-fuchsia-500 to-rose-500' },
}

/** Pricing window: Free / Premium / VIP. 1-click Telegram link with pre-filled email, name, username, and selected plan. */
export default function Pricing({ lang, open, onClose, user }) {
  const t = T[lang]
  const [pick, setPick] = useState('premium')
  const [copied, setCopied] = useState(false)
  if (!open) return null
  const current = user?.plan || 'free'
  const names = { free: t.planFree, premium: t.planPremium, vip: t.planVip }
  const feats = { free: t.planFeatFree, premium: t.planFeatPremium, vip: t.planFeatVip }

  const buildMsg = (planId) => {
    const planLabel = `${names[planId]} (${fmtPrice(PLANS[planId].price)} UZS)`
    const base = t.msgTpl.replace('{u}', user?.username || 'username').replace('{plan}', planLabel)
    const details = [
      user?.name ? `Ism: ${user.name}` : '',
      user?.email ? `Email: ${user.email}` : '',
    ].filter(Boolean).join(' | ')
    return details ? `${base} (${details})` : base
  }

  const tgDirectLink = (planId) => `https://t.me/${TELEGRAM}?text=${encodeURIComponent(buildMsg(planId))}`
  const message = buildMsg(pick)

  const copy = async () => {
    try { await navigator.clipboard.writeText(message); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* clipboard blocked: the text is visible anyway */ }
  }
  const until = user?.plan_expires_at ? new Date(user.plan_expires_at * 1000).toLocaleDateString() : null

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} role="dialog" aria-modal="true" aria-label={t.plansTitle}
        className="relative mx-auto my-6 w-full max-w-5xl rounded-[2rem] bg-white p-6 shadow-2xl sm:p-10 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <button className="absolute right-4 top-4 rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10" onClick={onClose} aria-label={t.close}>✕</button>
        <div className="text-center">
          <h2 className="font-display text-3xl font-extrabold sm:text-4xl"><span className="gradient-text">{t.plansTitle}</span></h2>
          <p className="mt-2 text-slate-600 dark:text-slate-300">{t.plansSub}</p>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {['free', 'premium', 'vip'].map((id, i) => (
            <motion.article key={id} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 * i }}
              className={`relative flex flex-col rounded-3xl border-2 bg-white p-6 dark:bg-slate-800/60 ${THEME[id].ring}`}>
              {id === 'premium' && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-1 text-xs font-extrabold text-white shadow">{t.planPopular}</span>}
              <div className={`inline-flex w-fit items-center gap-2 rounded-xl bg-gradient-to-r px-3 py-1 text-sm font-extrabold text-white ${THEME[id].head}`}>{names[id]} {current === id && '✓'}</div>
              <p className="mt-4 font-display text-4xl font-extrabold">{PLANS[id].price ? fmtPrice(PLANS[id].price) : '0'}<span className="ml-1 text-base font-semibold text-slate-500">{PLANS[id].price ? t.perMonth : ''}</span></p>
              <p className="mt-1 text-sm font-bold text-indigo-600 dark:text-indigo-300">⚡ {PLANS[id].tokens} / {t.perDay}</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {feats[id].map((x) => <li key={x} className="flex items-start gap-2"><span className="mt-0.5 text-emerald-500">✓</span>{x}</li>)}
              </ul>
              {current === id
                ? <div className="mt-5 rounded-2xl bg-emerald-50 px-4 py-2.5 text-center text-sm font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{t.planCurrent}{id !== 'free' && until ? ` · ${t.planUntil.replace('{d}', until)}` : ''}</div>
                : id === 'free'
                  ? <div className="mt-5 rounded-2xl bg-slate-100 px-4 py-2.5 text-center text-sm font-bold text-slate-500 dark:bg-white/5">{t.planFree}</div>
                  : (
                    <a
                      href={tgDirectLink(id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setPick(id)}
                      className={`mt-5 ${id === 'premium' ? 'btn-gold' : 'btn'} !py-2.5 text-center`}
                    >
                      ✈️ {t.choosePlan} {names[id]}
                    </a>
                  )}
            </motion.article>
          ))}
        </div>

        <section className="mt-8 grid gap-6 rounded-3xl bg-gradient-to-br from-indigo-50 to-violet-50 p-6 md:grid-cols-[1.1fr_1fr] dark:from-indigo-500/10 dark:to-violet-500/10">
          <div>
            <h3 className="font-display text-xl font-bold">{t.howTitle}</h3>
            <ol className="mt-3 space-y-3 text-sm">
              {[t.how1, t.how2, t.how3].map((s, i) => <li key={i} className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-indigo-600 text-xs font-bold text-white">{i + 1}</span><span>{s}</span></li>)}
            </ol>
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{t.chooseWrite}</span>
              {['premium', 'vip'].map((p) => (
                <button key={p} type="button" onClick={() => setPick(p)}
                  className={`rounded-xl px-3 py-1 text-xs font-bold transition ${pick === p ? 'bg-indigo-600 text-white shadow' : 'bg-white/80 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                  {names[p]}
                </button>
              ))}
            </div>
            <p className="rounded-2xl border border-indigo-200 bg-white p-3 text-sm dark:border-white/10 dark:bg-slate-900" data-testid="pricing-message">{message}</p>
            <div className="flex flex-wrap gap-2">
              <a className="btn" href={tgDirectLink(pick)} target="_blank" rel="noopener noreferrer">✈️ {t.tgBtn} @{TELEGRAM}</a>
              <button className="btn-ghost" onClick={copy}>{copied ? t.copied : t.copyMsg}</button>
            </div>
          </div>
        </section>
      </motion.div>
    </div>
  )
}
