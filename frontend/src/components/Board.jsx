import React, { useState } from 'react'
import { T } from '../lib/i18n'
import { Tex } from './Tex'

class Safe extends React.Component {
  state = { bad: false }
  static getDerivedStateFromError() { return { bad: true } }
  render() { return this.state.bad ? null : this.props.children }
}

const CHALK = 'currentColor', FOCUS = '#F59E0B'

// Interactive geometry drawing: points, segments, polygons, circles, right-angle marks and angle arcs.
function Diagram({ spec, focus = [] }) {
  const [hover, setHover] = useState('')
  const list = (spec.points || []).filter((p) => p?.name && Number.isFinite(+p.x) && Number.isFinite(+p.y))
  const pts = Object.fromEntries(list.map((p) => [p.name, { ...p, x: +p.x, y: +p.y }]))
  const circles = (spec.circles || []).filter((c) => pts[c.center] && Number.isFinite(+c.r))
  const xs = list.map((p) => pts[p.name].x), ys = list.map((p) => pts[p.name].y)
  circles.forEach((c) => { const o = pts[c.center]; xs.push(o.x - c.r, o.x + c.r); ys.push(o.y - c.r, o.y + c.r) })
  if (!xs.length) return null
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const span = Math.max(maxX - minX, maxY - minY, 1), pad = span * 0.22, u = span / 100
  const W = maxX - minX + 2 * pad, H = maxY - minY + 2 * pad
  const X = (x) => x - minX + pad, Y = (y) => maxY - y + pad
  const on = (k) => focus.includes(k) || hover === k
  const cx = list.reduce((a, p) => a + pts[p.name].x, 0) / Math.max(list.length, 1)
  const cy = list.reduce((a, p) => a + pts[p.name].y, 0) / Math.max(list.length, 1)
  const sz = 6 * u

  const hov = (k) => ({ onMouseEnter: () => setHover(k), onMouseLeave: () => setHover('') })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-h-80" role="img" aria-label="geometry diagram">
      {(spec.polygons || []).map((poly, i) => poly.every((n) => pts[n]) && (
        <polygon key={i} points={poly.map((n) => `${X(pts[n].x)},${Y(pts[n].y)}`).join(' ')}
          fill={on(poly.join('')) ? 'rgba(245,158,11,.18)' : 'rgba(148,163,184,.08)'} stroke={on(poly.join('')) ? FOCUS : CHALK}
          strokeWidth={u * 0.9} strokeLinejoin="round" />
      ))}
      {circles.map((c, i) => (
        <g key={i}>
          <circle cx={X(pts[c.center].x)} cy={Y(pts[c.center].y)} r={c.r} fill="none" stroke={on(c.center) ? FOCUS : CHALK} strokeWidth={u * 0.9} />
          {c.label && <text x={X(pts[c.center].x) + c.r * 0.7} y={Y(pts[c.center].y) - c.r * 0.7} fontSize={sz * 0.85} fill={CHALK}>{c.label}</text>}
        </g>
      ))}
      {(spec.segments || []).map((sg, i) => {
        const a = pts[sg.from], b = pts[sg.to]
        if (!a || !b) return null
        const k = sg.from + sg.to, k2 = sg.to + sg.from
        const hot = on(k) || on(k2)
        return (
          <g key={i} {...hov(k)} style={{ cursor: 'pointer' }}>
            <line x1={X(a.x)} y1={Y(a.y)} x2={X(b.x)} y2={Y(b.y)} stroke="transparent" strokeWidth={u * 5} />
            <line x1={X(a.x)} y1={Y(a.y)} x2={X(b.x)} y2={Y(b.y)} stroke={hot ? FOCUS : CHALK} strokeWidth={u * (hot ? 1.7 : 0.9)} strokeLinecap="round" />
            {sg.label && <text x={(X(a.x) + X(b.x)) / 2} y={(Y(a.y) + Y(b.y)) / 2 - 2 * u} fontSize={sz * 0.85} fill={hot ? FOCUS : CHALK} textAnchor="middle">{sg.label}</text>}
          </g>
        )
      })}
      {(spec.rightAngles || []).map((r, i) => {
        const o = pts[r.at], a = pts[r.a], b = pts[r.b]
        if (!o || !a || !b) return null
        const d = (p) => { const dx = X(p.x) - X(o.x), dy = Y(p.y) - Y(o.y), l = Math.hypot(dx, dy) || 1; return [(dx / l) * sz * 0.8, (dy / l) * sz * 0.8] }
        const [ax, ay] = d(a), [bx, by] = d(b), ox = X(o.x), oy = Y(o.y)
        return <path key={i} d={`M${ox + ax},${oy + ay} L${ox + ax + bx},${oy + ay + by} L${ox + bx},${oy + by}`} fill="none" stroke={CHALK} strokeWidth={u * 0.7} />
      })}
      {(spec.angles || []).map((g, i) => {
        const o = pts[g.at], a = pts[g.a], b = pts[g.b]
        if (!o || !a || !b) return null
        const ox = X(o.x), oy = Y(o.y), a1 = Math.atan2(Y(a.y) - oy, X(a.x) - ox), a2 = Math.atan2(Y(b.y) - oy, X(b.x) - ox)
        let d = a2 - a1
        while (d > Math.PI) d -= 2 * Math.PI
        while (d <= -Math.PI) d += 2 * Math.PI
        const r = sz * 1.6, am = a1 + d / 2
        const pt = (ang, rad) => `${ox + rad * Math.cos(ang)},${oy + rad * Math.sin(ang)}`
        const hot = on(g.at)
        return (
          <g key={i}>
            <path d={`M${pt(a1, r)} A${r},${r} 0 0 ${d > 0 ? 1 : 0} ${pt(a2, r)}`} fill="none" stroke={hot ? FOCUS : CHALK} strokeWidth={u * 0.8} />
            {g.label && <text x={ox + r * 1.75 * Math.cos(am)} y={oy + r * 1.75 * Math.sin(am) + sz * 0.3} fontSize={sz * 0.8} textAnchor="middle" fill={hot ? FOCUS : CHALK}>{g.label}</text>}
          </g>
        )
      })}
      {list.map((p) => {
        const q = pts[p.name], dx = q.x - cx, dy = q.y - cy, l = Math.hypot(dx, dy) || 1
        const hot = on(p.name)
        return (
          <g key={p.name} {...hov(p.name)} style={{ cursor: 'pointer' }}>
            <circle cx={X(q.x)} cy={Y(q.y)} r={u * (hot ? 2 : 1.3)} fill={hot ? FOCUS : CHALK} />
            <text x={X(q.x) + (dx / l) * sz * 1.2} y={Y(q.y) - (dy / l) * sz * 1.2 + sz * 0.35} fontSize={sz} fontWeight="700" fill={hot ? FOCUS : CHALK} textAnchor="middle">{p.name}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ---- function graphs (Premium / VIP): expressions are whitelisted before being compiled ----
function compile(expr) {
  let src = String(expr).toLowerCase().replace(/\s+/g, '').replace(/×/g, '*').replace(/·/g, '*')
  src = src.replace(/(\d)(x|\()/g, '$1*$2').replace(/(x|\))(\d|\(|x)/g, '$1*$2').replace(/\^/g, '**')
  const body = src.replace(/\b(sin|cos|tan|sqrt|abs|ln|log|exp|pi|e)\b/g, (m) =>
    ({ pi: 'Math.PI', e: 'Math.E', ln: 'Math.log', log: 'Math.log10' }[m] || 'Math.' + m))
  const rest = body.replace(/Math\.(PI|E|log10|log|sin|cos|tan|sqrt|abs|exp)/g, '')
  if (/[^0-9x+\-*/().,]/.test(rest)) return null
  try { const f = new Function('x', `return (${body})`); f(1); return f } catch { return null }
}
const COLORS = ['#38bdf8', '#a78bfa', '#34d399']

function Graph({ spec }) {
  const fns = (spec.functions || []).map((f) => ({ ...f, fn: compile(f.expr) })).filter((f) => f.fn)
  if (!fns.length) return null
  const x0 = Number(spec.xmin ?? -5), x1 = Number(spec.xmax ?? 5), sx = x1 - x0
  if (!(sx > 0)) return null
  const N = 240
  const lines = fns.map((f) => Array.from({ length: N + 1 }, (_, i) => {
    const x = x0 + (sx * i) / N
    let y; try { y = f.fn(x) } catch { y = NaN }
    return [x, Number.isFinite(y) ? y : null]
  }))
  const pts = (spec.points || []).filter((p) => Number.isFinite(+p.x) && Number.isFinite(+p.y))
  const ys = [...lines.flat().map((p) => p[1]).filter((v) => v !== null), ...pts.map((p) => +p.y), 0]
  let y0 = Math.max(Math.min(...ys), -4 * sx), y1 = Math.min(Math.max(...ys), 4 * sx)
  if (y1 - y0 < 1e-6) { y0 -= 1; y1 += 1 }
  const pd = (y1 - y0) * 0.1; y0 -= pd; y1 += pd
  const W = 400, H = 260, m = 24
  const X = (x) => m + ((x - x0) / sx) * (W - 2 * m), Y = (y) => H - m - ((y - y0) / (y1 - y0)) * (H - 2 * m)
  const step = (r) => (r <= 10 ? 1 : r <= 20 ? 2 : Math.ceil(r / 10))
  const ticks = (a, b) => { const st = step(b - a), out = []; for (let v = Math.ceil(a / st) * st; v <= b; v += st) out.push(v); return out }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-h-80" role="img" aria-label="function graph">
      {ticks(x0, x1).map((v) => <g key={'x' + v}><line x1={X(v)} x2={X(v)} y1={m / 2} y2={H - m / 2} stroke="currentColor" opacity=".12" /><text x={X(v)} y={Y(0) + 11} fontSize="9" textAnchor="middle" fill="currentColor" opacity=".7">{v !== 0 ? v : ''}</text></g>)}
      {ticks(y0, y1).map((v) => <g key={'y' + v}><line y1={Y(v)} y2={Y(v)} x1={m / 2} x2={W - m / 2} stroke="currentColor" opacity=".12" /><text y={Y(v) + 3} x={X(0) - 4} fontSize="9" textAnchor="end" fill="currentColor" opacity=".7">{v !== 0 ? v : ''}</text></g>)}
      <line x1={m / 2} x2={W - m / 2} y1={Y(0)} y2={Y(0)} stroke="currentColor" strokeWidth="1.2" />
      <line y1={m / 2} y2={H - m / 2} x1={X(0)} x2={X(0)} stroke="currentColor" strokeWidth="1.2" />
      {lines.map((pl, i) => {
        let d = '', pen = false
        pl.forEach(([x, y]) => {
          if (y === null || y < y0 || y > y1) { pen = false; return }
          d += `${pen ? 'L' : 'M'}${X(x).toFixed(1)},${Y(y).toFixed(1)} `; pen = true
        })
        return <path key={i} d={d} fill="none" stroke={COLORS[i % 3]} strokeWidth="2" strokeLinejoin="round" />
      })}
      {fns.map((f, i) => f.label && <text key={i} x={W - m} y={m + i * 13} fontSize="10" textAnchor="end" fill={COLORS[i % 3]}>{f.label}</text>)}
      {pts.map((p, i) => <g key={i}><circle cx={X(+p.x)} cy={Y(+p.y)} r="3.5" fill={FOCUS} /><text x={X(+p.x) + 6} y={Y(+p.y) - 6} fontSize="10" fontWeight="700" fill={FOCUS}>{p.label}</text></g>)}
    </svg>
  )
}

export default function Board({ lang, data, step }) {
  const t = T[lang]
  const s = data.steps?.[step]
  const showDiagram = data.is_geometry === true && data.geometry_svg_or_coords // hidden for every non-geometry problem
  return (
    <section className="board rounded-2xl p-5 md:p-6 text-slate-100 bg-slate-900 border-4 border-slate-700 shadow-inner" aria-label={t.board}>
      <h3 className="font-bold mb-3 text-slate-300">🧑‍🏫 {t.board}</h3>
      <div className="text-2xl overflow-x-auto no-scrollbar"><Tex tex={data.problem} block /></div>
      {showDiagram && <Safe><div className="mt-3"><Diagram spec={data.geometry_svg_or_coords} focus={s?.focus || []} /></div></Safe>}
      {data.graph && <Safe><div className="mt-3"><Graph spec={data.graph} /></div></Safe>}
      {s && (
        <div className="mt-3 pt-3 border-t border-dashed border-slate-600 text-xl overflow-x-auto no-scrollbar">
          <span className="text-sm text-slate-400 mr-2">{step + 1}/{data.steps.length}</span>
          <Tex tex={s.latex} block />
        </div>
      )}
    </section>
  )
}
