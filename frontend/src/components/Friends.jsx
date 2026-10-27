import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { T } from '../lib/i18n'
import { friendAccept, friendRemove, friendRequest, getFeed, getFriends, getLeaderboard } from '../lib/api'
import { levelInfo } from '../lib/store'
import { Avatar, PlanBadge } from './ui'

const MEDAL = ['🥇', '🥈', '🥉']

/** "Do'stlar": add friends by username, leaderboard (XP / streak) among friends, milestones feed and sharing. */
export default function Friends({ lang, user, onLogin }) {
  const t = T[lang]
  const [ov, setOv] = useState({ friends: [], incoming: [], outgoing: [] })
  const [by, setBy] = useState('xp')
  const [rows, setRows] = useState([])
  const [feed, setFeed] = useState([])
  const [name, setName] = useState('')
  const [msg, setMsg] = useState(null) // { ok, text }
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [o, l, f] = await Promise.all([getFriends(), getLeaderboard(by), getFeed()])
      setOv(o); setRows(l.rows); setFeed(f.items)
    } catch { /* the page simply stays empty */ }
  }, [by])
  useEffect(() => { if (user) load() }, [user?.id, by]) // eslint-disable-line

  const errText = (e) => (e.status === 0 ? t.net : t['frErr_' + e.code] || t.err)
  const act = async (fn, okText) => {
    setBusy(true); setMsg(null)
    try { const r = await fn(); await load(); if (okText) setMsg({ ok: true, text: typeof okText === 'function' ? okText(r) : okText }) } catch (e) { setMsg({ ok: false, text: errText(e) }) }
    setBusy(false)
  }
  const send = (e) => {
    e.preventDefault()
    const u = name.trim().replace(/^@/, '')
    if (u) act(() => friendRequest(u), (r) => (r.status === 'accepted' ? t.frNowFriends : t.frSentOk)).then(() => setName(''))
  }

  if (!user) {
    return (
      <section className="glass mx-auto mt-6 max-w-lg space-y-4 p-10 text-center">
        <div className="text-6xl" aria-hidden="true">👥</div>
        <h2 className="font-display text-2xl font-extrabold">{t.frTitle}</h2>
        <p className="text-slate-600 dark:text-slate-300">{t.frLogin}</p>
        <div className="flex justify-center gap-2"><button className="btn" onClick={() => onLogin('register')}>{t.reg}</button><button className="btn-ghost" onClick={() => onLogin('login')}>{t.login}</button></div>
      </section>
    )
  }

  const L = levelInfo(user.xp)
  const shareText = t.frShareTxt.replace('{name}', user.name).replace('{u}', user.username || '').replace('{xp}', user.xp).replace('{streak}', user.streak).replace('{level}', L.level)
  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: 'AI Math Tutor', text: shareText, url: window.location.origin }); return }
      await navigator.clipboard.writeText(`${shareText} ${window.location.origin}`)
      setMsg({ ok: true, text: t.frCopied })
    } catch { /* the user closed the share sheet */ }
  }
  const telegram = `https://t.me/share/url?url=${encodeURIComponent(window.location.origin)}&text=${encodeURIComponent(shareText)}`
  const label = (it) => (it.kind === 'streak' ? t.msStreak : it.kind === 'xp' ? t.msXp : t.msLevel).replace('{n}', it.value)

  return (
    <section className="space-y-6 pb-4" aria-label={t.frTitle}>
      <header>
        <h2 className="font-display text-3xl font-extrabold sm:text-4xl"><span className="gradient-text">{t.frTitle}</span></h2>
        <p className="mt-1 text-slate-600 dark:text-slate-300">{t.frSub}</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          {/* add a friend */}
          <form onSubmit={send} className="glass flex flex-wrap items-end gap-3 p-5">
            <div className="min-w-48 flex-1">
              <label htmlFor="friend-name" className="text-sm font-semibold">{t.frAdd}</label>
              <div className="relative mt-1.5 flex items-center"><span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-slate-400">@</span>
                <input id="friend-name" className="field !pl-10" placeholder={t.frPh} value={name} onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_@]/g, ''))} maxLength={21} autoCapitalize="none" /></div>
            </div>
            <button className="btn" disabled={busy || !name.trim()}>{t.frSend}</button>
            {msg && <p role={msg.ok ? 'status' : 'alert'} className={`w-full text-sm font-semibold ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</p>}
          </form>

          {/* requests */}
          {(ov.incoming.length > 0 || ov.outgoing.length > 0) && (
            <div className="glass space-y-3 p-5">
              {ov.incoming.length > 0 && <h3 className="font-display text-lg font-bold">{t.frRequests}</h3>}
              {ov.incoming.map((p) => (
                <div key={p.id} className="flex items-center gap-3"><Avatar name={p.name} /><div className="min-w-0 flex-1"><div className="truncate font-bold">{p.name}</div><div className="text-xs text-slate-500">@{p.username}</div></div>
                  <button className="btn !px-3 !py-1.5 text-sm" disabled={busy} onClick={() => act(() => friendAccept(p.id), t.frNowFriends)}>{t.frAccept}</button>
                  <button className="btn-ghost !px-3 !py-1.5 text-sm" disabled={busy} onClick={() => act(() => friendRemove(p.id))}>{t.frDecline}</button></div>
              ))}
              {ov.outgoing.map((p) => (
                <div key={p.id} className="flex items-center gap-3 text-sm text-slate-500"><Avatar name={p.name} size={30} /><span className="flex-1 truncate">@{p.username} · {t.frPending}</span>
                  <button className="btn-ghost !px-2.5 !py-1 text-xs" disabled={busy} onClick={() => act(() => friendRemove(p.id))}>{t.frCancel}</button></div>
              ))}
            </div>
          )}

          {/* leaderboard */}
          <div className="glass p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="mr-auto font-display text-lg font-bold">🏆 {t.frBoard}</h3>
              <div role="tablist" className="flex rounded-xl bg-slate-100 p-1 dark:bg-white/10">
                {[['xp', t.frByXp], ['streak', t.frByStreak]].map(([k, l]) => (
                  <button key={k} role="tab" aria-selected={by === k} onClick={() => setBy(k)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${by === k ? 'bg-white shadow dark:bg-slate-800' : 'text-slate-500'}`}>{l}</button>
                ))}
              </div>
            </div>
            {rows.length <= 1 && <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">{t.frEmpty}</p>}
            <ol className="space-y-2">
              {rows.map((r, i) => (
                <motion.li key={r.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${r.me ? 'bg-indigo-50 ring-2 ring-indigo-300 dark:bg-indigo-500/10 dark:ring-indigo-500/40' : 'bg-white/60 dark:bg-white/5'}`}>
                  <span className="w-8 text-center text-xl font-bold" aria-label={`#${r.rank}`}>{MEDAL[r.rank - 1] || `#${r.rank}`}</span>
                  <Avatar name={r.name} />
                  <div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><span className="truncate font-bold">{r.name}</span>{r.me && <span className="chip">{t.frYou}</span>}<PlanBadge plan={r.plan} /></div><div className="text-xs text-slate-500">@{r.username} · Lv {r.level}</div></div>
                  <div className="text-right font-display text-lg font-extrabold">{by === 'streak' ? `🔥 ${r.streak}` : `⭐ ${r.xp}`}</div>
                </motion.li>
              ))}
            </ol>
          </div>

          {ov.friends.length > 0 && (
            <div className="glass p-5">
              <h3 className="mb-3 font-display text-lg font-bold">👥 {t.frTitle} ({ov.friends.length})</h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {ov.friends.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-white/60 px-3 py-2 dark:bg-white/5"><Avatar name={p.name} size={32} /><span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name} <span className="font-normal text-slate-500">@{p.username}</span></span>
                    <button className="text-xs text-rose-600 underline" disabled={busy} onClick={() => act(() => friendRemove(p.id))} aria-label={`${t.frRemove} @${p.username}`}>{t.frRemove}</button></li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="space-y-5">
          {/* share card */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-xl shadow-indigo-600/30">
            <span aria-hidden="true" className="animate-float absolute -right-3 -top-3 font-display text-7xl font-extrabold text-white/10">∑</span>
            <div className="relative flex items-center gap-3"><Avatar name={user.name} size={48} className="ring-2 ring-white/60" /><div><div className="font-display text-lg font-bold">{user.name}</div><div className="text-sm text-white/70">@{user.username}</div></div></div>
            <div className="relative mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-2xl bg-white/15 p-2"><div className="font-display text-xl font-extrabold">{user.xp}</div><div className="text-[11px] text-white/80">XP</div></div>
              <div className="rounded-2xl bg-white/15 p-2"><div className="font-display text-xl font-extrabold">🔥 {user.streak}</div><div className="text-[11px] text-white/80">{t.days}</div></div>
              <div className="rounded-2xl bg-white/15 p-2"><div className="font-display text-xl font-extrabold">{L.level}</div><div className="text-[11px] text-white/80">{t.lvl}</div></div></div>
            <div className="relative mt-4 flex flex-wrap gap-2"><button className="rounded-2xl bg-white px-4 py-2 text-sm font-bold text-indigo-700 transition hover:-translate-y-0.5" onClick={share}>📣 {t.frShare}</button>
              <a className="rounded-2xl bg-white/20 px-4 py-2 text-sm font-bold transition hover:bg-white/30" href={telegram} target="_blank" rel="noopener noreferrer">✈️ Telegram</a></div>
          </div>

          {/* milestones feed */}
          <div className="glass p-5">
            <h3 className="mb-3 font-display text-lg font-bold">🎉 {t.frFeed}</h3>
            {feed.length === 0 ? <p className="text-sm text-slate-500">{t.frFeedEmpty}</p> : (
              <ul className="space-y-3">
                {feed.map((it, i) => (
                  <li key={i} className="flex items-start gap-3"><Avatar name={it.name} size={32} />
                    <div className="min-w-0 text-sm"><span className="font-bold">{it.me ? t.frYou : it.name}</span> <span className="text-slate-600 dark:text-slate-300">{label(it)}</span>
                      <div className="text-xs text-slate-400">{new Date(it.created_at * 1000).toLocaleDateString()}</div></div></li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}
