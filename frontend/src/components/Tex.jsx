import katex from 'katex'
import 'katex/dist/katex.min.css'

const macros = { '\\hl': '\\textcolor{##F59E0B}{#1}' }

// Explicit LaTeX commands or environments should NEVER be classified as plain prose
const HAS_LATEX_CMD = /\\(begin|end|frac|dfrac|tfrac|sqrt|sin|cos|tan|cot|tg|ctg|log|ln|det|int|sum|prod|lim|pi|infty|theta|alpha|beta|gamma|delta|pm|mp|cdot|times|div|le|leq|ge|geq|ne|neq|approx|angle|triangle|circ|hl|textcolor|left|right|pmatrix|bmatrix|vmatrix|matrix|cases)\b|\^\{|_\{|[A-Za-z0-9]\^[0-9a-zA-Z]|[A-Za-z]_[0-9a-zA-Z]/

// Even a single plain word (4+ letters like "Salom", "kvadrat") without LaTeX commands is conversational prose, not math
const isProse = (s) => {
  if (HAS_LATEX_CMD.test(s)) return false
  const bare = s
    .replace(/\\text\{[^}]*\}/g, '')
    .replace(/\\(begin|end)\{[^}]*\}/g, '')
    .replace(/\\[a-zA-Z]+/g, '')
  const words4 = bare.match(/(?<![\\A-Za-z])[A-Za-zА-Яа-яЁёЎўҚқҒғҲҳ'ʻ‘’]{4,}/g) || []
  const words3 = bare.match(/(?<![\\A-Za-z])[A-Za-zА-Яа-яЁёЎўҚқҒғҲҳ'ʻ‘’]{3,}/g) || []
  // If there is no math operator (=, +, -, ^, _, \) and at least 1 word of 3+ letters (e.g., "Salom"), treat as prose
  if (!/[=+\-*/^_\\<>]/.test(bare) && words3.length >= 1) return true
  // If there is at least 1 word of 4+ letters alongside text (e.g. "x+1=2 tenglamasini yeching"), treat as prose
  if (words4.length >= 1) return true
  return words3.length >= 2
}

// Convert mixed text + bare LaTeX into segments so formulas inside sentences still render visually
const BARE_MATH_RE = /(\\(?:begin\{(?:pmatrix|bmatrix|vmatrix|matrix|cases)\}[\s\S]*?\\end\{(?:pmatrix|bmatrix|vmatrix|matrix|cases)\}|(?:d|t)?frac\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|sqrt(?:\[[^\]]*\])?\{[^{}]*\}|[a-zA-Z]+\b)(?:\s*[\^_](?:\{[^{}]*\}|[0-9a-zA-Z]))?|[A-Za-z0-9)\]]+(?:\s*[\^_](?:\{[^{}]*\}|[0-9a-zA-Z]))+)/g

export function Tex({ tex = '', block = false, className = '' }) {
  const str = String(tex ?? '').trim()
  if (!str) return null
  if (str.includes('$')) return <Rich text={str} className={className} />
  if (isProse(str)) {
    if (HAS_LATEX_CMD.test(str)) return <Rich text={str} className={className} />
    return <span className={className}>{str}</span>
  }
  let html
  try {
    html = katex.renderToString(str, { displayMode: block, throwOnError: false, strict: false, macros })
  } catch {
    return <span className={className}>{str}</span>
  }
  return (
    <span
      role="math"
      aria-label={str}
      className={`katex-wrap ${block ? 'katex-block' : 'katex-inline'} ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

// Render a piece of text that has no $...$ delimiters, auto-detecting any embedded bare LaTeX
function renderBareSegment(seg, keyPrefix) {
  if (!seg) return null
  if (!HAS_LATEX_CMD.test(seg)) return <span key={keyPrefix}>{seg}</span>
  if (!isProse(seg)) return <Tex key={keyPrefix} tex={seg} />
  const out = []
  let last = 0
  let m
  BARE_MATH_RE.lastIndex = 0
  while ((m = BARE_MATH_RE.exec(seg)) !== null) {
    if (m.index > last) out.push(<span key={`${keyPrefix}-t-${last}`}>{seg.slice(last, m.index)}</span>)
    out.push(<Tex key={`${keyPrefix}-m-${m.index}`} tex={m[0]} />)
    last = m.index + m[0].length
  }
  if (last < seg.length) out.push(<span key={`${keyPrefix}-t-${last}`}>{seg.slice(last)}</span>)
  return out.length ? out : <span key={keyPrefix}>{seg}</span>
}

// Text with inline $math$, display $$math$$, \[math\], \(math\), or bare LaTeX expressions
export function Rich({ text = '', className = '' }) {
  const raw = String(text ?? '')
  if (!raw) return null
  const norm = raw
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `$$${m}$$`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m}$`)

  const blocks = norm.split(/\$\$([\s\S]+?)\$\$/g)
  return (
    <span className={className}>
      {blocks.map((b, bi) => {
        if (bi % 2 === 1) return <Tex key={`b-${bi}`} tex={b} block />
        return b.split(/\$([^$]+)\$/g).map((p, pi) =>
          pi % 2 === 1 ? <Tex key={`i-${bi}-${pi}`} tex={p} /> : renderBareSegment(p, `s-${bi}-${pi}`)
        )
      })}
    </span>
  )
}
