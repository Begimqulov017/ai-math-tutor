import katex from 'katex'
import 'katex/dist/katex.min.css'

const macros = { '\\hl': '\\textcolor{##F59E0B}{#1}' }

// several plain words (e.g. a word problem) = prose, not a formula
const isProse = (s) => {
  const bare = s.replace(/\\text\{[^}]*\}/g, '')
  return (bare.match(/(?<![\\A-Za-z])[A-Za-zА-Яа-яЁёЎўҚқҒғҲҳ'ʻ‘’]{3,}/g) || []).length >= 3
}

export function Tex({ tex = '', block = false }) {
  const str = String(tex ?? '')
  if (str.includes('$')) return <Rich text={str} />
  if (isProse(str)) return <span>{str}</span>
  let html
  try {
    html = katex.renderToString(str, { displayMode: block, throwOnError: false, macros })
  } catch {
    return <span>{str}</span>
  }
  return <span role="math" aria-label={str} dangerouslySetInnerHTML={{ __html: html }} />
}

// Text with inline $math$
export function Rich({ text = '' }) {
  return (
    <span>
      {String(text ?? '').split(/\$([^$]+)\$/g).map((p, i) => (i % 2 ? <Tex key={i} tex={p} /> : <span key={i}>{p}</span>))}
    </span>
  )
}
