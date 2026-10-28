import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { T } from '../lib/i18n'
import { CURRICULUM } from '../lib/curriculum'
import { generateProblems } from '../lib/api'
import { Tex, Rich } from './Tex'

const LBL = {
  uz: {
    title: 'Test / Masala Tuzish',
    sub: 'Bir yoki bir nechta mavzuni tanlang, har biridan nechta misol kerakligini belgilang va AI darhol yangi test to‘plamini tuzib beradi.',
    pickTopics: '1. Mavzular va misollar sonini tanlang',
    customPh: 'Yoki o‘zingiz mavzu yozing (masalan: Tengsizliklar sistemasi)…',
    addCustom: '＋ Qo‘shish',
    diffTitle: '2. Qiyinlik darajasi',
    mixed: 'Aralash',
    fmtTitle: '3. Test formati',
    fmtAbcd: 'Variantli test (A / B / C / D)',
    fmtOpen: 'Ochiq savol (Javob yozish)',
    totalProblems: 'Jami misollar:',
    costNote: 'Sarflanadigan token: {c} ta (har 10 ta misol uchun 1 token)',
    generateBtn: '✨ Testni tuzish',
    generating: 'AI misollarni tuzmoqda…',
    finishBtn: '✅ Testni yakunlash va tekshirish',
    resetBtn: '🔄 Yangi test tuzish',
    printBtn: '🖨 PDF / Chop etish',
    showSolutionsPrint: 'Chop etishda javob va yechimlarni ko‘rsatish',
    scoreBanner: 'Natija: {c} / {t} ({p}%) to‘g‘ri!',
    checkOne: 'Tekshirish',
    showSol: 'Yechimni ko‘rish',
    hideSol: 'Yechimni yashirish',
    analyzeAi: '🤖 AI bilan tahlil qilish',
    yourAns: 'Javobingiz…',
    correctAns: 'To‘g‘ri javob:',
    solutionLbl: 'Qisqa yechim:',
    selectAtLeastOne: 'Kamida bitta mavzuni tanlang yoki yozing',
    ansSheetTitle: 'Javoblar va yechimlar kaliti',
  },
  ru: {
    title: 'Конструктор тестов и задач',
    sub: 'Выберите одну или несколько тем, укажите количество задач по каждой, и AI мгновенно создаст новый вариант теста.',
    pickTopics: '1. Выберите темы и количество задач',
    customPh: 'Или введите свою тему (например: Системы неравенств)…',
    addCustom: '＋ Добавить',
    diffTitle: '2. Уровень сложности',
    mixed: 'Смешанный',
    fmtTitle: '3. Формат заданий',
    fmtAbcd: 'Тест с вариантами (A / B / C / D)',
    fmtOpen: 'Открытый вопрос (Ввод ответа)',
    totalProblems: 'Всего задач:',
    costNote: 'Стоимость: {c} токен(ов) (1 токен за каждые 10 задач)',
    generateBtn: '✨ Создать тест',
    generating: 'AI составляет задачи…',
    finishBtn: '✅ Завершить и проверить всё',
    resetBtn: '🔄 Новый тест',
    printBtn: '🖨 PDF / Печать',
    showSolutionsPrint: 'Показывать ответы и решения при печати',
    scoreBanner: 'Результат: {c} из {t} ({p}%) верно!',
    checkOne: 'Проверить',
    showSol: 'Показать решение',
    hideSol: 'Скрыть решение',
    analyzeAi: '🤖 Разобрать с AI',
    yourAns: 'Ваш ответ…',
    correctAns: 'Правильный ответ:',
    solutionLbl: 'Краткое решение:',
    selectAtLeastOne: 'Выберите или добавьте хотя бы одну тему',
    ansSheetTitle: 'Ключи и решения',
  },
  en: {
    title: 'Custom Problem & Test Generator',
    sub: 'Select one or multiple topics, set how many problems you want for each, and let the AI generate a fresh practice test.',
    pickTopics: '1. Select topics & problem counts',
    customPh: 'Or type any custom topic (e.g. Systems of Inequalities)…',
    addCustom: '＋ Add topic',
    diffTitle: '2. Difficulty level',
    mixed: 'Mixed',
    fmtTitle: '3. Question format',
    fmtAbcd: 'Multiple Choice (A / B / C / D)',
    fmtOpen: 'Open Answer',
    totalProblems: 'Total problems:',
    costNote: 'Cost: {c} token(s) (1 token per 10 problems)',
    generateBtn: '✨ Generate Test',
    generating: 'AI is generating problems…',
    finishBtn: '✅ Finish & Check All',
    resetBtn: '🔄 New Test Set',
    printBtn: '🖨 PDF / Print',
    showSolutionsPrint: 'Include answer key & solutions when printing',
    scoreBanner: 'Score: {c} / {t} ({p}%) correct!',
    checkOne: 'Check',
    showSol: 'Show solution',
    hideSol: 'Hide solution',
    analyzeAi: '🤖 Analyze with AI',
    yourAns: 'Your answer…',
    correctAns: 'Correct answer:',
    solutionLbl: 'Short solution:',
    selectAtLeastOne: 'Select or enter at least one topic',
    ansSheetTitle: 'Answer Key & Solutions',
  },
}

const LETTERS = ['A', 'B', 'C', 'D']

function normAns(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\$/g, '')
    .replace(/\s+/g, '')
    .replace(/\\;|\\,|\\ /g, '')
    .split(/[,;]/)
    .filter(Boolean)
    .sort()
    .join(',')
}

function isAnswerMatch(given, expected, options = []) {
  if (!String(given ?? '').trim()) return false
  const g = normAns(given)
  const e = normAns(expected)
  if (g === e) return true
  // Also allow matching by letter A/B/C/D if expected is 'A' or the option text
  const idx = LETTERS.indexOf(String(given).trim().toUpperCase())
  if (idx !== -1 && options[idx] && normAns(options[idx]) === e) return true
  const expIdx = LETTERS.indexOf(String(expected).trim().toUpperCase())
  if (expIdx !== -1 && options[expIdx] && normAns(options[expIdx]) === g) return true
  return false
}

export default function TestGenerator({ lang, presetTopic, onClearPreset, onAnalyzeProblem, onUserUpdate }) {
  const t = T[lang]
  const l = LBL[lang] || LBL.uz

  // Map topicName -> count (1..20)
  const [selected, setSelected] = useState(() => {
    const first = CURRICULUM[0]?.name[lang] || 'Kvadrat tenglamalar'
    return { [first]: 3 }
  })
  const [customTopics, setCustomTopics] = useState([])
  const [customInput, setCustomInput] = useState('')
  const [difficulty, setDifficulty] = useState('mixed') // easy | medium | hard | mixed
  const [format, setFormat] = useState('abcd') // abcd | open
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [problems, setProblems] = useState([])
  const [answers, setAnswers] = useState({})
  const [checked, setChecked] = useState({})
  const [openSol, setOpenSol] = useState({})
  const [finished, setFinished] = useState(false)
  const [printWithSol, setPrintWithSol] = useState(true)

  useEffect(() => {
    if (presetTopic) {
      const tName = typeof presetTopic === 'string' ? presetTopic : presetTopic.name?.[lang] || presetTopic.name?.uz
      if (tName) {
        setSelected({ [tName]: 5 })
        if (!CURRICULUM.some((c) => c.name[lang] === tName) && !customTopics.includes(tName)) {
          setCustomTopics((prev) => [...prev, tName])
        }
      }
      onClearPreset?.()
    }
  }, [presetTopic, lang]) // eslint-disable-line

  const toggleTopic = (name) => {
    setSelected((prev) => {
      const next = { ...prev }
      if (next[name]) delete next[name]
      else next[name] = 3
      return next
    })
  }

  const setTopicCount = (name, deltaOrVal, isAbsolute = false) => {
    setSelected((prev) => {
      const cur = prev[name] || 3
      const raw = isAbsolute ? parseInt(deltaOrVal, 10) || 1 : cur + deltaOrVal
      const clamped = Math.max(1, Math.min(20, raw))
      return { ...prev, [name]: clamped }
    })
  }

  const addCustomTopic = (e) => {
    e?.preventDefault()
    const clean = customInput.trim()
    if (!clean) return
    if (!customTopics.includes(clean)) setCustomTopics((prev) => [...prev, clean])
    setSelected((prev) => ({ ...prev, [clean]: prev[clean] || 3 }))
    setCustomInput('')
  }

  const activeEntries = Object.entries(selected).filter(([, c]) => c > 0)
  const totalCount = activeEntries.reduce((s, [, c]) => s + c, 0)
  const tokenCost = Math.max(1, Math.ceil(totalCount / 10))

  const handleGenerate = async () => {
    if (!activeEntries.length) {
      setErr(l.selectAtLeastOne)
      return
    }
    setLoading(true); setErr('')
    setFinished(false); setAnswers({}); setChecked({}); setOpenSol({})
    try {
      const payload = {
        topics: activeEntries.map(([topic, count]) => ({ topic, count })),
        difficulty,
        format,
        lang,
      }
      const r = await generateProblems(payload)
      setProblems(r.problems || [])
      if (r.user) onUserUpdate?.(r.user)
    } catch (e) {
      setErr(e.status === 0 ? t.net : e.code === 'tokens_exhausted' ? t.tokensOut : e.message || t.err)
    } finally {
      setLoading(false)
    }
  }

  const checkSingle = (id) => {
    setChecked((prev) => ({ ...prev, [id]: true }))
  }

  const finishAll = () => {
    const all = {}
    problems.forEach((p) => { all[p.id] = true })
    setChecked(all)
    setFinished(true)
  }

  const correctCount = problems.filter((p) => isAnswerMatch(answers[p.id], p.answer, p.options)).length
  const pct = problems.length ? Math.round((correctCount / problems.length) * 100) : 0

  return (
    <section className="space-y-6 pb-8" aria-label={l.title}>
      <header className="print:hidden">
        <h2 className="font-display text-3xl font-extrabold sm:text-4xl"><span className="gradient-text">📝 {l.title}</span></h2>
        <p className="mt-1 max-w-3xl text-slate-600 dark:text-slate-300">{l.sub}</p>
      </header>

      {/* Builder Configuration Panel */}
      <div className="print:hidden glass space-y-6 p-5 md:p-7">
        {/* 1. Topic & Count Selector */}
        <div className="space-y-3">
          <h3 className="font-display text-lg font-bold">{l.pickTopics}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CURRICULUM.map((c) => {
              const name = c.name[lang]
              const count = selected[name] || 0
              const active = count > 0
              return (
                <div key={c.id}
                  className={`flex items-center justify-between gap-2 rounded-2xl border p-3 transition ${active ? 'border-indigo-500 bg-indigo-50/70 shadow-sm dark:bg-indigo-950/40' : 'border-slate-200 bg-white/60 dark:border-white/10 dark:bg-white/5'}`}>
                  <button type="button" onClick={() => toggleTopic(name)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                    <span className={`grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-lg text-white ${c.color}`}>{c.icon}</span>
                    <span className="truncate text-sm font-bold">{name}</span>
                  </button>
                  {active ? (
                    <div className="flex items-center gap-1">
                      <button type="button" className="grid size-7 place-items-center rounded-lg border border-slate-300 bg-white font-bold hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
                        onClick={() => setTopicCount(name, -1)}>−</button>
                      <input type="number" min={1} max={20} value={count}
                        onChange={(e) => setTopicCount(name, e.target.value, true)}
                        className="w-11 rounded-lg border border-slate-300 bg-white py-0.5 text-center text-sm font-bold dark:border-slate-700 dark:bg-slate-900" />
                      <button type="button" className="grid size-7 place-items-center rounded-lg border border-slate-300 bg-white font-bold hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
                        onClick={() => setTopicCount(name, 1)}>＋</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => toggleTopic(name)} className="rounded-lg px-2.5 py-1 text-xs font-bold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300">＋</button>
                  )}
                </div>
              )
            })}

            {customTopics.map((name) => {
              const count = selected[name] || 0
              const active = count > 0
              return (
                <div key={name}
                  className={`flex items-center justify-between gap-2 rounded-2xl border p-3 transition ${active ? 'border-indigo-500 bg-indigo-50/70 shadow-sm dark:bg-indigo-950/40' : 'border-slate-200 bg-white/60 dark:border-white/10 dark:bg-white/5'}`}>
                  <button type="button" onClick={() => toggleTopic(name)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-lg text-white">✨</span>
                    <span className="truncate text-sm font-bold">{name}</span>
                  </button>
                  {active && (
                    <div className="flex items-center gap-1">
                      <button type="button" className="grid size-7 place-items-center rounded-lg border border-slate-300 bg-white font-bold dark:border-slate-700 dark:bg-slate-800"
                        onClick={() => setTopicCount(name, -1)}>−</button>
                      <input type="number" min={1} max={20} value={count}
                        onChange={(e) => setTopicCount(name, e.target.value, true)}
                        className="w-11 rounded-lg border border-slate-300 bg-white py-0.5 text-center text-sm font-bold dark:border-slate-700 dark:bg-slate-900" />
                      <button type="button" className="grid size-7 place-items-center rounded-lg border border-slate-300 bg-white font-bold dark:border-slate-700 dark:bg-slate-800"
                        onClick={() => setTopicCount(name, 1)}>＋</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Custom Topic Input */}
          <form onSubmit={addCustomTopic} className="flex flex-wrap gap-2 pt-1">
            <input type="text" value={customInput} onChange={(e) => setCustomInput(e.target.value)}
              placeholder={l.customPh} maxLength={120}
              className="field flex-1 min-w-60 !py-2.5 text-sm" />
            <button type="submit" disabled={!customInput.trim()} className="btn-ghost text-sm font-bold">{l.addCustom}</button>
          </form>
        </div>

        {/* 2. Difficulty & 3. Format */}
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <h3 className="font-display text-base font-bold">{l.diffTitle}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ['easy', '🟢 ' + t.easy],
                ['medium', '🟡 ' + t.medium],
                ['hard', '🔴 ' + t.hard],
                ['mixed', '🌈 ' + l.mixed],
              ].map(([id, label]) => (
                <button key={id} type="button" onClick={() => setDifficulty(id)}
                  className={`rounded-xl border px-3 py-2 text-sm font-bold transition ${difficulty === id ? 'border-indigo-500 bg-indigo-600 text-white shadow' : 'border-slate-200 bg-white/60 dark:border-white/10 dark:bg-white/5'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-display text-base font-bold">{l.fmtTitle}</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                ['abcd', '🔠 ' + l.fmtAbcd],
                ['open', '✍️ ' + l.fmtOpen],
              ].map(([id, label]) => (
                <button key={id} type="button" onClick={() => setFormat(id)}
                  className={`rounded-xl border px-3 py-2 text-sm font-bold transition ${format === id ? 'border-indigo-500 bg-indigo-600 text-white shadow' : 'border-slate-200 bg-white/60 dark:border-white/10 dark:bg-white/5'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Summary & Generate Action */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200/80 pt-4 dark:border-white/10">
          <div className="text-sm">
            <span className="font-bold">{l.totalProblems} <span className="text-indigo-600 dark:text-indigo-300">{totalCount} ta</span></span>
            <span className="ml-3 text-xs text-slate-500">⚡ {l.costNote.replace('{c}', tokenCost)}</span>
          </div>
          <button type="button" className="btn !px-6 !py-3 text-base" disabled={loading || totalCount < 1} onClick={handleGenerate}>
            {loading ? l.generating : l.generateBtn}
          </button>
        </div>
        {err && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">{err}</p>}
      </div>

      {/* Generated Problems Interactive & Print Area */}
      {problems.length > 0 && (
        <div className="space-y-5">
          {/* Toolbar: Finish, Print, Toggle Print Solutions */}
          <div className="print:hidden glass flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn text-sm" onClick={finishAll}>{l.finishBtn}</button>
              <button type="button" className="btn-ghost text-sm" onClick={handleGenerate} disabled={loading}>{l.resetBtn}</button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
                <input type="checkbox" checked={printWithSol} onChange={(e) => setPrintWithSol(e.target.checked)} className="rounded accent-indigo-600" />
                {l.showSolutionsPrint}
              </label>
              <button type="button" className="btn-ghost text-sm font-bold" onClick={() => window.print()}>{l.printBtn}</button>
            </div>
          </div>

          {finished && (
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
              className="print:hidden rounded-3xl bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-center text-white shadow-xl">
              <div className="font-display text-3xl font-extrabold">
                🎯 {l.scoreBanner.replace('{c}', correctCount).replace('{t}', problems.length).replace('{p}', pct)}
              </div>
            </motion.div>
          )}

          {/* Print Header */}
          <div className="hidden print:block border-b pb-3 mb-4">
            <h1 className="text-2xl font-bold">AI Math Tutor — {l.title}</h1>
            <p className="text-sm">{activeEntries.map(([k, v]) => `${k} (${v})`).join(' • ')}</p>
          </div>

          <ol className="space-y-4">
            {problems.map((p, idx) => {
              const userAns = answers[p.id] || ''
              const isChecked = !!checked[p.id]
              const isOk = isChecked && isAnswerMatch(userAns, p.answer, p.options)
              const showS = !!openSol[p.id] || finished

              return (
                <li key={p.id} className="glass p-5 space-y-3 break-inside-avoid">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-8 place-items-center rounded-full bg-indigo-600 text-sm font-bold text-white">{idx + 1}</span>
                      <span className="rounded-full bg-indigo-50 px-3 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">{p.topic}</span>
                      <span className="text-xs text-slate-400 capitalize">{t[p.difficulty] || p.difficulty}</span>
                    </div>
                    <button type="button" className="print:hidden btn-ghost !px-3 !py-1 text-xs font-bold"
                      onClick={() => onAnalyzeProblem?.(p.question_latex)}>
                      {l.analyzeAi}
                    </button>
                  </div>

                  <div className="overflow-x-auto no-scrollbar py-1 text-xl">
                    <Tex tex={p.question_latex} />
                  </div>

                  {/* ABCD Multiple Choice Options */}
                  {p.options?.length > 0 ? (
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {p.options.map((opt, oi) => {
                        const letter = LETTERS[oi] || String(oi + 1)
                        const picked = userAns === opt || userAns === letter
                        const optCorrect = isChecked && (normAns(opt) === normAns(p.answer) || String(p.answer).trim().toUpperCase() === letter)
                        let cls = 'border-slate-200 bg-white/70 hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-800/60'
                        if (isChecked) {
                          if (optCorrect) cls = 'border-emerald-500 bg-emerald-50/90 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200'
                          else if (picked) cls = 'border-rose-500 bg-rose-50/90 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200'
                        } else if (picked) {
                          cls = 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-400/30 dark:bg-indigo-950/60'
                        }
                        return (
                          <button key={oi} type="button"
                            onClick={() => setAnswers((prev) => ({ ...prev, [p.id]: opt }))}
                            className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${cls}`}>
                            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-slate-200/80 text-xs font-extrabold dark:bg-slate-700">{letter}</span>
                            <span className="min-w-0 flex-1 overflow-x-auto no-scrollbar"><Tex tex={opt} /></span>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    /* Open Answer Input */
                    <div className="print:hidden flex flex-wrap gap-2">
                      <input type="text" value={userAns}
                        onChange={(e) => setAnswers((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && checkSingle(p.id)}
                        placeholder={l.yourAns}
                        className="field flex-1 min-w-48 !py-2" />
                    </div>
                  )}

                  {/* Per-question Actions & Feedback */}
                  <div className="print:hidden flex flex-wrap items-center gap-3 pt-1">
                    <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs font-bold"
                      disabled={!userAns.trim()} onClick={() => checkSingle(p.id)}>
                      ✓ {l.checkOne}
                    </button>
                    <button type="button" className="text-xs font-bold text-indigo-600 underline dark:text-indigo-300"
                      onClick={() => setOpenSol((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}>
                      {showS ? l.hideSol : l.showSol}
                    </button>
                    {isChecked && (
                      <span className={`text-sm font-bold ${isOk ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isOk ? t.ok : `${t.no} — ${l.correctAns} `}
                        {!isOk && <Tex tex={p.answer} />}
                      </span>
                    )}
                  </div>

                  {showS && (
                    <div className="print:hidden rounded-xl bg-amber-50/80 p-3.5 text-sm dark:bg-amber-950/30 space-y-1">
                      <div className="font-bold text-amber-900 dark:text-amber-200">{l.correctAns} <Tex tex={p.answer} /></div>
                      {p.short_solution && <div className="text-slate-700 dark:text-slate-300"><span className="font-semibold">{l.solutionLbl}</span> <Rich text={p.short_solution} /></div>}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>

          {/* Print-only Answer Key & Solutions at the bottom */}
          {printWithSol && (
            <section className="hidden print:block pt-6 border-t space-y-2">
              <h3 className="text-lg font-bold">{l.ansSheetTitle}</h3>
              <ol className="list-decimal pl-6 space-y-1.5 text-sm">
                {problems.map((p) => (
                  <li key={p.id}>
                    <b><Tex tex={p.answer} /></b>
                    {p.short_solution && <span> — <Rich text={p.short_solution} /></span>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
    </section>
  )
}
