import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { T } from '../lib/i18n'
import { chatApi } from '../lib/api'
import { Rich } from './Tex'

export default function Chat({ lang, context, voiceOn, speak, listen, msgs, setMsgs }) {
  const t = T[lang]
  const [open, setOpen] = useState(false)
  const [val, setVal] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef()
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, open])

  const send = async (text = val) => {
    if (!text.trim() || busy) return
    const history = msgs
    setMsgs((m) => [...m, { role: 'student', text }]); setVal(''); setBusy(true)
    try {
      const { reply } = await chatApi({ message: text, lang, history, context })
      setMsgs((m) => [...m, { role: 'tutor', text: reply }])
      if (voiceOn) speak(reply)
    } catch { setMsgs((m) => [...m, { role: 'tutor', text: t.err }]) }
    setBusy(false)
  }

  return (
    <>
      <button className="btn fixed bottom-5 right-5 z-40 !rounded-full !px-5 !py-3 shadow-lg" onClick={() => setOpen(!open)} aria-expanded={open}>💬 {t.chat}</button>
      <AnimatePresence>
        {open && (
          <motion.aside initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }}
            className="fixed z-40 bottom-20 right-3 left-3 sm:left-auto sm:w-96 h-[60vh] glass !bg-white dark:!bg-slate-900 shadow-2xl flex flex-col">
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {msgs.map((m, i) => (
                <p key={i} className={`max-w-[85%] rounded-2xl px-3 py-2 ${m.role === 'student' ? 'ml-auto bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}><Rich text={m.text} /></p>
              ))}
              {busy && <p className="text-sm text-slate-500">…</p>}
              <div ref={end} />
            </div>
            <div className="p-2 flex gap-2 border-t border-slate-200 dark:border-slate-800">
              <button className="btn-ghost" aria-label={t.mic} onClick={() => listen((x) => send(x))}>🎤</button>
              <input value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder={t.ask} aria-label={t.ask}
                className="flex-1 min-w-0 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3" />
              <button className="btn" onClick={() => send()} disabled={busy}>{t.send}</button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  )
}
