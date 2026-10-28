import { useEffect, useId, useRef, useState } from 'react'
import { T } from '../lib/i18n'
import { fileToBase64 } from '../lib/api'
import MathKeypad from './MathKeypad'

// ---------------------------------------------------------------------------
// Visual AST <-> LaTeX Parser & Serializer (Self-contained inside ProblemInput.jsx
// so no extra file imports can ever fail during git push / Vercel build)
// ---------------------------------------------------------------------------

const SYMBOLS = {
  '\\pi': 'π',
  '\\infty': '∞',
  '\\theta': 'θ',
  '\\alpha': 'α',
  '\\beta': 'β',
  '\\gamma': 'γ',
  '\\delta': 'δ',
  '\\ge': '≥',
  '\\geq': '≥',
  '\\le': '≤',
  '\\leq': '≤',
  '\\ne': '≠',
  '\\neq': '≠',
  '\\approx': '≈',
  '\\pm': '±',
  '\\cdot': '·',
  '\\times': '×',
  '\\div': '÷',
  '\\angle': '∠',
  '\\triangle': '△',
  '^\\circ': '°',
  '\\circ': '°',
  '\\int': '∫',
  '\\sum': '∑',
  '\\sin': 'sin',
  '\\cos': 'cos',
  '\\tan': 'tan',
  '\\cot': 'cot',
  '\\log': 'log',
  '\\ln': 'ln',
  '\\det': 'det',
}

function readGroup(s, i) {
  while (i < s.length && s[i] === ' ') i++
  if (i >= s.length) return ['', i]
  if (s[i] !== '{') return [s[i], i + 1]
  let depth = 0
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') depth++
    else if (s[j] === '}') {
      depth--
      if (depth === 0) return [s.slice(i + 1, j), j + 1]
    }
  }
  return [s.slice(i + 1), s.length]
}

function readBracket(s, i) {
  while (i < s.length && s[i] === ' ') i++
  if (i >= s.length || s[i] !== '[') return [null, i]
  let depth = 0
  for (let j = i; j < s.length; j++) {
    if (s[j] === '[') depth++
    else if (s[j] === ']') {
      depth--
      if (depth === 0) return [s.slice(i + 1, j), j + 1]
    }
  }
  return [s.slice(i + 1), s.length]
}

export function parseLatexToAst(str) {
  const s = String(str ?? '')
  const nodes = []
  let i = 0
  while (i < s.length) {
    if (s.startsWith('\\begin{pmatrix}', i) || s.startsWith('\\begin{bmatrix}', i)) {
      const isB = s.startsWith('\\begin{bmatrix}', i)
      const endTag = isB ? '\\end{bmatrix}' : '\\end{pmatrix}'
      const startIdx = i + 15
      const endIdx = s.indexOf(endTag, startIdx)
      if (endIdx !== -1) {
        const inner = s.slice(startIdx, endIdx)
        const rows = inner.split(/\\\\/).map((r) => r.split('&').map((c) => parseLatexToAst(c.trim())))
        const cells = [
          rows[0]?.[0] || [],
          rows[0]?.[1] || [],
          rows[1]?.[0] || [],
          rows[1]?.[1] || [],
        ]
        nodes.push({ type: 'matrix', cells })
        i = endIdx + endTag.length
        continue
      }
    }
    if (s.startsWith('^\\circ', i)) {
      nodes.push({ type: 'sym', latex: '^\\circ', display: '°' })
      i += 6
      continue
    }
    if (s[i] === '\\') {
      const m = s.slice(i).match(/^\\([a-zA-Z]+)/)
      if (m) {
        const cmd = '\\' + m[1]
        const nextIdx = i + m[0].length
        if (cmd === '\\frac' || cmd === '\\dfrac' || cmd === '\\tfrac') {
          const [numStr, i1] = readGroup(s, nextIdx)
          const [denStr, i2] = readGroup(s, i1)
          nodes.push({ type: 'frac', num: parseLatexToAst(numStr), den: parseLatexToAst(denStr) })
          i = i2
          continue
        }
        if (cmd === '\\sqrt') {
          const [degStr, i1] = readBracket(s, nextIdx)
          const [bodyStr, i2] = readGroup(s, i1)
          if (degStr !== null) {
            nodes.push({ type: 'nroot', deg: parseLatexToAst(degStr), body: parseLatexToAst(bodyStr) })
          } else {
            nodes.push({ type: 'sqrt', body: parseLatexToAst(bodyStr) })
          }
          i = i2
          continue
        }
        if (cmd === '\\text') {
          const [txt, i1] = readGroup(s, nextIdx)
          for (const ch of txt) nodes.push({ type: 'char', val: ch })
          i = i1
          continue
        }
        if (SYMBOLS[cmd]) {
          const after = s[nextIdx] === ' ' ? nextIdx + 1 : nextIdx
          nodes.push({ type: 'sym', latex: cmd, display: SYMBOLS[cmd] })
          i = after
          continue
        }
      }
      if (s[i + 1] === ',' || s[i + 1] === ';' || s[i + 1] === ' ') {
        nodes.push({ type: 'char', val: ' ' })
        i += 2
        continue
      }
    }
    if (s[i] === '^') {
      if (s[i + 1] === '\\' && s.slice(i + 1).startsWith('\\circ')) {
        nodes.push({ type: 'sym', latex: '^\\circ', display: '°' })
        i += 6
        continue
      }
      const [expStr, i1] = readGroup(s, i + 1)
      nodes.push({ type: 'sup', exp: parseLatexToAst(expStr) })
      i = i1
      continue
    }
    if (s[i] === '_') {
      const [subStr, i1] = readGroup(s, i + 1)
      nodes.push({ type: 'sub', sub: parseLatexToAst(subStr) })
      i = i1
      continue
    }
    nodes.push({ type: 'char', val: s[i] })
    i++
  }
  return nodes
}

export function serializeAstToLatex(nodes) {
  let out = ''
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    if (n.type === 'char') {
      out += n.val
    } else if (n.type === 'sym') {
      const next = nodes[i + 1]
      const needsSpace = /^\\[a-zA-Z]+$/.test(n.latex) && next && next.type === 'char' && /[a-zA-Z0-9]/.test(next.val)
      out += n.latex + (needsSpace ? ' ' : '')
    } else if (n.type === 'frac') {
      out += `\\frac{${serializeAstToLatex(n.num)}}{${serializeAstToLatex(n.den)}}`
    } else if (n.type === 'sqrt') {
      out += `\\sqrt{${serializeAstToLatex(n.body)}}`
    } else if (n.type === 'nroot') {
      out += `\\sqrt[${serializeAstToLatex(n.deg)}]{${serializeAstToLatex(n.body)}}`
    } else if (n.type === 'sup') {
      const inner = serializeAstToLatex(n.exp)
      out += inner.length === 1 && /[0-9a-zA-Z]/.test(inner) ? `^${inner}` : `^{${inner}}`
    } else if (n.type === 'sub') {
      const inner = serializeAstToLatex(n.sub)
      out += inner.length === 1 && /[0-9a-zA-Z]/.test(inner) ? `_${inner}` : `_{${inner}}`
    } else if (n.type === 'matrix') {
      const c = n.cells.map((cell) => serializeAstToLatex(cell) || '0')
      out += `\\begin{pmatrix}${c[0]}&${c[1]}\\\\${c[2]}&${c[3]}\\end{pmatrix}`
    }
  }
  return out
}

function groupSegments(nodes) {
  const items = []
  let textBuf = ''
  let startIdx = 0

  const flushText = (endIdx) => {
    if (textBuf.length > 0 || items.length === 0) {
      items.push({
        kind: 'text',
        val: textBuf,
        sIdx: startIdx,
        eIdx: endIdx,
      })
      textBuf = ''
    }
  }

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    if (n.type === 'char') {
      if (textBuf === '') startIdx = i
      textBuf += n.val
    } else if (n.type === 'sym') {
      if (textBuf === '') startIdx = i
      textBuf += n.display
    } else {
      flushText(i)
      items.push({ kind: 'node', node: n, idx: i })
      startIdx = i + 1
    }
  }
  flushText(nodes.length)
  return items
}

function textToAstNodes(str) {
  const revSym = {
    'π': '\\pi',
    '∞': '\\infty',
    'θ': '\\theta',
    'α': '\\alpha',
    'β': '\\beta',
    '≥': '\\ge',
    '≤': '\\le',
    '≠': '\\ne',
    '≈': '\\approx',
    '±': '\\pm',
    '·': '\\cdot',
    '×': '\\cdot',
    '÷': '\\div',
    '∠': '\\angle',
    '△': '\\triangle',
    '°': '^\\circ',
    '∫': '\\int',
    '∑': '\\sum',
  }
  const out = []
  for (const ch of str) {
    if (revSym[ch]) out.push({ type: 'sym', latex: revSym[ch], display: ch })
    else out.push({ type: 'char', val: ch })
  }
  return out
}

function AutoSizeInput({ value, placeholder, minW, onChangeText, onBackspaceEmpty, onFocus, onSubmit }) {
  const ref = useRef(null)
  const widthCh = Math.max((value || placeholder || '').length + 1, 1)

  return (
    <input
      ref={ref}
      type="text"
      value={value}
      placeholder={placeholder}
      style={{ width: `${widthCh}ch` }}
      onFocus={() => onFocus?.({ el: ref.current })}
      onChange={(e) => onChangeText(e.target.value, e.target.selectionStart)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || !e.shiftKey)) {
          e.preventDefault()
          onSubmit?.()
          return
        }
        if (e.key === 'Backspace' && value === '') {
          e.preventDefault()
          onBackspaceEmpty?.()
        }
      }}
      className={`${minW} max-w-full bg-transparent px-0.5 py-0.5 font-sans text-lg font-medium text-slate-900 outline-none placeholder:text-slate-400 dark:text-white`}
    />
  )
}

function SlotEditor({ nodes, onChange, onRemoveOut, onSubmit, placeholder = '□', className = '', minW = 'min-w-[1.6rem]', registerActive }) {
  const segments = groupSegments(nodes)

  const replaceRange = (sIdx, eIdx, newSubNodes) => {
    const next = [...nodes.slice(0, sIdx), ...newSubNodes, ...nodes.slice(eIdx)]
    onChange(next)
  }

  const updateNodeAt = (idx, newNode) => {
    if (!newNode) {
      onChange([...nodes.slice(0, idx), ...nodes.slice(idx + 1)])
    } else {
      const next = [...nodes]
      next[idx] = newNode
      onChange(next)
    }
  }

  return (
    <span className={`inline-flex flex-wrap items-center gap-0.5 align-middle ${className}`}>
      {segments.map((seg, si) => {
        if (seg.kind === 'text') {
          const isOnlyEmpty = segments.length === 1 && seg.val === ''
          return (
            <AutoSizeInput
              key={`txt-${si}-${seg.sIdx}`}
              value={seg.val}
              placeholder={isOnlyEmpty ? placeholder : ''}
              minW={isOnlyEmpty ? minW : 'min-w-[0.4rem]'}
              onFocus={() => registerActive?.({
                insertNode: (astNodes, caretPos) => {
                  const pos = caretPos ?? seg.val.length
                  const before = textToAstNodes(seg.val.slice(0, pos))
                  const after = textToAstNodes(seg.val.slice(pos))
                  replaceRange(seg.sIdx, seg.eIdx, [...before, ...astNodes, ...after])
                },
              })}
              onChangeText={(newVal) => {
                if (newVal.endsWith('^2')) {
                  const prefix = newVal.slice(0, -2)
                  replaceRange(seg.sIdx, seg.eIdx, [...textToAstNodes(prefix), { type: 'sup', exp: [{ type: 'char', val: '2' }] }])
                  return
                }
                if (newVal.endsWith('^3')) {
                  const prefix = newVal.slice(0, -2)
                  replaceRange(seg.sIdx, seg.eIdx, [...textToAstNodes(prefix), { type: 'sup', exp: [{ type: 'char', val: '3' }] }])
                  return
                }
                if (newVal.endsWith('^')) {
                  const prefix = newVal.slice(0, -1)
                  replaceRange(seg.sIdx, seg.eIdx, [...textToAstNodes(prefix), { type: 'sup', exp: [] }])
                  return
                }
                if (newVal.endsWith('_')) {
                  const prefix = newVal.slice(0, -1)
                  replaceRange(seg.sIdx, seg.eIdx, [...textToAstNodes(prefix), { type: 'sub', sub: [] }])
                  return
                }
                replaceRange(seg.sIdx, seg.eIdx, textToAstNodes(newVal))
              }}
              onBackspaceEmpty={() => {
                if (seg.sIdx > 0) {
                  updateNodeAt(seg.sIdx - 1, null)
                } else if (nodes.length === 0 && onRemoveOut) {
                  onRemoveOut()
                }
              }}
              onSubmit={onSubmit}
            />
          )
        }

        const n = seg.node
        const idx = seg.idx

        if (n.type === 'frac') {
          return (
            <span key={`frac-${idx}`} className="mx-1 inline-flex flex-col items-center justify-center align-middle rounded-lg bg-indigo-50/50 px-1.5 py-0.5 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/50">
              <span className="border-b-2 border-slate-700 dark:border-slate-200 px-1 pb-0.5 text-center leading-tight">
                <SlotEditor
                  nodes={n.num}
                  placeholder="a"
                  onChange={(num) => updateNodeAt(idx, { ...n, num })}
                  onRemoveOut={() => updateNodeAt(idx, null)}
                  onSubmit={onSubmit}
                  registerActive={registerActive}
                />
              </span>
              <span className="px-1 pt-0.5 text-center leading-tight">
                <SlotEditor
                  nodes={n.den}
                  placeholder="b"
                  onChange={(den) => updateNodeAt(idx, { ...n, den })}
                  onRemoveOut={() => updateNodeAt(idx, null)}
                  onSubmit={onSubmit}
                  registerActive={registerActive}
                />
              </span>
            </span>
          )
        }

        if (n.type === 'sqrt') {
          return (
            <span key={`sqrt-${idx}`} className="mx-0.5 inline-flex items-center align-middle rounded-lg bg-indigo-50/40 px-1 py-0.5 dark:bg-indigo-950/30">
              <span className="select-none font-serif text-xl font-bold leading-none text-indigo-700 dark:text-indigo-300">√</span>
              <span className="border-t-2 border-indigo-700 dark:border-indigo-300 px-1 pt-0.5">
                <SlotEditor
                  nodes={n.body}
                  placeholder="x"
                  onChange={(body) => updateNodeAt(idx, { ...n, body })}
                  onRemoveOut={() => updateNodeAt(idx, null)}
                  onSubmit={onSubmit}
                  registerActive={registerActive}
                />
              </span>
            </span>
          )
        }

        if (n.type === 'nroot') {
          return (
            <span key={`nroot-${idx}`} className="mx-0.5 inline-flex items-center align-middle rounded-lg bg-indigo-50/40 px-1 py-0.5 dark:bg-indigo-950/30">
              <sup className="-mr-1 -mt-2 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                <SlotEditor
                  nodes={n.deg}
                  placeholder="n"
                  minW="min-w-[0.9rem]"
                  onChange={(deg) => updateNodeAt(idx, { ...n, deg })}
                  onRemoveOut={() => updateNodeAt(idx, null)}
                  onSubmit={onSubmit}
                  registerActive={registerActive}
                />
              </sup>
              <span className="select-none font-serif text-xl font-bold leading-none text-indigo-700 dark:text-indigo-300">√</span>
              <span className="border-t-2 border-indigo-700 dark:border-indigo-300 px-1 pt-0.5">
                <SlotEditor
                  nodes={n.body}
                  placeholder="x"
                  onChange={(body) => updateNodeAt(idx, { ...n, body })}
                  onRemoveOut={() => updateNodeAt(idx, null)}
                  onSubmit={onSubmit}
                  registerActive={registerActive}
                />
              </span>
            </span>
          )
        }

        if (n.type === 'sup') {
          return (
            <sup key={`sup-${idx}`} className="relative -top-2.5 ml-0.5 inline-flex items-center rounded bg-indigo-100/70 px-1 py-0 text-xs font-bold text-indigo-900 dark:bg-indigo-900/60 dark:text-indigo-100">
              <SlotEditor
                nodes={n.exp}
                placeholder="n"
                minW="min-w-[0.9rem]"
                onChange={(exp) => updateNodeAt(idx, { ...n, exp })}
                onRemoveOut={() => updateNodeAt(idx, null)}
                onSubmit={onSubmit}
                registerActive={registerActive}
              />
            </sup>
          )
        }

        if (n.type === 'sub') {
          return (
            <sub key={`sub-${idx}`} className="relative -bottom-1.5 ml-0.5 inline-flex items-center rounded bg-slate-200/70 px-1 py-0 text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
              <SlotEditor
                nodes={n.sub}
                placeholder="n"
                minW="min-w-[0.9rem]"
                onChange={(sub) => updateNodeAt(idx, { ...n, sub })}
                onRemoveOut={() => updateNodeAt(idx, null)}
                onSubmit={onSubmit}
                registerActive={registerActive}
              />
            </sub>
          )
        }

        if (n.type === 'matrix') {
          return (
            <span key={`mat-${idx}`} className="mx-1 inline-flex items-center align-middle rounded-xl bg-indigo-50/50 px-1.5 py-1 dark:bg-indigo-950/40">
              <span className="select-none text-3xl font-light leading-none text-slate-600 dark:text-slate-300">(</span>
              <span className="mx-1 grid grid-cols-2 gap-1.5">
                {n.cells.map((cellNodes, ci) => (
                  <span key={ci} className="rounded border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 px-1.5 py-0.5 text-center">
                    <SlotEditor
                      nodes={cellNodes}
                      placeholder="0"
                      minW="min-w-[1.2rem]"
                      onChange={(updatedCell) => {
                        const nextCells = [...n.cells]
                        nextCells[ci] = updatedCell
                        updateNodeAt(idx, { ...n, cells: nextCells })
                      }}
                      onRemoveOut={() => updateNodeAt(idx, null)}
                      onSubmit={onSubmit}
                      registerActive={registerActive}
                    />
                  </span>
                ))}
              </span>
              <span className="select-none text-3xl font-light leading-none text-slate-600 dark:text-slate-300">)</span>
            </span>
          )
        }

        return null
      })}
    </span>
  )
}

export function LiveMathField({ value, onChange, onSubmit, placeholder, ariaLabel, editorRef }) {
  const [nodes, setNodes] = useState(() => parseLatexToAst(value))
  const lastSerialized = useRef(value)
  const activeSlotRef = useRef(null)
  const containerRef = useRef(null)
  const id = useId()

  useEffect(() => {
    if (value !== lastSerialized.current) {
      lastSerialized.current = value
      setNodes(parseLatexToAst(value))
    }
  }, [value])

  const updateAst = (nextNodes) => {
    setNodes(nextNodes)
    const latex = serializeAstToLatex(nextNodes)
    lastSerialized.current = latex
    onChange(latex)
  }

  useEffect(() => {
    if (!editorRef) return
    editorRef.current = {
      insert: (snippet) => {
        let newAstNodes = []
        if (snippet === '\\sqrt{}') {
          newAstNodes = [{ type: 'sqrt', body: [] }]
        } else if (snippet === '\\sqrt[]{}') {
          newAstNodes = [{ type: 'nroot', deg: [], body: [] }]
        } else if (snippet === '^2') {
          newAstNodes = [{ type: 'sup', exp: [{ type: 'char', val: '2' }] }]
        } else if (snippet === '^{}') {
          newAstNodes = [{ type: 'sup', exp: [] }]
        } else if (snippet === '_{}') {
          newAstNodes = [{ type: 'sub', sub: [] }]
        } else if (snippet === '\\frac{}{}') {
          newAstNodes = [{ type: 'frac', num: [], den: [] }]
        } else if (snippet.startsWith('\\begin{pmatrix}')) {
          newAstNodes = [{ type: 'matrix', cells: [[], [], [], []] }]
        } else {
          newAstNodes = parseLatexToAst(snippet)
        }

        if (activeSlotRef.current?.insertNode) {
          activeSlotRef.current.insertNode(newAstNodes)
        } else {
          updateAst([...nodes, ...newAstNodes])
        }
      },
      focus: () => {
        const inputs = containerRef.current?.querySelectorAll('input')
        if (inputs?.length) inputs[inputs.length - 1].focus()
      },
    }
  })

  return (
    <math-field
      id={id}
      ref={containerRef}
      role="textbox"
      aria-label={ariaLabel || placeholder}
      onClick={(e) => {
        if (e.target === containerRef.current) {
          const inputs = containerRef.current.querySelectorAll('input')
          if (inputs.length) inputs[inputs.length - 1].focus()
        }
      }}
      className="field flex min-h-[4.25rem] flex-1 cursor-text flex-wrap items-center gap-1 rounded-2xl border-2 border-indigo-200/90 bg-white/95 px-4 py-3 text-lg shadow-inner transition focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900/90"
    >
      <SlotEditor
        nodes={nodes}
        placeholder={placeholder}
        minW="min-w-[14rem] flex-1"
        onChange={updateAst}
        onSubmit={onSubmit}
        registerActive={(slotApi) => { activeSlotRef.current = slotApi }}
      />
    </math-field>
  )
}

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

  const handlePaste = async (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type?.startsWith("image/")) {
        e.preventDefault()
        const f = item.getAsFile()
        if (f) setImg({ name: f.name || "clipboard.png", mime: f.type || "image/png", data: await fileToBase64(f) })
        return
      }
    }
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

      <div className="glass space-y-4 p-5 md:p-8" onPaste={handlePaste}>
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
            <div className="flex gap-1.5">
              <button className="btn-ghost flex-1" onClick={() => fileRef.current.click()} title="Ctrl+V / Rasm yuklash">📷 {img ? img.name.slice(0, 12) : t.upload}</button>
              {img && <button type="button" className="btn-ghost !px-2.5 text-rose-600" onClick={() => setImg(null)} aria-label="Remove image">✕</button>}
            </div>
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
