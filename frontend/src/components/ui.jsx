// Small shared pieces: avatar, plan badge, logo.
export function Avatar({ name = '?', size = 36, className = '' }) {
  const hue = [...String(name)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 360, 7)
  return (
    <span aria-hidden="true" className={`inline-grid shrink-0 place-items-center rounded-full font-bold text-white ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.42, background: `linear-gradient(135deg, hsl(${hue} 80% 56%), hsl(${(hue + 50) % 360} 80% 48%))` }}>
      {String(name).trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

export function PlanBadge({ plan, className = '' }) {
  if (!plan || plan === 'free') return null
  const style = plan === 'vip' ? 'from-fuchsia-500 to-rose-500' : 'from-amber-400 to-orange-500'
  return <span className={`rounded-md bg-gradient-to-r ${style} px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white ${className}`}>{plan}</span>
}

export function Logo({ size = 36 }) {
  return (
    <span aria-hidden="true" className="inline-grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 font-display font-extrabold text-white shadow-lg shadow-indigo-600/30"
      style={{ width: size, height: size, fontSize: size * 0.55 }}>∑</span>
  )
}
