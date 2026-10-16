import { useRef, useState } from 'react'
import { T } from '../lib/i18n'
import { fileToBase64 } from '../lib/api'

const CHIP_PROBLEMS = ['x^2 - 5x + 6 = 0', "f(x) = x^3 - 3x^2 + 2x, f'(x)", '\\frac{2}{3} + \\frac{3}{4}', '\\sin^2 x + \\cos^2 x']

export default function ProblemInput({ lang, text, setText, onSubmit, loading }) {
  const t = T[lang]
  const [img, setImg] = useState(null)
  const fileRef = useRef()
  const pick = async (e) => {
    const f = e.target.files?.[0]
    if (f) setImg({ name: f.name, mime: f.type, data: await fileToBase64(f) })
  }
  return (
    <section className="glass p-5 md:p-8 mt-6">
      <h2 className="font-display text-2xl md:text-4xl text-ink dark:text-indigo-100 max-w-2xl">{t.hero}</h2>
      <div className="mt-5 flex flex-col md:flex-row gap-3">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={t.ph} aria-label={t.ph}
          className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-lg focus-visible:outline-2 focus-visible:outline-indigo-400" />
        <div className="flex gap-2 md:flex-col">
          <button className="btn flex-1" disabled={loading || (!text && !img)} onClick={() => onSubmit(img)}>{loading ? t.analyzing : t.solve}</button>
          <button className="btn-ghost" onClick={() => fileRef.current.click()}>📷 {img ? img.name.slice(0, 12) : t.upload}</button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {t.chips.map((c, i) => (
          <button key={c} className="btn-ghost text-sm" onClick={() => setText(CHIP_PROBLEMS[i])}>{c}</button>
        ))}
      </div>
    </section>
  )
}
