import { useRef, useState } from 'react'
import { T } from '../lib/i18n'
import { fileToBase64 } from '../lib/api'
import MathKeypad from './MathKeypad'
import { Tex } from './Tex'

const CHIP_PROBLEMS = ['x^2 - 5x + 6 = 0', "f(x) = x^3 - 3x^2 + 2x, f'(x)", '\\frac{2}{3} + \\frac{3}{4}', '\\sin^2 x + \\cos^2 x']

export default function ProblemInput({ lang, text, setText, onSubmit, loading }) {
  const t = T[lang]
  const [img, setImg] = useState(null)
  const fileRef = useRef()
  const areaRef = useRef()

  const pick = async (e) => {
    const f = e.target.files?.[0]
    if (f) setImg({ name: f.name, mime: f.type, data: await fileToBase64(f) })
  }

  // insert at the cursor; selected text is wrapped:  [x+1] + sqrt  ->  \sqrt{x+1}
  const insert = (snippet, back = 0) => {
    const el = areaRef.current
    const start = el ? el.selectionStart : text.length
    const end = el ? el.selectionEnd : text.length
    const sel = text.slice(start, end)
    let ins = snippet
    let caret = snippet.length - back
    if (sel && /\{\}|\(\)/.test(snippet)) {
      ins = snippet.replace(/\{\}|\(\)/, (m) => m[0] + sel + m[1])
      caret = ins.length
    }
    setText(text.slice(0, start) + ins + text.slice(end))
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      el.setSelectionRange(start + caret, start + caret)
    })
  }

  const go = () => { if (!loading && (text.trim() || img)) onSubmit(img) }

  return (
    <section className="glass p-5 md:p-8 mt-6">
      <h2 className="font-display text-2xl md:text-4xl text-ink dark:text-indigo-100 max-w-2xl">{t.hero}</h2>
      <div className="mt-5 space-y-3">
        <MathKeypad lang={lang} onInsert={insert} />
        <div className="flex flex-col md:flex-row gap-3">
          <textarea ref={areaRef} value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder={t.ph} aria-label={t.ph}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go() } }}
            className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-lg font-mono focus-visible:outline-2 focus-visible:outline-indigo-400" />
          <div className="flex gap-2 md:flex-col md:w-44">
            <button className="btn flex-1" disabled={loading || (!text.trim() && !img)} onClick={go}>{loading ? t.analyzing : t.solve}</button>
            <button className="btn-ghost" onClick={() => fileRef.current.click()}>📷 {img ? img.name.slice(0, 12) : t.upload}</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
          </div>
        </div>
        {text.trim() && (
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2 overflow-x-auto" aria-live="polite">
            <span className="text-xs text-slate-500 mr-2">{t.preview}</span>
            <Tex tex={text} />
          </div>
        )}
        <div className="text-xs text-slate-500">{t.sendHint}</div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {t.chips.map((c, i) => (
          <button key={c} className="btn-ghost text-sm" onClick={() => setText(CHIP_PROBLEMS[i])}>{c}</button>
        ))}
      </div>
    </section>
  )
}
