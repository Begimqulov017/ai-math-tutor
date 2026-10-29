import { useEffect, useRef, useState } from 'react'
import { T } from '../lib/i18n'
import { checkSolution, fileToBase64 } from '../lib/api'
import { Rich } from './Tex'

const BADGE = { correct: ['✅', 'text-emerald-600'], partly: ['⚠️', 'text-amber-600'], wrong: ['❌', 'text-rose-600'] }

const PEN_COLORS = [
  { id: 'dark', hex: '#1e1b4b', label: 'Siyoh / Qora' },
  { id: 'blue', hex: '#2563eb', label: 'Ko‘k' },
  { id: 'red', hex: '#dc2626', label: 'Qizil' },
  { id: 'green', hex: '#16a34a', label: 'Yashil' },
]

export default function Handwritten({ lang, problem }) {
  const t = T[lang]
  const [tab, setTab] = useState('draw') // 'draw' | 'upload'
  const fileRef = useRef()
  const canvasRef = useRef()
  const [img, setImg] = useState(null)
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // Whiteboard drawing tools
  const [tool, setTool] = useState('pen') // 'pen' | 'eraser'
  const [color, setColor] = useState('#1e1b4b')
  const [lineWidth, setLineWidth] = useState(3)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)
  const historyRef = useRef([])

  // Setup canvas background
  const initCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // Draw subtle grid dots
    ctx.fillStyle = '#f1f5f9'
    for (let x = 20; x < canvas.width; x += 25) {
      for (let y = 20; y < canvas.height; y += 25) {
        ctx.fillRect(x, y, 1.5, 1.5)
      }
    }
    historyRef.current = [ctx.getImageData(0, 0, canvas.width, canvas.height)]
    setHasDrawn(false)
  }

  useEffect(() => {
    if (tab === 'draw') {
      initCanvas()
    }
  }, [tab])

  const saveHistory = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    historyRef.current.push(imgData)
    if (historyRef.current.length > 20) historyRef.current.shift()
  }

  const undo = () => {
    if (historyRef.current.length <= 1) return
    historyRef.current.pop() // remove current
    const prev = historyRef.current[historyRef.current.length - 1]
    const canvas = canvasRef.current
    if (!canvas || !prev) return
    const ctx = canvas.getContext('2d')
    ctx.putImageData(prev, 0, 0)
    setHasDrawn(historyRef.current.length > 1)
  }

  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if (e.touches && e.touches[0]) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const startDrawing = (e) => {
    e.preventDefault()
    const { x, y } = getCanvasCoords(e)
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.beginPath()
    ctx.moveTo(x, y)
    setIsDrawing(true)
  }

  const draw = (e) => {
    if (!isDrawing) return
    e.preventDefault()
    const { x, y } = getCanvasCoords(e)
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (tool === 'eraser') {
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = lineWidth * 4
    } else {
      ctx.strokeStyle = color
      ctx.lineWidth = lineWidth
    }
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasDrawn(true)
  }

  const stopDrawing = () => {
    if (!isDrawing) return
    setIsDrawing(false)
    saveHistory()
  }

  const pickFile = async (e) => {
    const f = e.target.files?.[0]
    if (f) {
      setImg({ name: f.name, mime: f.type, data: await fileToBase64(f) })
      setRes(null)
      setErr('')
    }
  }

  const checkSolutionAction = async () => {
    let b64 = ''
    let mime = 'image/png'
    if (tab === 'draw') {
      const canvas = canvasRef.current
      if (!canvas) return
      b64 = canvas.toDataURL('image/png').split(',')[1]
    } else {
      if (!img) return
      b64 = img.data
      mime = img.mime || 'image/png'
    }

    setBusy(true)
    setErr('')
    try {
      const r = await checkSolution({ problem, image_base64: b64, image_mime: mime, lang })
      setRes(r)
    } catch (e) {
      setErr(t.err + ': ' + String(e.message).slice(0, 200))
    } finally {
      setBusy(false)
    }
  }

  const [icon, colorClass] = BADGE[res?.verdict] || ['ℹ️', 'text-slate-600']

  return (
    <section className="glass p-5 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">✍️ {t.hw}</h3>
        <div role="tablist" className="flex rounded-xl bg-slate-100 p-1 dark:bg-white/10 text-xs font-bold">
          <button type="button" role="tab" aria-selected={tab === 'draw'}
            onClick={() => { setTab('draw'); setRes(null); setErr('') }}
            className={`rounded-lg px-3 py-1.5 transition ${tab === 'draw' ? 'bg-white shadow dark:bg-slate-800' : 'text-slate-500'}`}>
            🎨 Ekranda chizish
          </button>
          <button type="button" role="tab" aria-selected={tab === 'upload'}
            onClick={() => { setTab('upload'); setRes(null); setErr('') }}
            className={`rounded-lg px-3 py-1.5 transition ${tab === 'upload' ? 'bg-white shadow dark:bg-slate-800' : 'text-slate-500'}`}>
            📷 Rasm yuklash
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        {tab === 'draw'
          ? 'Qalam yoki barmog‘ingiz bilan daftardagidek yechimni to‘g‘ridan-to‘g‘ri doskaga yozing — AI har bir qatorni tekshiradi.'
          : t.hwHint}
      </p>

      {tab === 'draw' ? (
        <div className="space-y-3">
          {/* Whiteboard Controls */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Tool picker */}
            <div className="flex rounded-xl border border-slate-200 bg-white/70 p-0.5 dark:border-white/10 dark:bg-slate-900/60">
              <button type="button" onClick={() => setTool('pen')}
                className={`rounded-lg px-2.5 py-1 font-bold ${tool === 'pen' ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                ✏️ Qalam
              </button>
              <button type="button" onClick={() => setTool('eraser')}
                className={`rounded-lg px-2.5 py-1 font-bold ${tool === 'eraser' ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                🧹 O‘chirg‘ich
              </button>
            </div>

            {/* Color swatches */}
            {tool === 'pen' && (
              <div className="flex items-center gap-1.5 px-1">
                {PEN_COLORS.map((c) => (
                  <button key={c.id} type="button" title={c.label} onClick={() => setColor(c.hex)}
                    className={`size-6 rounded-full border-2 transition ${color === c.hex ? 'scale-110 border-indigo-500 ring-2 ring-indigo-300' : 'border-white/80'}`}
                    style={{ backgroundColor: c.hex }} />
                ))}
              </div>
            )}

            {/* Stroke Width Slider */}
            <div className="flex items-center gap-1.5 text-slate-500">
              <span>Chiziq:</span>
              <input type="range" min={1} max={8} value={lineWidth} onChange={(e) => setLineWidth(Number(e.target.value))}
                className="w-16 accent-indigo-600 cursor-pointer" />
            </div>

            {/* Undo & Clear */}
            <div className="ml-auto flex items-center gap-1">
              <button type="button" className="btn-ghost !px-2.5 !py-1 text-xs" onClick={undo} title="Orqaga">
                ↩ Orqaga
              </button>
              <button type="button" className="btn-ghost !px-2.5 !py-1 text-xs text-rose-600" onClick={initCanvas} title="Tozalash">
                🗑️ Tozalash
              </button>
            </div>
          </div>

          {/* HTML5 Whiteboard Canvas */}
          <div className="overflow-hidden rounded-2xl border-2 border-slate-300 bg-white shadow-inner dark:border-slate-700">
            <canvas
              ref={canvasRef}
              width={700}
              height={380}
              className="w-full h-64 md:h-80 cursor-crosshair touch-none"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
          </div>

          <div className="flex justify-end">
            <button className="btn" disabled={!hasDrawn || busy} onClick={checkSolutionAction}>
              {busy ? t.checking : '🤖 ' + t.check}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => fileRef.current.click()}>
              📷 {img ? img.name.slice(0, 20) : t.upload}
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickFile} />
            <button className="btn" disabled={!img || busy} onClick={checkSolutionAction}>
              {busy ? t.checking : t.check}
            </button>
          </div>
        </div>
      )}

      {err && <p role="alert" className="text-rose-600 text-sm font-bold">{err}</p>}

      {res && (
        <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-white/10">
          <p className={`font-bold text-base ${colorClass}`}>{icon} {t['v_' + res.verdict] || res.verdict}</p>
          <p className="text-sm leading-relaxed"><Rich text={res.summary} /></p>
          <ol className="space-y-1.5 pt-1">
            {res.steps?.map((s, i) => (
              <li key={i} className={`rounded-xl px-3 py-2 text-sm ${s.ok ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200'}`}>
                {s.ok ? '✅' : '❌'} <b><Rich text={s.line} /></b> — <Rich text={s.note} />
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}
