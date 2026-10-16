import { useMemo, useState } from 'react';
import { CONFIG, pastContracts, parseResultCode } from './engine';
import { Card } from './ui';

/**
 * The room chart. Paste every student's result code, one per line. Each row is one
 * student's 80% interval with their outcome marked; the past contracts sit behind
 * everyone as a band. The point is the pattern across rows, not any one row.
 */
export default function Room({ initialText = '' }) {
  const c = CONFIG;
  const past = pastContracts();
  const [text, setText] = useState(initialText);

  const rows = useMemo(() => text.split(/\n+/).map(parseResultCode).filter(Boolean), [text]);
  const bad = useMemo(() => text.split(/\n+/).filter((l) => l.trim() && !parseResultCode(l)).length, [text]);

  const n = rows.length;
  const held = rows.filter((r) => r.outcome >= r.low && r.outcome <= r.high).length;
  const late = rows.filter((r) => r.outcome > r.high).length;
  const early = rows.filter((r) => r.outcome < r.low).length;
  const meanConf = n ? rows.reduce((a, r) => a + r.onTimeChance, 0) / n : 0;
  const onTime = rows.filter((r) => r.delivered && r.outcome <= c.deadline).length;
  const outsideHeld = rows.filter((r) => r.outcome >= past.p10 && r.outcome <= past.p90).length;
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
  const gaps = rows.filter((r) => r.ninetyWeek).map((r) => r.outcome - r.ninetyWeek);

  const min = 6;
  const max = Math.max(22, ...rows.map((r) => Math.ceil(Math.max(r.outcome, r.high))));
  const x = (w) => `${((Math.min(max, Math.max(min, w)) - min) / (max - min)) * 100}%`;
  const sorted = [...rows].sort((a, b) => a.week - b.week || a.outcome - b.outcome);
  const seeds = [...new Set(rows.map((r) => r.seed))];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-white">The room</h1>
        <p className="text-sm text-slate-400">Paste every result code, one per line.</p>
      </header>

      <textarea
        value={text} onChange={(e) => setText(e.target.value)} rows={5}
        placeholder="BLP1|…"
        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 font-mono text-xs text-slate-200"
      />
      {bad > 0 && <p className="text-xs text-rose-400">{bad} line{bad > 1 ? 's' : ''} not recognised.</p>}
      {seeds.length > 1 && <p className="text-xs text-amber-300">These codes come from {seeds.length} different scenarios. Compare within one scenario if you can.</p>}

      {n > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card><div className="text-3xl font-bold font-mono text-white">{Math.round((100 * held) / n)}%</div><div className="text-xs text-slate-400">of 80% ranges held (should be 80%)</div></Card>
            <Card><div className="text-3xl font-bold font-mono text-rose-300">{late} of {n - held}</div><div className="text-xs text-slate-400">misses were late{early ? ` (${early} early)` : ''}</div></Card>
            <Card><div className="text-3xl font-bold font-mono text-white">{Math.round(meanConf)}% → {Math.round((100 * onTime) / n)}%</div><div className="text-xs text-slate-400">said they'd make week {c.deadline} → did</div></Card>
            <Card><div className="text-3xl font-bold font-mono text-amber-300">{Math.round((100 * outsideHeld) / n)}%</div><div className="text-xs text-slate-400">landed inside the past contracts' range</div></Card>
          </div>

          <Card title={`Every forecast against what happened (n = ${n})`}>
            <div className="relative">
              <div className="absolute inset-y-0 bg-amber-500/10 border-x border-amber-500/30" style={{ left: x(past.p10), width: `calc(${x(past.p90)} - ${x(past.p10)})` }} />
              <div className="absolute inset-y-0 border-l-2 border-dashed border-rose-400/60" style={{ left: x(c.deadline) }} />
              <div className="relative space-y-1.5 py-2">
                {sorted.map((r, i) => {
                  const ok = r.outcome >= r.low && r.outcome <= r.high;
                  return (
                    <div key={i} className="relative h-4" title={`${r.name || 'student'}: said ${r.week} (${r.low}–${r.high}), accepted ${r.outcome}`}>
                      <div className="absolute top-1.5 h-1 rounded bg-emerald-400/70" style={{ left: x(r.low), width: `calc(${x(r.high)} - ${x(r.low)})` }} />
                      <div className="absolute top-0.5 w-0.5 h-3 bg-emerald-300" style={{ left: x(r.week) }} />
                      <div className={`absolute top-0 w-4 h-4 -ml-2 rounded-full border-2 ${ok ? 'bg-emerald-400 border-emerald-200' : 'bg-rose-500 border-rose-200'}`} style={{ left: x(r.outcome) }} />
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="relative h-4 text-[10px] text-slate-500 font-mono mt-1">
              {Array.from({ length: Math.floor((max - min) / 2) + 1 }, (_, i) => min + i * 2).map((w) => (
                <span key={w} className="absolute -translate-x-1/2" style={{ left: x(w) }}>{w}</span>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Green bar: each student's 80% range. Dot: the week the customer accepted it (red if outside the range).
              Amber band: where most past contracts landed. Dashed line: the deadline.
            </p>
          </Card>

          <Card>
            <p className="text-sm text-slate-300">
              Median forecast <strong className="text-emerald-300">week {med(rows.map((r) => r.week))}</strong> · median outcome{' '}
              <strong className="text-amber-300">week {med(rows.map((r) => r.outcome))}</strong> · past contracts' median{' '}
              <strong className="text-amber-300">week {past.median}</strong>
              {gaps.length > 0 && <> · from "90% done" to accepted: <strong className="text-sky-300">{med(gaps)} weeks</strong> (median)</>}
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
