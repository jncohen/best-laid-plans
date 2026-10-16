// Small shared UI pieces.

export function Card({ title, children, tone = 'slate', className = '' }) {
  const border = {
    slate: 'border-slate-800',
    amber: 'border-amber-500/40',
    sky: 'border-sky-500/40',
    emerald: 'border-emerald-500/40',
    rose: 'border-rose-500/40',
  }[tone];
  return (
    <section className={`bg-slate-900 border ${border} rounded-2xl p-4 sm:p-5 ${className}`}>
      {title && <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">{title}</h2>}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone = 'text-white' }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-lg font-bold font-mono ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

export function Slider({ label, value, min, max, step = 1, onChange, format = (v) => v, hint }) {
  return (
    <label className="block">
      <div className="flex justify-between items-baseline text-sm mb-1">
        <span className="text-slate-300">{label}</span>
        <span className="font-mono font-bold text-white">{format(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full accent-amber-400 h-2"
      />
      {hint && <div className="text-[11px] text-slate-500 mt-1">{hint}</div>}
    </label>
  );
}

/** A strip of dots: one per past contract, on a week axis, with the deadline marked. */
export function DotStrip({ weeks, deadline, min = 8, max = 22, highlight = [] }) {
  const span = max - min;
  const x = (w) => `${((Math.min(max, Math.max(min, w)) - min) / span) * 100}%`;
  // Stack dots that share a week so every contract is visible.
  const counts = {};
  const dots = [...weeks].sort((a, b) => a - b).map((w) => {
    const key = Math.round(w * 2) / 2;
    counts[key] = (counts[key] || 0) + 1;
    return { w, level: counts[key] - 1 };
  });
  const height = Math.max(...Object.values(counts), 1) * 9 + 12;
  return (
    <div>
      <div className="relative" style={{ height }}>
        <div className="absolute top-0 bottom-3 border-l-2 border-dashed border-rose-400/70" style={{ left: x(deadline) }} />
        {dots.map((d, i) => (
          <span
            key={i}
            className={`absolute w-2 h-2 rounded-full -translate-x-1/2 ${d.w <= deadline ? 'bg-emerald-400' : 'bg-slate-400'}`}
            style={{ left: x(d.w), bottom: 12 + d.level * 9 }}
          />
        ))}
        {highlight.map((h, i) => (
          <span key={`h${i}`} className="absolute -translate-x-1/2 text-[10px] font-bold text-amber-300" style={{ left: x(h.week), bottom: 0 }}>
            ▲
          </span>
        ))}
      </div>
      <div className="relative h-4 text-[10px] text-slate-500 font-mono">
        {Array.from({ length: Math.floor(span / 2) + 1 }, (_, i) => min + i * 2).map((w) => (
          <span key={w} className="absolute -translate-x-1/2" style={{ left: x(w) }}>{w}</span>
        ))}
      </div>
    </div>
  );
}
