import { useEffect, useRef, useState } from 'react'
import { T } from '../lib/i18n'
import { practiceCheck } from '../lib/api'
import { Tex, Rich } from './Tex'
import { LiveMathField } from './ProblemInput'

const LEVELS = [['easy', '🟢', 15], ['medium', '🟡', 30], ['hard', '🔴', 50]]
const MINI_KEYS = [
  { face: '\\sqrt{x}', ins: '\\sqrt{}', title: 'sqrt' },
  { face: '\\sqrt[n]{x}', ins: '\\sqrt[]{}', title: 'nth root' },
  { face: 'x^2', ins: '^2', title: 'square' },
  { face: 'x^n', ins: '^{}', title: 'power' },
  { face: '\\frac{a}{b}', ins: '\\frac{}{}', title: 'fraction' },
  { face: '\\pi', ins: '\\pi ', title: 'pi' },
  { face: '\\pm', ins: '\\pm ', title: 'plus-minus' },
  { face: '^\\circ', ins: '^\\circ ', title: 'degree' },
]

export default function Practice({ lang, practice = {}, dataKey, voiceOn, speak, onResult }) {
  const t = T[lang]
  const [level, setLevel] = useState('easy')
  const [idx, setIdx] = useState(0)
  const [val, setVal] = useState('')
  const [res, setRes] = useState(null)
  const [fb, setFb] = useState('')
  const [hint, setHint] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [gain, setGain] = useState(0)
  const scored = useRef(new Set())
  const mathRef = useRef()
  const list = practice[level] || []
  const i = list.length ? idx % list.length : 0
  const q = list[i]

  useEffect(() => { scored.current = new Set() }, [dataKey])
  const reset = () => { setVal(''); setRes(null); setFb(''); setHint(false); setMsg(''); setGain(0) }

  const check = async () => {
    if (!q || !val.trim() || busy || !dataKey) return
    setBusy(true); setMsg('')
    try {
      const r = await practiceCheck({ key: dataKey, level, index: i, answer: val, lang })
      setRes(r.correct); setFb(r.feedback || ''); setGain(r.xp_gained || 0)
      const k = `${level}:${i}`
      const firstWrong = !r.correct && !scored.current.has(k)
      scored.current.add(k)
      onResult?.({ ok: r.correct, level, index: i, q: q.q, userAnswer: val, user: r.user, xpGained: r.xp_gained, firstWrong })
      if (voiceOn) speak(r.correct ? t.ok : t.no)
    } catch (e) { setMsg(e.status === 0 ? t.net : e.status === 410 ? t.expired : e.status === 429 ? t.busy : t.err) }
    setBusy(false)
  }

  return (
    <section className="glass p-5 md:p-6">
      <h3 className="font-bold mb-3">{t.practice}</h3>
      <div className="grid grid-cols-3 gap-2">
        {LEVELS.map(([k, e, xp]) => (
          <button key={k} aria-pressed={level === k} onClick={() => { setLevel(k); setIdx(0); reset() }}
            className={`rounded-xl border p-3 font-bold ${level === k ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50' : 'border-slate-200 dark:border-slate-800'}`}>
            {e} {t[k]} <span className="block text-xs font-normal text-slate-500">+{xp} XP</span>
          </button>
        ))}
      </div>
      {!dataKey && <p className="mt-3 text-sm text-amber-600">{t.expired}</p>}
      {q ? (
        <div className="mt-4 space-y-3">
          <div className="text-xl overflow-x-auto no-scrollbar"><Tex tex={q.q} block /></div>

          {/* Compact Visual Math Helper Toolbar */}
          <div className="flex flex-wrap gap-1">
            {MINI_KEYS.map((k) => (
              <button key={k.title} type="button" title={k.title}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => mathRef.current?.insert ? mathRef.current.insert(k.ins) : setVal((v) => v + k.ins)}
                className="h-8 min-w-8 rounded-lg border border-slate-200 bg-white/80 px-2 text-xs hover:border-indigo-400 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800">
                <Tex tex={k.face} />
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-48">
              <LiveMathField
                editorRef={mathRef}
                value={val}
                onChange={setVal}
                onSubmit={check}
                placeholder={t.answer}
                ariaLabel={t.answer}
              />
            </div>
            <button className="btn" onClick={check} disabled={busy || !dataKey}>{busy ? '…' : t.check}</button>
            <button className="btn-ghost" onClick={() => { setHint(true); if (voiceOn) speak(q.hint) }}>💡 {t.hint}</button>
          </div>
          {hint && <p className="rounded-lg bg-amber-50 dark:bg-amber-950/40 p-3 text-sm"><Rich text={q.hint} /></p>}
          {msg && <p role="alert" className="text-rose-600 text-sm font-bold">{msg}</p>}
          {res !== null && (
            <p role="status" className={`font-bold ${res ? 'text-emerald-600' : 'text-rose-600'}`}>
              {res ? t.ok : t.no} {gain > 0 && <span className="text-amber-600">+{gain} XP ⭐</span>} {fb && <span className="font-normal text-slate-700 dark:text-slate-300"><Rich text={fb} /></span>}
            </p>
          )}
          {list.length > 1 && <button className="btn-ghost text-sm" onClick={() => { setIdx(idx + 1); reset() }}>→</button>}
        </div>
      ) : null}
    </section>
  )
}
