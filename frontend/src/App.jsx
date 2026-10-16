import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { T } from './lib/i18n'
import { analyzeProblem, getMe, getSync, login, putSync, register } from './lib/api'
import { useVoice } from './lib/useVoice'
import {
  clearAuth, clearData, loadAuth, loadHistory, loadMistakes, mergeData,
  saveAuth, saveHistory, saveMistakes,
} from './lib/store'
import Navbar from './components/Navbar'
import ProblemInput from './components/ProblemInput'
import { AnalysisCard, ConceptCard, Variations } from './components/Analysis'
import SolutionPlayer from './components/SolutionPlayer'
import Board from './components/Board'
import History from './components/History'
import Progress from './components/Progress'
import Auth from './components/Auth'
import Practice from './components/Practice'
import Handwritten from './components/Handwritten'
import Chat from './components/Chat'
import { Tex, Rich } from './components/Tex'

export default function App() {
  const [lang, setLang] = useState('uz')
  const [dark, setDark] = useState(window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  const [voiceOn, setVoiceOn] = useState(false)
  const [micActive, setMicActive] = useState(false)
  const [text, setText] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState(0)
  const [history, setHistory] = useState(loadHistory)
  const [mistakes, setMistakes] = useState(loadMistakes)
  const [auth, setAuth] = useState(loadAuth) // { token, user } | null  (null = guest mode)
  const [synced, setSynced] = useState(false)
  const [activeId, setActiveId] = useState(null)
  const [msgs, setMsgs] = useState([])
  const [panel, setPanel] = useState(null) // 'history' | 'progress' | 'auth'
  const [authMode, setAuthMode] = useState('login')
  const [gain, setGain] = useState(null)
  const user = auth?.user || null
  const t = T[lang]
  const { speak, listen, stop } = useVoice(lang)

  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])
  useEffect(() => { document.documentElement.lang = lang }, [lang])

  const updHistory = (fn) => setHistory((h) => { const n = fn(h); saveHistory(n); return n })
  const updMistakes = (fn) => setMistakes((m) => { const n = fn(m); saveMistakes(n); return n })
  const applyUser = (u) => { if (u) setAuth((a) => { if (!a) return a; const n = { ...a, user: u }; saveAuth(n); return n }) }
  const showGain = (n) => {
    if (!(n > 0)) return
    const id = Date.now()
    setGain({ n, id })
    setTimeout(() => setGain((g) => (g?.id === id ? null : g)), 2600)
  }
  const openAuth = (mode = 'login') => { setAuthMode(mode); setPanel('auth') }

  // ---- account + cloud sync ----
  const pull = async () => {
    const m = mergeData({ history, mistakes }, await getSync())
    setHistory(m.history); saveHistory(m.history)
    setMistakes(m.mistakes); saveMistakes(m.mistakes)
    setSynced(true)
  }
  const localLogout = () => { clearAuth(); setAuth(null); setSynced(false) }
  useEffect(() => {
    if (!auth) return
    getMe().then((r) => applyUser(r.user)).catch((e) => { if (e.status === 401) localLogout() })
    pull().catch(() => {})
  }, []) // eslint-disable-line
  useEffect(() => {
    if (!auth || !synced) return
    const id = setTimeout(() => putSync({ history, mistakes }).catch(() => {}), 1500)
    return () => clearTimeout(id)
  }, [history, mistakes, auth, synced]) // eslint-disable-line

  const handleAuth = async (mode, name, email, password) => {
    const r = await (mode === 'login' ? login({ email, password }) : register({ name, email, password }))
    const a = { token: r.token, user: r.user }
    saveAuth(a); setAuth(a)
    try { await pull() } catch (e) { clearAuth(); setAuth(null); throw e }
    setPanel(null)
  }
  const logout = async () => {
    try { await putSync({ history, mistakes }) } catch { /* offline: the last debounced sync stays */ }
    localLogout(); clearData()
    setHistory([]); setMistakes([]); setData(null); setActiveId(null); setMsgs([]); setPanel(null)
  }

  // keep the chat of the open problem saved
  useEffect(() => {
    if (activeId) updHistory((h) => h.map((i) => (i.id === activeId ? { ...i, chat: msgs } : i)))
  }, [msgs]) // eslint-disable-line

  const submit = async (img) => {
    setLoading(true); setError('')
    try {
      const { progress, ...view } = await analyzeProblem({ text, lang, image_base64: img?.data ?? null, image_mime: img?.mime ?? 'image/png' })
      setData(view); setStep(0); setMsgs([])
      if (view.demo) setActiveId(null)
      else {
        const id = Date.now()
        setActiveId(id)
        updHistory((h) => [{ id, ts: id, text, data: view, chat: [] }, ...h])
      }
      if (progress) { applyUser(progress.user); showGain(progress.xp_gained) }
    } catch (e) {
      setError(e.status === 429 || e.status === 503 ? t.busy : t.err + ': ' + String(e.message).slice(0, 200))
    }
    setLoading(false)
  }

  const openItem = (i) => {
    setText(i.text || ''); setData(i.data); setActiveId(i.id); setMsgs(i.chat || []); setStep(0)
    setPanel(null); window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const newProblem = () => { setData(null); setText(''); setActiveId(null); setMsgs([]); setPanel(null) }
  const removeItem = (id) => { updHistory((h) => h.filter((i) => i.id !== id)); if (id === activeId) setActiveId(null) }
  const clearAll = () => { updHistory(() => []); setActiveId(null) }

  const onPractice = ({ level, index, q, userAnswer, user: u, xpGained, firstWrong }) => {
    applyUser(u); showGain(xpGained)
    if (firstWrong) {
      updMistakes((m) => [{ id: Date.now(), ts: Date.now(), key: data?.key, topic: data?.topic?.topic || '', q, level, index, userAnswer }, ...m])
    }
  }
  const fixMistake = (id, u, xp) => { updMistakes((m) => m.filter((x) => x.id !== id)); applyUser(u); showGain(xp) }
  const deleteMistake = (id) => updMistakes((m) => m.filter((x) => x.id !== id))

  const toggleMic = () => {
    if (micActive) { stop(); setMicActive(false); return }
    setMicActive(true)
    listen((x) => setText(x), () => setMicActive(false))
  }

  return (
    <>
      <Navbar {...{ lang, setLang, dark, setDark, voiceOn, setVoiceOn, micActive, user }} onMic={toggleMic}
        onHistory={() => setPanel('history')} onProgress={() => setPanel('progress')} onLogin={openAuth} />
      <History lang={lang} open={panel === 'history'} onClose={() => setPanel(null)} items={history} activeId={activeId}
        onOpen={openItem} onDelete={removeItem} onClear={clearAll} onNew={newProblem} />
      <Progress lang={lang} open={panel === 'progress'} onClose={() => setPanel(null)} user={user} mistakes={mistakes}
        onFixed={fixMistake} onDelete={deleteMistake} onLogin={openAuth} />
      <Auth lang={lang} open={panel === 'auth'} mode={authMode} onClose={() => setPanel(null)} onSubmit={handleAuth} user={user} onLogout={logout} />

      <AnimatePresence>
        {gain && (
          <motion.div key={gain.id} initial={{ opacity: 0, y: 20, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20 }}
            className="fixed z-[70] top-20 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 text-white font-bold px-5 py-2 shadow-lg" role="status">
            +{gain.n} XP ⭐
          </motion.div>
        )}
      </AnimatePresence>

      <main className="mx-auto max-w-6xl px-4 pb-28 space-y-5">
        {!user && (
          <div className="print:hidden glass mt-4 px-4 py-3 flex flex-wrap items-center gap-3 !border-indigo-300 dark:!border-indigo-800">
            <span className="text-xl" aria-hidden="true">🔒</span>
            <p className="flex-1 min-w-56 text-sm">{t.guestNote}</p>
            <button className="btn text-sm" onClick={() => openAuth('register')}>{t.reg}</button>
            <button className="btn-ghost text-sm" onClick={() => openAuth('login')}>{t.login}</button>
          </div>
        )}
        <div className="print:hidden"><ProblemInput {...{ lang, text, setText, loading }} onSubmit={submit} /></div>
        {error && <p role="alert" className="text-rose-600 font-bold">{error}</p>}
        {data && (
          <>
            {data.demo && <p className="text-sm text-amber-600">{t.demo}</p>}
            <div className="flex justify-end print:hidden">
              <button className="btn-ghost" onClick={() => window.print()}>🖨 {t.pdf}</button>
            </div>
            <AnalysisCard lang={lang} data={data} />
            <ConceptCard lang={lang} text={data.concept} />
            <div className="grid lg:grid-cols-2 gap-5 items-start">
              <div className="lg:sticky lg:top-20"><Board lang={lang} data={data} step={step} /></div>
              <div className="print:hidden"><SolutionPlayer lang={lang} steps={data.steps} voiceOn={voiceOn} speak={speak} onStep={setStep} /></div>
            </div>
            <Variations lang={lang} items={data.variations} />
            <div className="print:hidden">
              <Practice lang={lang} practice={data.practice} dataKey={data.key} voiceOn={voiceOn} speak={speak} onResult={onPractice} />
            </div>
            <div className="print:hidden"><Handwritten lang={lang} problem={data.problem} /></div>

            {/* print-only: full solution + all exercises */}
            <section className="hidden print:block space-y-3">
              <h3 className="font-bold">{t.pSol}</h3>
              <ol className="list-decimal pl-6 space-y-2">
                {data.steps?.map((s, i) => <li key={i}><Tex tex={s.latex} block /><p><Rich text={s.comment} /></p></li>)}
              </ol>
              <h3 className="font-bold">{t.pPr}</h3>
              {['easy', 'medium', 'hard'].map((k) => (
                <div key={k}><h4 className="font-bold">{t[k]}</h4>
                  <ol className="list-decimal pl-6">{(data.practice?.[k] || []).map((x, i) => <li key={i}><Tex tex={x.q} /></li>)}</ol>
                </div>
              ))}
            </section>
          </>
        )}
      </main>
      <Chat lang={lang} voiceOn={voiceOn} speak={speak} listen={(cb) => listen(cb)} msgs={msgs} setMsgs={setMsgs}
        context={data ? { problem: data.problem, topic: data.topic, currentStep: step + 1, step: data.steps?.[step] } : {}} />
    </>
  )
}
