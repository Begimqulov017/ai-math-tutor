import { useRef, useState } from 'react'
import { T } from '../lib/i18n'
import { checkSolution, fileToBase64 } from '../lib/api'
import { Rich } from './Tex'

const BADGE = { correct: ['✅', 'text-emerald-600'], partly: ['⚠️', 'text-amber-600'], wrong: ['❌', 'text-rose-600'] }

export default function Handwritten({ lang, problem }) {
  const t = T[lang]
  const ref = useRef()
  const [img, setImg] = useState(null)
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const pick = async (e) => {
    const f = e.target.files?.[0]
    if (f) { setImg({ name: f.name, mime: f.type, data: await fileToBase64(f) }); setRes(null); setErr('') }
  }
  const run = async () => {
    setBusy(true); setErr('')
    try { setRes(await checkSolution({ problem, image_base64: img.data, image_mime: img.mime, lang })) } catch (e) { setErr(t.err + ': ' + String(e.message).slice(0, 200)) }
    setBusy(false)
  }
  const [icon, color] = BADGE[res?.verdict] || ['ℹ️', 'text-slate-600']
  return (
    <section className="glass p-5 md:p-6 space-y-3">
      <h3 className="font-bold">✍️ {t.hw}</h3>
      <p className="text-sm text-slate-500">{t.hwHint}</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost" onClick={() => ref.current.click()}>📷 {img ? img.name.slice(0, 20) : t.upload}</button>
        <input ref={ref} type="file" accept="image/*" hidden onChange={pick} />
        <button className="btn" disabled={!img || busy} onClick={run}>{busy ? t.checking : t.check}</button>
      </div>
      {err && <p role="alert" className="text-rose-600 text-sm font-bold">{err}</p>}
      {res && (
        <div className="space-y-2">
          <p className={`font-bold ${color}`}>{icon} {t['v_' + res.verdict] || res.verdict}</p>
          <p><Rich text={res.summary} /></p>
          <ol className="space-y-1">
            {res.steps?.map((s, i) => (
              <li key={i} className={`rounded-lg px-3 py-2 text-sm ${s.ok ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-rose-50 dark:bg-rose-950/30'}`}>
                {s.ok ? '✅' : '❌'} <b><Rich text={s.line} /></b> — <Rich text={s.note} />
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}
