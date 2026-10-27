import { useRef, useState } from 'react'
import { T } from '../lib/i18n'
import { fileToBase64 } from '../lib/api'
import MathKeypad from './MathKeypad'
import LiveMathField from './LiveMathField'

const CHIP_PROBLEMS = ['x^2 - 5x + 6 = 0', "f(x) = x^3 - 3x^2 + 2x, f'(x)", '\\frac{2}{3} + \\frac{3}{4}', '\\sin^2 x + \\cos^2 x']

export default function ProblemInput({ lang, text, setText, onSubmit, loading }) {
  const t = T[lang]
  const [img, setImg] = useState(null)
  const fileRef = useRef()
  const editorRef = useRef()

  const pick = async (e) => {
    const f = e.target.files?.[0]
    if (f) setImg({ name: f.name, mime: f.type, data: await fileToBase64(f) })
  }

  const insert = (snippet, back = 0) => {
    if (editorRef.current?.insert) {
      editorRef.current.insert(snippet, back)
      return
    }
    setText((prev) => prev + snippet)
  }

  const go = () => { if (!loading && (text.trim() || img)) onSubmit(img) }

  return (
    <section className="space-y-6 pb-2">
      <div className="space-y-4 pt-8 text-center md:pt-12">
        <span className="chip !px-4 !py-1.5 !text-sm">✨ {t.heroKicker}</span>
        <h1 className="font-display text-4xl font-extrabold leading-[1.05] text-ink md:text-6xl dark:text-white">
          {t.heroTitle1} <span className="gradient-text">{t.heroTitle2}</span>
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-slate-600 dark:text-slate-300">{t.heroSub}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {[t.heroP1, t.heroP2, t.heroP3, t.heroP4].map((p) => (
            <span key={p} className="rounded-full border border-slate-200/80 bg-white/70 px-3.5 py-1.5 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">{p}</span>
          ))}
        </div>
      </div>

      <div className="glass space-y-4 p-5 md:p-8">
        <MathKeypad lang={lang} onInsert={insert} />
        <div className="flex flex-col gap-3 md:flex-row">
          <LiveMathField
            editorRef={editorRef}
            value={text}
            onChange={setText}
            onSubmit={go}
            placeholder={t.ph}
            ariaLabel={t.ph}
          />
          <div className="flex gap-2 md:w-48 md:flex-col">
            <button className="btn flex-1 !py-3 text-base" disabled={loading || (!text.trim() && !img)} onClick={go}>{loading ? t.analyzing : t.solve}</button>
            <button className="btn-ghost" onClick={() => fileRef.current.click()}>📷 {img ? img.name.slice(0, 12) : t.upload}</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {t.chips.map((c, i) => (
            <button key={c} className="btn-ghost !px-3.5 !py-1.5 text-sm" onClick={() => setText(CHIP_PROBLEMS[i])}>{c}</button>
          ))}
          <span className="ml-auto text-xs text-slate-500">{t.sendHint}</span>
        </div>
      </div>
    </section>
  )
}
