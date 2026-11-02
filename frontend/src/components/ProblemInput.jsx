import React, { useRef, useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { T } from '../lib/i18n'
import { Tex } from './Tex'

const CATEGORIES = [
  {
    id: 'basic',
    label: 'Asosiy',
    symbols: [
      { label: 'x²', insert: '^{2}', offset: 2, wrap: (s) => `${s || 'x'}^{2}`, tooltip: 'Daraja 2' },
      { label: 'xⁿ', insert: '^{}', offset: 2, wrap: (s) => `${s || 'x'}^{}`, tooltip: 'Daraja' },
      { label: '√x', insert: '\\sqrt{}', offset: 6, wrap: (s) => `\\sqrt{${s}}`, tooltip: 'Kvadrat ildiz' },
      { label: 'ⁿ√x', insert: '\\sqrt[]{}', offset: 6, wrap: (s) => `\\sqrt[n]{${s}}`, tooltip: 'n-darajali ildiz' },
      { label: 'a/b', insert: '\\frac{}{}', offset: 6, wrap: (s) => `\\frac{${s}}{}`, tooltip: 'Kasr' },
      { label: '±', insert: '\\pm ', offset: 4, tooltip: 'Plyus-minus' },
      { label: '×', insert: '\\cdot ', offset: 6, tooltip: 'Ko‘paytirish' },
      { label: '÷', insert: '\\div ', offset: 5, tooltip: 'Bo‘lish' },
      { label: '≠', insert: '\\neq ', offset: 5, tooltip: 'Teng emas' },
      { label: '≤', insert: '\\leq ', offset: 5, tooltip: 'Kichik yoki teng' },
      { label: '≥', insert: '\\geq ', offset: 5, tooltip: 'Katta yoki teng' },
      { label: 'π', insert: '\\pi ', offset: 4, tooltip: 'Pi soni' },
    ],
  },
  {
    id: 'algebra',
    label: 'Algebra',
    symbols: [
      { label: 'x', insert: 'x', offset: 1, tooltip: 'Noma‘lum x' },
      { label: 'y', insert: 'y', offset: 1, tooltip: 'Noma‘lum y' },
      { label: 'ax²+bx+c=0', insert: 'ax^{2} + bx + c = 0', offset: 0, tooltip: 'Kvadrat tenglama' },
      { label: '|x|', insert: '|x|', offset: 2, wrap: (s) => `|${s}|`, tooltip: 'Modul' },
      { label: '( )', insert: '()', offset: 1, wrap: (s) => `(${s})`, tooltip: 'Qavs' },
      { label: '{ }', insert: '\\{\\}', offset: 2, wrap: (s) => `\\{${s}\\}`, tooltip: 'Figurali qavs' },
      { label: 'log_a(b)', insert: '\\log_{a}(b)', offset: 6, tooltip: 'Logarifm' },
      { label: 'ln(x)', insert: '\\ln(x)', offset: 4, wrap: (s) => `\\ln(${s})`, tooltip: 'Natural logarifm' },
      { label: 'x₁', insert: 'x_{1}', offset: 4, tooltip: 'Indeks' },
      { label: 'x_n', insert: 'x_{n}', offset: 4, tooltip: 'Indeks n' },
      { label: '∑', insert: '\\sum_{i=1}^{n} ', offset: 7, tooltip: 'Yig‘indi' },
      { label: '∏', insert: '\\prod_{i=1}^{n} ', offset: 8, tooltip: 'Ko‘paytma' },
    ],
  },
  {
    id: 'trig_calc',
    label: 'Trig & Tahlil',
    symbols: [
      { label: 'sin', insert: '\\sin(x)', offset: 5, wrap: (s) => `\\sin(${s})` },
      { label: 'cos', insert: '\\cos(x)', offset: 5, wrap: (s) => `\\cos(${s})` },
      { label: 'tan', insert: '\\tan(x)', offset: 5, wrap: (s) => `\\tan(${s})` },
      { label: 'cot', insert: '\\cot(x)', offset: 5, wrap: (s) => `\\cot(${s})` },
      { label: 'lim', insert: '\\lim_{x \\to 0} ', offset: 9 },
      { label: '∫ dx', insert: '\\int f(x) \\, dx', offset: 5 },
      { label: '∫_a^b', insert: '\\int_{a}^{b} f(x) \\, dx', offset: 7 },
      { label: 'd/dx', insert: '\\frac{d}{dx}', offset: 12 },
      { label: 'f′(x)', insert: 'f^{\\prime}(x)', offset: 13 },
      { label: '∞', insert: '\\infty ', offset: 7 },
      { label: 'α', insert: '\\alpha ', offset: 7 },
      { label: 'θ', insert: '\\theta ', offset: 7 },
    ],
  },
]

const PRESETS = [
  { label: '2x² - 5x + 2 = 0', value: '2x^{2} - 5x + 2 = 0', desc: 'Kvadrat tenglama' },
  { label: '∫ (3x² + 2x - 1) dx', value: '\\int (3x^{2} + 2x - 1) \\, dx', desc: 'Aniqmas integral' },
  { label: 'lim (sin x)/x, x→0', value: '\\lim_{x \\to 0} \\frac{\\sin(x)}{x}', desc: 'Mashhur limit' },
  { label: 'log₂(x + 3) = 4', value: '\\log_{2}(x + 3) = 4', desc: 'Logarifmik tenglama' },
  { label: '√(x + 5) = x - 1', value: '\\sqrt{x + 5} = x - 1', desc: 'Irratsional tenglama' },
]

export default function ProblemInput({
  lang = 'uz',
  value = '',
  onChange,
  onSubmit,
  busy = false,
  placeholder,
  onPhotoClick,
  onVoiceClick,
  isListening = false,
}) {
  const t = T[lang] || T.uz
  const inputRef = useRef(null)
  const [activeTab, setActiveTab] = useState('basic')
  const [showPreview, setShowPreview] = useState(true)
  const lastSelectionRef = useRef({ start: value.length, end: value.length })

  // Update saved selection coordinates
  const updateSelection = useCallback(() => {
    const el = inputRef.current
    if (el) {
      lastSelectionRef.current = {
        start: el.selectionStart ?? value.length,
        end: el.selectionEnd ?? value.length,
      }
    }
  }, [value.length])

  // Smart insertion keeping focus and exact caret position
  const insertAtCursor = useCallback(
    (textToInsert, cursorOffset = null, wrapFn = null) => {
      const el = inputRef.current
      if (!el) {
        onChange?.(value + textToInsert)
        return
      }

      const start = el.selectionStart ?? lastSelectionRef.current.start ?? value.length
      const end = el.selectionEnd ?? lastSelectionRef.current.end ?? value.length
      const selectedText = value.slice(start, end)

      let finalInsertion = textToInsert
      let newCursorPos = start + (cursorOffset !== null ? cursorOffset : textToInsert.length)

      // If there is selected text and a wrap function exists
      if (selectedText.length > 0 && typeof wrapFn === 'function') {
        finalInsertion = wrapFn(selectedText)
        newCursorPos = start + finalInsertion.length
      } else if (textToInsert === '^{}' || textToInsert === '^{2}') {
        // If cursor right behind variable (e.g. 'x'), automatically attach degree
        if (textToInsert === '^{}') {
          newCursorPos = start + 2 // inside braces: ^{|}
        } else if (textToInsert === '^{2}') {
          newCursorPos = start + 4 // right after degree: ^{2}|
        }
      }

      const nextVal = value.slice(0, start) + finalInsertion + value.slice(end)
      onChange?.(nextVal)

      requestAnimationFrame(() => {
        el.focus()
        el.setSelectionRange(newCursorPos, newCursorPos)
        lastSelectionRef.current = { start: newCursorPos, end: newCursorPos }
      })
    },
    [value, onChange]
  )

  // Move caret left/right by delta steps
  const moveCaret = useCallback(
    (delta) => {
      const el = inputRef.current
      if (!el) return
      const cur = el.selectionStart ?? value.length
      const next = Math.max(0, Math.min(value.length, cur + delta))
      el.focus()
      el.setSelectionRange(next, next)
      lastSelectionRef.current = { start: next, end: next }
    },
    [value.length]
  )

  // Safe deletion at caret position
  const handleBackspace = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length

    if (start === 0 && end === 0) return

    let nextVal = ''
    let newPos = start

    if (start !== end) {
      nextVal = value.slice(0, start) + value.slice(end)
      newPos = start
    } else {
      // Check if deleting brace of ^{...} or special token
      nextVal = value.slice(0, start - 1) + value.slice(start)
      newPos = start - 1
    }

    onChange?.(nextVal)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(newPos, newPos)
      lastSelectionRef.current = { start: newPos, end: newPos }
    })
  }, [value, onChange])

  // Keyboard navigation & smart bracket jumping (Tab / ArrowRight / Enter)
  const handleKeyDown = (e) => {
    const el = inputRef.current
    if (!el) return

    const start = el.selectionStart
    const end = el.selectionEnd

    // Pressing 'Tab' or 'ArrowRight' when right before a closing brace '}' jumps over it
    if ((e.key === 'Tab' || e.key === 'ArrowRight') && start === end) {
      if (value[start] === '}' || value[start] === ')') {
        e.preventDefault()
        const nextPos = start + 1
        el.setSelectionRange(nextPos, nextPos)
        lastSelectionRef.current = { start: nextPos, end: nextPos }
        return
      }
    }

    // Enter submits the form without adding newline (unless Shift is held)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !busy) {
        onSubmit?.(value.trim())
      }
    }
  }

  return (
    <div className="w-full space-y-3">
      {/* Main Container */}
      <div className="glass relative rounded-3xl border border-indigo-100/80 bg-white/90 p-4 shadow-xl backdrop-blur-md transition-all duration-300 dark:border-slate-800/80 dark:bg-slate-900/90 sm:p-5">
        {/* Header Tools */}
        <div className="mb-2.5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Matematik Formula
          </span>

          <div className="flex items-center gap-2">
            {value.trim() && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowPreview((p) => !p)}
                className="rounded-lg px-2 py-1 font-medium transition hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {showPreview ? 'Prevyuni yopish' : 'Prevyuni ko‘rish'}
              </button>
            )}
            {value && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange?.('')
                  inputRef.current?.focus()
                }}
                className="rounded-lg px-2 py-1 font-medium text-rose-500 transition hover:bg-rose-50 dark:hover:bg-rose-950/40"
              >
                Tozalash
              </button>
            )}
          </div>
        </div>

        {/* Text Input Area */}
        <div className="relative">
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => {
              onChange?.(e.target.value)
              updateSelection()
            }}
            onSelect={updateSelection}
            onClick={updateSelection}
            onKeyUp={updateSelection}
            onKeyDown={handleKeyDown}
            disabled={busy}
            rows={3}
            placeholder={placeholder || t.mathPlaceholder || 'Masalan: 2x^2 - 5x + 2 = 0 yoki \\frac{a}{b}...'}
            className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 font-mono text-base text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/15 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:bg-slate-950 sm:text-lg"
            aria-label="Matematika masalasi yoki formulasi"
          />
        </div>

        {/* Live LaTeX Preview */}
        <AnimatePresence>
          {showPreview && value.trim() && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 overflow-hidden rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3.5 dark:border-indigo-950/60 dark:bg-indigo-950/20"
            >
              <div className="mb-1 flex items-center justify-between text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                <span>Jonli matematik ko‘rinish:</span>
                <span className="text-[11px] font-normal opacity-75">LaTeX format</span>
              </div>
              <div className="overflow-x-auto py-1 text-center text-lg sm:text-xl text-slate-900 dark:text-slate-100">
                <Tex tex={value} block />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mathematical Virtual Keypad & Caret Controls */}
        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800/80">
          {/* Tabs & Caret Controls Row */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            {/* Category Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80 no-scrollbar">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setActiveTab(cat.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    activeTab === cat.id
                      ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-indigo-400'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Caret D-Pad Controls for fine positioning */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                title="Kursorni chapga surish"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => moveCaret(-1)}
                className="flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                ◀ Chapga
              </button>
              <button
                type="button"
                title="Kursorni o‘ngga surish"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => moveCaret(1)}
                className="flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                O‘ngga ▶
              </button>
              <button
                type="button"
                title="Belgini o‘chirish"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleBackspace}
                className="flex h-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-xs font-bold text-rose-700 shadow-sm transition hover:bg-rose-100 active:scale-95 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/60"
              >
                ⌫
              </button>
            </div>
          </div>

          {/* Symbols Grid */}
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-12">
            {CATEGORIES.find((c) => c.id === activeTab)?.symbols.map((item, idx) => (
              <button
                key={idx}
                type="button"
                title={item.tooltip || item.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertAtCursor(item.insert, item.offset, item.wrap)}
                className="group relative flex h-9 items-center justify-center rounded-xl border border-slate-200/90 bg-white/80 font-mono text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-400 hover:bg-indigo-50/70 hover:text-indigo-600 active:translate-y-0 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:border-indigo-500 dark:hover:bg-slate-700 dark:hover:text-indigo-400"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Preset equations */}
        <div className="mt-3 flex items-center gap-1.5 overflow-x-auto py-1 text-xs no-scrollbar">
          <span className="shrink-0 font-medium text-slate-400 dark:text-slate-500">Misollar:</span>
          {PRESETS.map((p, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange?.(p.value)
                requestAnimationFrame(() => {
                  inputRef.current?.focus()
                  inputRef.current?.setSelectionRange(p.value.length, p.value.length)
                  lastSelectionRef.current = { start: p.value.length, end: p.value.length }
                })
              }}
              className="shrink-0 rounded-lg border border-slate-200/80 bg-white/70 px-2.5 py-1 text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-700/80"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Action Controls Footer */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800/80">
          <div className="flex items-center gap-2">
            {onPhotoClick && (
              <button
                type="button"
                onClick={onPhotoClick}
                disabled={busy}
                className="btn-ghost flex items-center gap-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300"
                title="Rasm yoki formulani skanerlash"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Foto/Chizma</span>
              </button>
            )}

            {onVoiceClick && (
              <button
                type="button"
                onClick={onVoiceClick}
                disabled={busy}
                className={`btn-ghost flex items-center gap-1.5 text-xs sm:text-sm transition ${isListening ? 'text-rose-600 animate-pulse bg-rose-50 dark:bg-rose-950/40' : 'text-slate-600 dark:text-slate-300'}`}
                title="Ovoz orqali aytish"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                <span>{isListening ? 'Eshitmoqda...' : 'Ovozli'}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!value.trim() || busy}
              onClick={() => onSubmit?.(value.trim())}
              className="btn flex items-center gap-2 !px-6 !py-2.5 text-sm font-bold shadow-lg shadow-indigo-500/25"
            >
              {busy ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Tahlil qilinmoqda...</span>
                </>
              ) : (
                <>
                  <span>Yechish</span>
                  <svg className="h-4 w-4 transition group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
