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

export default function Board({ lang, data, step }) {
  const t = T[lang]
  const s = data.steps?.[step]
  const showDiagram = data.is_geometry === true && data.geometry_svg_or_coords // hidden for every non-geometry problem
  return (
    <section className="board rounded-2xl p-5 md:p-6 text-slate-100 bg-slate-900 border-4 border-slate-700 shadow-inner" aria-label={t.board}>
      <h3 className="font-bold mb-3 text-slate-300">🧑‍🏫 {t.board}</h3>
      <div className="text-2xl overflow-x-auto"><Tex tex={data.problem} block /></div>
      {showDiagram && <Safe><div className="mt-3"><Diagram spec={data.geometry_svg_or_coords} focus={s?.focus || []} /></div></Safe>}
      {s && (
        <div className="mt-3 pt-3 border-t border-dashed border-slate-600 text-xl overflow-x-auto">
          <span className="text-sm text-slate-400 mr-2">{step + 1}/{data.steps.length}</span>
          <Tex tex={s.latex} block />
        </div>
      )}
    </section>
  )
}
