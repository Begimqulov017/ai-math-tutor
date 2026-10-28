import { useEffect, useRef, useState } from 'react'
import { T } from '../lib/i18n'
import { chatApi, createThread, deleteThread, getThread, listThreads, sendThreadMessage } from '../lib/api'
import { Rich, Tex } from './Tex'
import { unlockAudio } from '../lib/useVoice'

/** Persistent, topic-aware chat. Logged-in users: threads + messages live in the database and the AI remembers
 *  the topic and the conversation of the open thread. Guests: a temporary chat that is not saved. */
export default function ChatSection({ lang, user, data, step, voiceOn, speak, listen, onLogin, onUser }) {
  const t = T[lang]
  const loggedIn = !!user
  const [threads, setThreads] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [msgs, setMsgs] = useState([])
  const [guestMsgs, setGuestMsgs] = useState([])
  const [val, setVal] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [showList, setShowList] = useState(false)
  const box = useRef()
  const skipLoad = useRef(null) // a thread we just created locally has nothing to load yet
  const messages = loggedIn ? msgs : guestMsgs
  const context = data ? { problem: data.problem, topic: data.topic, currentStep: step + 1, step: data.steps?.[step] } : {}
  const activeThread = threads.find((x) => x.id === activeId)

  const refreshThreads = () => listThreads().then((r) => setThreads(r.threads)).catch(() => {})

  // 1) the user's threads
  useEffect(() => {
    if (!loggedIn) { setThreads([]); setActiveId(null); setMsgs([]); return }
    refreshThreads()
  }, [user?.id]) // eslint-disable-line

  // 2) a (new or reopened) problem selects its own thread
  useEffect(() => {
    if (!loggedIn || !data || data.demo) return
    if (data.thread_id) { setActiveId(data.thread_id); refreshThreads(); return }
    if (data.key) createThread({ problem_key: data.key }).then((r) => { setActiveId(r.thread.id); refreshThreads() }).catch(() => {})
  }, [data?.key, data?.thread_id, user?.id]) // eslint-disable-line

  // 3) the messages of the open thread
  useEffect(() => {
    if (!loggedIn || !activeId) { setMsgs([]); return }
    if (skipLoad.current === activeId) { skipLoad.current = null; return }
    let live = true
    getThread(activeId).then((r) => { if (live) setMsgs(r.messages) }).catch(() => { if (live) setMsgs([]) })
    return () => { live = false }
  }, [activeId, user?.id]) // eslint-disable-line

  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight }, [messages.length, busy])

  const newChat = async () => {
    if (!loggedIn) { setGuestMsgs([]); return }
    try {
      const r = await createThread({ title: '' })
      skipLoad.current = r.thread.id
      setActiveId(r.thread.id); setMsgs([]); setShowList(false); refreshThreads()
    } catch { setErr(t.err) }
  }
  const removeThread = async (id) => {
    if (!window.confirm(t.delThread + '?')) return
    try {
      await deleteThread(id)
      setThreads((x) => x.filter((th) => th.id !== id))
      if (id === activeId) { setActiveId(null); setMsgs([]) }
    } catch { setErr(t.err) }
  }

  const send = async (text = val) => {
    const content = text.trim()
    if (!content || busy) return
    setVal(''); setErr(''); setBusy(true)
    const mine = { id: 'tmp' + Date.now(), role: 'user', content }
    if (loggedIn) {
      try {
        let id = activeId
        if (!id) { // first question without a thread: start a free chat
          const r = await createThread({ title: '' })
          id = r.thread.id
          skipLoad.current = id
          setActiveId(id)
        }
        setMsgs((m) => [...m, mine])
        const r = await sendThreadMessage(id, { content, lang, context })
        setMsgs((m) => [...m.filter((x) => x.id !== mine.id), r.message, r.reply])
        if (r.user) onUser?.(r.user) // the token balance changes every 3rd message
        refreshThreads()
        if (voiceOn) speak(r.reply.content)
      } catch (e) {
        setMsgs((m) => m.filter((x) => x.id !== mine.id)); setVal(content)
        if (e.code === 'tokens_exhausted' && user) onUser?.({ ...user, tokens_remaining: 0 })
        setErr(
          e.status === 0 ? t.net
            : e.code === 'tokens_exhausted' ? t.tokensOut
            : e.status === 429 || e.status === 503 ? t.busy
            : t.err + (e.message ? ': ' + String(e.message).slice(0, 160) : '')
        )
      }
    } else {
      setGuestMsgs((m) => [...m, mine])
      try {
        const r = await chatApi({ message: content, lang, history: guestMsgs.map((x) => ({ role: x.role === 'user' ? 'student' : 'tutor', text: x.content })), context })
        setGuestMsgs((m) => [...m, { id: 'g' + Date.now(), role: 'assistant', content: r.reply }])
        if (voiceOn) speak(r.reply)
      } catch (e) {
        setGuestMsgs((m) => m.filter((x) => x.id !== mine.id)); setVal(content)
        setErr(
          e.status === 0 ? t.net
            : e.status === 429 || e.status === 503 ? t.busy
            : t.err + (e.message ? ': ' + String(e.message).slice(0, 160) : '')
        )
      }
    }
    setBusy(false)
  }

  const topic = activeThread?.title || data?.problem
  return (
    <section id="chat-section" className="print:hidden glass p-3 md:p-5 min-h-[85vh] flex flex-col" aria-label={t.chatTitle}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h3 className="font-display text-xl text-ink dark:text-indigo-100">💬 {t.chatTitle}</h3>
        {topic && <span className="flex-1 min-w-0 overflow-x-auto no-scrollbar whitespace-nowrap text-sm text-slate-500"><Tex tex={topic} /></span>}
        <button className="btn-ghost text-sm lg:hidden" onClick={() => setShowList(!showList)} aria-expanded={showList}>☰ {t.threads}</button>
      </div>
      {!loggedIn && (
        <div className="mb-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm flex flex-wrap items-center gap-2">
          <span className="flex-1 min-w-48">🔒 {t.chatLogin}</span>
          <button className="btn !py-1 text-sm" onClick={() => onLogin('register')}>{t.reg}</button>
        </div>
      )}
      <div className="grid lg:grid-cols-[260px_1fr] gap-4 flex-1 min-h-0">
        <aside className={`${showList ? 'block' : 'hidden'} lg:block rounded-xl border border-slate-200 dark:border-slate-800 p-2 space-y-2 max-h-[65vh] overflow-y-auto`}>
          <button className="btn w-full text-sm" onClick={newChat}>＋ {t.newChat}</button>
          {loggedIn && threads.map((th) => (
            <div key={th.id} className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 ${th.id === activeId ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40' : 'border-slate-200 dark:border-slate-800'}`}>
              <button className="flex-1 min-w-0 text-left text-sm overflow-x-auto no-scrollbar whitespace-nowrap" onClick={() => { setActiveId(th.id); setShowList(false) }} title={th.title}>
                <Tex tex={th.title} />
              </button>
              <button className="text-xs text-rose-600" onClick={() => removeThread(th.id)} aria-label={t.delThread} title={t.delThread}>✕</button>
            </div>
          ))}
        </aside>

        <div className="flex flex-col min-h-[60vh]">
          <div ref={box} className="flex-1 overflow-y-auto max-h-[65vh] space-y-2 pr-1" aria-live="polite">
            {messages.length === 0 && <p className="text-sm text-slate-500 py-6 text-center">{t.chatEmpty}</p>}
            {messages.map((m) => (
              <div key={m.id} className={`max-w-[88%] rounded-2xl px-3 py-2 overflow-x-auto no-scrollbar ${m.role === 'user' ? 'ml-auto bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
                <p className="whitespace-pre-wrap"><Rich text={m.content} /></p>
                {m.role !== 'user' && (
                  <button className="mt-1 text-xs font-bold text-indigo-600 dark:text-indigo-300 underline" title={t.listenTitle} aria-label={t.listenTitle}
                    onClick={() => { unlockAudio(); speak(m.content) }}>🔊 {t.listenBtn}</button>
                )}
              </div>
            ))}
            {busy && <p className="text-sm text-slate-500">…</p>}
          </div>
          {messages.length === 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {t.chatChips.map((c) => <button key={c} className="btn-ghost text-sm" onClick={() => { unlockAudio(); send(c) }}>{c}</button>)}
            </div>
          )}
          {loggedIn && <p className="mt-2 text-xs text-slate-500">⚡ {t.chatCost.replace('{n}', user.chat_until_charge ?? 3)}</p>}
          {err && <p role="alert" className="text-rose-600 text-sm font-bold mt-2">{err}</p>}
          <div className="mt-3 flex gap-2">
            <button className="btn-ghost" aria-label={t.mic} title={t.mic} onClick={() => { unlockAudio(); listen((x) => send(x)) }}>🎤</button>
            <input value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder={t.ask} aria-label={t.ask}
              className="flex-1 min-w-0 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2" maxLength={2000} />
            <button className="btn" onClick={() => { unlockAudio(); send() }} disabled={busy || !val.trim()}>{t.send}</button>
          </div>
        </div>
      </div>
    </section>
  )
}
