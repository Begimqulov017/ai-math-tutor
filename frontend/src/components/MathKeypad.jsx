import { T } from '../lib/i18n'
import { Tex } from './Tex'

// face = how the key looks (LaTeX rendered), ins = what is inserted visually into LiveMathField or input
export const KEYS = [
  { face: '\\sqrt{\\Box}', ins: '\\sqrt{}', back: 1, title: 'sqrt' },
  { face: '\\sqrt[n]{\\Box}', ins: '\\sqrt[]{}', back: 3, title: 'nth root' },
  { face: 'x^2', ins: '^2', title: 'square' },
  { face: 'x^n', ins: '^{}', back: 1, title: 'power' },
  { face: 'x_n', ins: '_{}', back: 1, title: 'index' },
  { face: '\\frac{a}{b}', ins: '\\frac{}{}', back: 3, title: 'fraction' },
  { face: '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}', ins: '\\begin{pmatrix}&\\\\&\\end{pmatrix}', back: 14, title: 'matrix' },
  { face: '(\\,)', ins: '()', back: 1, title: 'brackets' },
  { face: '|x|', ins: '||', back: 1, title: 'absolute value' },
  { face: '\\pi', ins: '\\pi ', title: 'pi' },
  { face: '\\infty', ins: '\\infty ', title: 'infinity' },
  { face: '\\theta', ins: '\\theta ', title: 'theta' },
  { face: '\\alpha', ins: '\\alpha ', title: 'alpha' },
  { face: '\\beta', ins: '\\beta ', title: 'beta' },
  { face: '>', ins: ' > ', title: 'greater than' },
  { face: '<', ins: ' < ', title: 'less than' },
  { face: '\\ge', ins: ' \\ge ', title: 'greater or equal' },
  { face: '\\le', ins: ' \\le ', title: 'less or equal' },
  { face: '\\ne', ins: ' \\ne ', title: 'not equal' },
  { face: '\\approx', ins: ' \\approx ', title: 'approximately' },
  { face: '\\pm', ins: '\\pm ', title: 'plus-minus' },
  { face: '\\cdot', ins: ' \\cdot ', title: 'multiply' },
  { face: '\\div', ins: ' \\div ', title: 'divide' },
  { face: '\\sin', ins: '\\sin()', back: 1, title: 'sin' },
  { face: '\\cos', ins: '\\cos()', back: 1, title: 'cos' },
  { face: '\\tan', ins: '\\tan()', back: 1, title: 'tan' },
  { face: '\\log', ins: '\\log()', back: 1, title: 'log' },
  { face: '\\ln', ins: '\\ln()', back: 1, title: 'ln' },
  { face: '\\angle', ins: '\\angle ', title: 'angle' },
  { face: '\\triangle', ins: '\\triangle ', title: 'triangle' },
  { face: '^\\circ', ins: '^\\circ ', title: 'degree' },
  { face: '\\int', ins: '\\int ', title: 'integral' },
]

export default function MathKeypad({ lang, onInsert, compact = false }) {
  const t = T[lang]
  return (
    <div role="group" aria-label={t.kpTitle} className={`print:hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 ${compact ? 'p-1.5' : 'p-2'}`}>
      <div className="mb-1 text-xs font-bold text-slate-500">⌨ {t.kpTitle}</div>
      <div className="flex flex-wrap gap-1.5">
        {KEYS.map((k) => (
          <button key={k.title} type="button" title={k.title} aria-label={k.title}
            onMouseDown={(e) => e.preventDefault() /* keep cursor/selection */}
            onClick={() => onInsert(k.ins, k.back || 0)}
            className={`${compact ? 'min-w-8 h-8 px-1.5 text-xs' : 'min-w-10 h-10 px-2'} grid place-items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950 hover:border-indigo-400 active:scale-95 transition focus-visible:outline-2 focus-visible:outline-indigo-400`}>
            <span className={k.title === 'matrix' ? 'scale-75' : ''}><Tex tex={k.face} /></span>
          </button>
        ))}
      </div>
    </div>
  )
}
