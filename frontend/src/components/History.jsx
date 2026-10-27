import { AnimatePresence, motion } from 'framer-motion'
import { T } from '../lib/i18n'
import { Tex } from './Tex'

export default function History({ lang, open, onClose, items, activeId, onOpen, onDelete, onClear, onNew }) {
  const t = T[lang]
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside initial={{ x: -320 }} animate={{ x: 0 }} exit={{ x: -320 }} transition={{ type: 'tween', duration: 0.25 }}
            className="fixed z-50 left-0 top-0 h-full w-80 max-w-[90vw] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col" aria-label={t.hist}>
            <div className="flex items-center gap-2 p-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-display text-lg mr-auto">🕘 {t.hist}</h2>
              <button className="btn-ghost" onClick={onClose} aria-label={t.close}>✕</button>
            </div>
            <div className="p-3"><button className="btn w-full" onClick={onNew}>＋ {t.newq}</button></div>
            <ul className="flex-1 overflow-y-auto px-3 space-y-2">
              {items.length === 0 && <li className="text-sm text-slate-500 p-2">{t.histEmpty}</li>}
              {items.map((i) => (
                <li key={i.id} className={`rounded-xl border p-3 ${i.id === activeId ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40' : 'border-slate-200 dark:border-slate-800'}`}>
                  <button className="w-full text-left" onClick={() => onOpen(i)}>
                    <div className="overflow-x-auto no-scrollbar"><Tex tex={i.data?.problem || i.text} /></div>
                    <div className="text-xs text-slate-500 mt-1">
                      {[i.data?.topic?.topic, new Date(i.ts).toLocaleString()].filter(Boolean).join(' • ')}
                      {i.chat?.length ? ` • 💬 ${i.chat.length}` : ''}
                    </div>
                  </button>
                  <button className="text-xs text-rose-600 underline mt-1" onClick={() => onDelete(i.id)}>{t.del}</button>
                </li>
              ))}
            </ul>
            {items.length > 0 && <div className="p-3"><button className="btn-ghost w-full text-sm" onClick={onClear}>{t.clearAll}</button></div>}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
