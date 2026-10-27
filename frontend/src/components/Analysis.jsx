import { T } from '../lib/i18n'
import { Tex, Rich } from './Tex'

export function AnalysisCard({ lang, data }) {
  const t = T[lang]
  const { area, topic, method } = data.topic || {}
  return (
    <section className="glass p-5 md:p-6 space-y-4">
      <div className="text-2xl overflow-x-auto no-scrollbar"><Tex tex={data.problem} block /></div>
      <p className="inline-block rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-200 px-3 py-1 font-bold text-sm">
        {[area, topic, method].filter(Boolean).join(' • ')}
      </p>
      <div>
        <h3 className="font-bold mb-2">{t.prereq}</h3>
        <ul className="grid sm:grid-cols-2 gap-2">
          {data.prerequisites?.map((p, i) => (
            <li key={i} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
              <div className="text-sm text-slate-500 dark:text-slate-400"><Rich text={p.title} /></div>
              <div className="overflow-x-auto no-scrollbar mt-1"><Tex tex={p.latex} /></div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function ConceptCard({ lang, text }) {
  return (
    <section className="glass p-5 md:p-6">
      <h3 className="font-bold mb-2">💡 {T[lang].concept}</h3>
      <p className="leading-relaxed max-w-prose"><Rich text={text} /></p>
    </section>
  )
}

export function Variations({ lang, items = [] }) {
  return (
    <section className="glass p-5 md:p-6">
      <h3 className="font-bold mb-3">{T[lang].variations}</h3>
      <div className="grid sm:grid-cols-2 gap-3">
        {items.map((v, i) => (
          <article key={i} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
            <h4 className="font-bold"><Rich text={v.title} /></h4>
            <div className="my-1 overflow-x-auto no-scrollbar"><Tex tex={v.latex} /></div>
            <p className="text-sm text-slate-600 dark:text-slate-400"><Rich text={v.note} /></p>
          </article>
        ))}
      </div>
    </section>
  )
}
