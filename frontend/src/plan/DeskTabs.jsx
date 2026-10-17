// The Decision Desk's tool tabs. Each is a generic replica of a dashboard genre, fed
// only by desk.js, which sees only what the briefing shows.
import { useState } from 'react';
import {
  statusReport, sprintBurndown, costManagement, schedule, lessonsLearned, teamChat, expertPanel, predictionMarket, aiAssistant,
  industryBenchmark, scenarios, riskRegister, analytics, riskSimulator, consensus, FORECASTERS, FORECASTER_NAMES, tabById,
} from './desk.js';
import { pastContracts, describePlan } from './engine';
import { Card } from './ui';
import { money } from './format';
import Records from './Records';
import { readTrack } from './track';

const TONE = {
  inside: { border: 'sky', text: 'text-sky-300', fill: '#38bdf8', soft: 'bg-sky-500/15', ring: 'border-sky-500/50' },
  record: { border: 'amber', text: 'text-amber-300', fill: '#fbbf24', soft: 'bg-amber-500/15', ring: 'border-amber-500/50' },
  people: { border: 'violet', text: 'text-violet-300', fill: '#a78bfa', soft: 'bg-violet-500/15', ring: 'border-violet-500/50' },
  front: { border: 'slate', text: 'text-white', fill: '#e2e8f0', soft: 'bg-slate-800', ring: 'border-slate-600' },
};
const toneOf = (id) => TONE[tabById(id)?.tone || 'front'];

const W = 600;
const FRAME_NAMES = { pace: 'the pace', deadline: 'the deadline', blend: 'a blend of pace and record', record: 'the record' };
const svgText = { fontSize: 11, fill: '#94a3b8' };

/** Sees · can't see, the tab's honest label. */
function Label({ tab }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-xs mb-3">
      <div className="bg-slate-950 rounded-lg px-3 py-2"><div className="text-[10px] uppercase tracking-wider text-slate-500">Sees</div><div className="text-slate-200">{tab.sees}</div></div>
      <div className="bg-slate-950 rounded-lg px-3 py-2"><div className="text-[10px] uppercase tracking-wider text-slate-500">Can't see</div><div className="text-slate-200">{tab.cant}</div></div>
    </div>
  );
}

/** The forecast a tab produces, and the button that copies it to the front tab. */
export function ForecastTile({ f, tone, onUse, label = 'This tool says' }) {
  if (!f) return null;
  return (
    <div className={`rounded-xl border ${tone.ring} ${tone.soft} p-3 mt-3`}>
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mt-1">
        <div><span className={`text-2xl font-bold font-mono ${tone.text}`}>week {f.week}</span></div>
        <div className="text-sm text-slate-200">80% range <span className="font-mono">{f.low}–{f.high}</span></div>
        <div className="text-sm text-slate-200">week 12: <span className="font-mono">{f.chance}%</span></div>
      </div>
      {onUse && (
        <button type="button" onClick={onUse} className="mt-2 w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold">
          Use this on my prediction
        </button>
      )}
    </div>
  );
}

function Frame({ id, kind, children, f, onUse, planNote }) {
  const tab = tabById(id);
  const tone = toneOf(id);
  return (
    <Card title={`${tab.name} · ${kind}`} tone={tone.border}>
      <Label tab={tab} />
      {planNote}
      {children}
      {tab.forecasts && f !== undefined && <ForecastTile f={f} tone={tone} onUse={f ? () => onUse(id, f) : null} />}
    </Card>
  );
}

const Tile = ({ label, value, sub, tone = 'text-white' }) => (
  <div className="bg-slate-950 rounded-lg p-2 min-w-0">
    <div className="text-[10px] uppercase tracking-wider text-slate-500 truncate">{label}</div>
    <div className={`text-lg font-bold font-mono ${tone}`}>{value}</div>
    {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
  </div>
);

// ── The mind's own frames ────────────────────────────────────────────────────
function StatusTab({ S, onUse }) {
  const st = statusReport(S);
  const R = S.rules;
  const light = { green: 'bg-emerald-400', amber: 'bg-amber-400', red: 'bg-rose-500' }[st.light];
  // Burn-up: cumulative reported units for the weeks shown, then the projection at the same pace.
  const cum = S.history.reduce((a, v) => [...a, a[a.length - 1] + v], [0]);
  const end = Math.max(R.deadline, Math.ceil(st.weeksAtPace)) + 1, h = 170;
  const x = (w) => 36 + (w / end) * (W - 48), y = (u) => 14 + (1 - u / (R.scope * 1.05)) * (h - 38);
  return (
    <Frame id="status" kind="executive dashboard" f={st.forecast} onUse={onUse}>
      <div className="flex items-center gap-3 mb-3">
        <span className={`w-10 h-10 rounded-full ${light} shadow-lg shrink-0`} aria-label={`status ${st.light}`} />
        <div>
          <div className="text-lg font-bold text-white uppercase">{st.light}: on schedule</div>
          <div className="text-xs text-slate-400">Week {st.weeksShown} of the last contract's line · reported complete {Math.round((100 * st.built) / R.scope)}% vs plan {Math.round((100 * st.planned) / R.scope)}%</div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Tile label="% complete" value={`${Math.round((100 * st.built) / R.scope)}%`} tone="text-sky-300" />
        <Tile label="SPI" value={st.spi} sub="schedule" tone="text-sky-300" />
        <Tile label="CPI" value={st.cpi} sub="cost" tone="text-sky-300" />
        <Tile label="Pace" value={st.pace} sub="units/wk" tone="text-sky-300" />
      </div>
      <svg viewBox={`0 0 ${W} ${h}`} width="100%" className="mt-3" role="img" aria-label="Burn-up chart">
        <line x1={x(0)} y1={y(R.scope)} x2={x(end)} y2={y(R.scope)} stroke="#475569" strokeDasharray="3 3" />
        <text x={x(0) + 4} y={y(R.scope) - 4} {...svgText}>scope {R.scope}</text>
        <line x1={x(0)} y1={y(0)} x2={x(R.deadline)} y2={y(R.scope)} stroke="#64748b" strokeWidth="1.5" />
        <text x={x(R.deadline) - 4} y={y(R.scope) + 14} textAnchor="end" {...svgText}>plan</text>
        <line x1={x(R.deadline)} x2={x(R.deadline)} y1={10} y2={h - 22} stroke="#fb7185" strokeDasharray="4 3" />
        <line x1={x(st.weeksShown)} y1={y(st.built)} x2={x(st.weeksAtPace)} y2={y(R.scope)} stroke="#38bdf8" strokeDasharray="5 4" strokeWidth="2" />
        <polyline points={cum.map((u, w) => `${x(w)},${y(u)}`).join(' ')} fill="none" stroke="#38bdf8" strokeWidth="3" />
        <text x={x(st.weeksAtPace) + 4} y={y(R.scope) + 14} fill="#7dd3fc" fontSize="11">done wk {st.weeksAtPace}</text>
        {Array.from({ length: Math.floor(end / 2) + 1 }, (_, i) => i * 2).map((w) => <text key={w} x={x(w)} y={h - 6} textAnchor="middle" {...svgText}>{w}</text>)}
      </svg>
      <p className="text-[11px] text-slate-500">Earned value counts units reported complete. Green means reported progress is ahead of plan.</p>
    </Frame>
  );
}

function BurndownTab({ S, onUse }) {
  const b = sprintBurndown(S);
  const R = S.rules;
  const left = S.history.reduce((a, v) => [...a, a[a.length - 1] - v], [R.scope]);
  const end = Math.max(R.deadline, b.forecast.week) + 1, h = 170;
  const x = (w) => 36 + (w / end) * (W - 48), y = (u) => 14 + (1 - u / R.scope) * (h - 38);
  const proj = (R.scope - (R.scope - left[left.length - 1])) / b.velocity + S.history.length;
  return (
    <Frame id="burndown" kind="agile burndown" f={b.forecast} onUse={onUse}>
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Velocity" value={b.velocity} sub="points/sprint" tone="text-sky-300" />
        <Tile label="Remaining" value={Math.round(left[left.length - 1])} sub={`after sprint ${S.history.length}`} />
        <Tile label="Projected done" value={`sprint ${b.forecast.week}`} tone="text-sky-300" />
      </div>
      <svg viewBox={`0 0 ${W} ${h}`} width="100%" className="mt-3" role="img" aria-label="Burndown chart">
        <line x1={x(0)} y1={y(R.scope)} x2={x(R.deadline)} y2={y(0)} stroke="#64748b" strokeDasharray="3 3" />
        <text x={x(R.deadline)} y={y(0) - 6} textAnchor="end" {...svgText}>ideal</text>
        <line x1={x(R.deadline)} x2={x(R.deadline)} y1={10} y2={h - 22} stroke="#fb7185" strokeDasharray="4 3" />
        <polyline points={left.map((u, w) => `${x(w)},${y(u)}`).join(' ')} fill="none" stroke="#38bdf8" strokeWidth="3" />
        <line x1={x(S.history.length)} y1={y(left[left.length - 1])} x2={x(proj)} y2={y(0)} stroke="#38bdf8" strokeDasharray="5 4" strokeWidth="2" />
        {S.history.map((v, i) => <rect key={i} x={x(i + 1) - 6} y={y(0) - (v / R.scope) * (h - 38)} width="12" height={(v / R.scope) * (h - 38)} fill="#38bdf8" fillOpacity="0.25" />)}
        {Array.from({ length: Math.floor(end / 2) + 1 }, (_, i) => i * 2).map((w) => <text key={w} x={x(w)} y={h - 6} textAnchor="middle" {...svgText}>{w}</text>)}
      </svg>
      <p className="text-[11px] text-slate-500">One sprint = one week; one point = one unit built. Bars: velocity per sprint, fastest {b.fast.toFixed(1)}, slowest {b.slow.toFixed(1)}.</p>
    </Frame>
  );
}

function CostTab({ S, plan, onUse, planNote }) {
  const c = costManagement(S, plan);
  const R = S.rules;
  const end = R.horizon, h = 180;
  const top = Math.max(c.limit, c.burn[c.burn.length - 1].spent) * 1.05;
  const x = (w) => 44 + (w / end) * (W - 56), y = (v) => 12 + (1 - v / top) * (h - 36);
  const m = (v) => `$${(v / 1e6).toFixed(1)}M`;
  return (
    <Frame id="cost" kind="project cost control" f={c.forecast} onUse={onUse} planNote={planNote}>
      <div className="grid grid-cols-4 gap-2">
        <Tile label="Budget (BAC)" value={m(c.cost.bac)} />
        <Tile label="Est. at completion" value={m(c.cost.eac)} sub="EAC" tone="text-sky-300" />
        <Tile label="CPI" value={c.cost.cpi} sub="BAC ÷ EAC" tone="text-sky-300" />
        <Tile label="Cash runway" value={`${c.runwayWeeks} wk`} sub={`at ${money(c.perWeek)}/wk`} tone="text-sky-300" />
      </div>
      <p className="text-sm text-slate-300 mt-3">
        Spend to date: <span className="font-mono">$0</span> of {money(c.budget)}, plus a {money(c.creditLine)} credit line.
        Your plan costs {money(c.cost.eac)} if it finishes when the Schedule says (week {c.forecast.week}):{' '}
        <strong className={c.onBudget ? 'text-sky-300' : 'text-rose-300'}>{c.onBudget ? `${money(c.cost.vac)} under budget` : `${money(-c.cost.vac)} over budget`}</strong>.
      </p>
      <svg viewBox={`0 0 ${W} ${h}`} width="100%" className="mt-3" role="img" aria-label="Cumulative spend against the budget and the bankruptcy line">
        <line x1={x(0)} x2={x(end)} y1={y(c.budget)} y2={y(c.budget)} stroke="#64748b" strokeDasharray="3 3" />
        <text x={x(0) + 4} y={y(c.budget) - 4} {...svgText}>budget {m(c.budget)}</text>
        <line x1={x(0)} x2={x(end)} y1={y(c.limit)} y2={y(c.limit)} stroke="#fb7185" strokeWidth="1.5" />
        <text x={x(end) - 4} y={y(c.limit) - 4} textAnchor="end" fontSize="11" fill="#fda4af">bankruptcy: budget + credit line</text>
        <line x1={x(R.deadline)} x2={x(R.deadline)} y1={8} y2={h - 22} stroke="#fb7185" strokeDasharray="4 3" />
        <polyline points={[[0, 0], ...c.burn.map((b) => [b.week, b.spent])].map(([w, v]) => `${x(w)},${y(v)}`).join(' ')} fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="5 4" />
        <polyline points={[[0, 0], ...c.burn.slice(0, c.forecast.week).map((b) => [b.week, b.spent])].map(([w, v]) => `${x(w)},${y(v)}`).join(' ')} fill="none" stroke="#38bdf8" strokeWidth="3" />
        {c.brokeWeek && <circle cx={x(c.brokeWeek)} cy={y(c.limit)} r="5" fill="#fb7185" />}
        {[0, 4, 8, 12, 16, 20].map((w) => <text key={w} x={x(w)} y={h - 6} textAnchor="middle" {...svgText}>{w}</text>)}
      </svg>
      <p className="text-[11px] text-slate-500">
        Solid: planned spend to the Schedule's finish. Dashed: the same burn if the work runs on.
        {c.brokeWeek ? ` At this burn rate the money runs out in week ${c.brokeWeek}: past the credit line the company can't make payroll and goes bankrupt.` : ` At this burn rate the money lasts past week ${R.horizon}.`}
      </p>
      <ul className="mt-2 space-y-1 text-xs text-slate-300">
        {c.lines.map((l) => <li key={l.label} className="flex justify-between"><span>{l.label}</span><span className="font-mono">{money(l.amount)}</span></li>)}
      </ul>
      <p className="text-[11px] text-slate-500 mt-2">The schedule forecast below is the one this spend plan assumes, the Schedule's. Cost control sees money, not defects.</p>
    </Frame>
  );
}

function ScheduleTab({ S, plan, onUse, planNote }) {
  const s = schedule(S, plan);
  const R = S.rules;
  const end = Math.max(R.deadline, s.forecast.week) + 1;
  const rows = [
    ['Build', 1, s.forecast.week, '#38bdf8'],
    ...(plan.crews > 0 ? [['Onboard new crews', 1, R.onboardingWeeks, '#7dd3fc']] : []),
    ...(plan.inspect > 0 ? [[`Inspect ${Math.round(plan.inspect * 100)}%`, 1, s.forecast.week, '#0ea5e9']] : []),
    ...(plan.shift !== 'none' ? [['Second shift', plan.shift === 'every' ? 1 : 9, plan.shift === 'every' ? s.forecast.week : Math.min(11, s.forecast.week), '#bae6fd']] : []),
  ];
  const rowH = 26, h = rows.length * rowH + 52;
  const x = (w) => 120 + (w / end) * (W - 132);
  return (
    <Frame id="schedule" kind="Gantt chart" f={s.forecast} onUse={onUse} planNote={planNote}>
      <svg viewBox={`0 0 ${W} ${h}`} width="100%" role="img" aria-label="Gantt chart of your plan">
        {Array.from({ length: end }, (_, i) => i + 1).map((w) => <g key={w}><line x1={x(w - 1)} x2={x(w - 1)} y1={8} y2={h - 22} stroke="#1e293b" /><text x={x(w - 0.5)} y={h - 6} textAnchor="middle" {...svgText}>{w}</text></g>)}
        {rows.map(([label, a, b, color], i) => (
          <g key={label}>
            <text x={4} y={20 + i * rowH + 4} fontSize="12" fill="#e2e8f0">{label}</text>
            <rect x={x(a - 1)} y={10 + i * rowH} width={Math.max(4, x(b) - x(a - 1))} height={16} rx="3" fill={color} fillOpacity="0.8" />
          </g>
        ))}
        <g transform={`translate(${x(s.forecast.week)},${20 + rows.length * rowH})`}><rect x={-7} y={-7} width={14} height={14} transform="rotate(45)" fill="#38bdf8" /></g>
        <text x={4} y={24 + rows.length * rowH} fontSize="12" fill="#e2e8f0">Acceptance</text>
        <line x1={x(R.deadline)} x2={x(R.deadline)} y1={4} y2={h - 22} stroke="#fb7185" strokeDasharray="4 3" />
      </svg>
      <p className="text-[11px] text-slate-500">Finish milestone: week {s.forecast.week}. Built from the briefing's pace and stated rules, one week at a time.</p>
    </Frame>
  );
}

function LessonsTab({ S, onUse }) {
  const L = lessonsLearned(S);
  return (
    <Frame id="lessons" kind="after-action review" f={L.forecast} onUse={onUse}>
      <div className="space-y-3 text-sm text-slate-300">
        <div><div className="text-xs font-bold uppercase tracking-wider text-amber-300">What happened</div>
          <p>Same line, same {S.rules.crews} crews, built flat out with no inspection. The dashboard showed {L.pace} units a week and read 100% in week {L.dashboardFullWeek}.</p></div>
        <div><div className="text-xs font-bold uppercase tracking-wider text-amber-300">What went wrong</div>
          <p>The customer's acceptance test rejected <span className="text-rose-300 font-semibold">{L.rejected} units</span>. Fixing them that late took twice the work. The contract was accepted in week {L.deliveredWeek}, {L.deliveredWeek - L.dashboardFullWeek} weeks after the dashboard said done.</p></div>
        <div><div className="text-xs font-bold uppercase tracking-wider text-amber-300">Lessons</div>
          <ul className="list-disc pl-5 space-y-1"><li>100% on the dashboard is not accepted.</li><li>Defects found at the end cost double.</li><li>Expect something like week {L.deliveredWeek} if you run it the same way.</li></ul></div>
      </div>
    </Frame>
  );
}

// ── Other people ─────────────────────────────────────────────────────────────
function ChatTab({ S, plan, onUse, planNote }) {
  const people = teamChat(S, plan);
  const [open, setOpen] = useState(null);
  return (
    <Frame id="chat" kind="team thread" planNote={planNote}>
      <div className="bg-slate-950 rounded-xl p-3 space-y-3">
        <div className="text-xs text-slate-500"># contract-200 · You: When will we be done?</div>
        {people.map((p) => (
          <div key={p.key} className="flex gap-2">
            <div className="w-8 h-8 rounded-full bg-violet-500/30 text-violet-200 text-sm font-bold flex items-center justify-center shrink-0">{p.name[0]}</div>
            <div className="min-w-0 flex-1">
              <div className="text-xs"><span className="font-semibold text-white">{p.name}</span> <span className="text-slate-500">{p.role}</span></div>
              <div className="text-sm text-slate-200">{p.says} <span className="text-violet-300">({p.confidence}% sure)</span></div>
              <div className="flex gap-3 mt-1 text-xs">
                <button type="button" className="text-violet-300 underline" onClick={() => setOpen(open === p.key ? null : p.key)}>{open === p.key ? 'Hide reasoning' : 'Why?'}</button>
                <button type="button" className="text-slate-300 underline" onClick={() => onUse('chat', p.forecast, p.name)}>Use {p.name}'s numbers</button>
              </div>
              {open === p.key && <div className="text-xs text-slate-400 mt-1 border-l-2 border-violet-500/50 pl-2">Frame: {p.frame}. {p.reasoning} Says week {p.forecast.week}, range {p.forecast.low}–{p.forecast.high}, {p.forecast.chance}% for week 12.</div>}
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function PanelTab({ S, plan, onUse, planNote }) {
  const p = expertPanel(S, plan);
  return (
    <Frame id="panel" kind="Delphi worksheet" f={p.forecast} onUse={onUse} planNote={planNote}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-mono">
          <thead className="text-xs text-slate-400 font-sans"><tr><th className="text-left py-1">Panelist</th><th>Round 1</th><th>Round 2</th></tr></thead>
          <tbody>
            {p.panel.map((x, i) => (
              <tr key={x.key} className="border-t border-slate-800 text-slate-200">
                <td className="py-1.5 font-sans">Expert {String.fromCharCode(65 + i)}</td>
                <td className="text-center">{x.forecast.week} <span className="text-slate-500">({x.forecast.low}–{x.forecast.high})</span></td>
                <td className="text-center text-violet-200">{x.round2.week} <span className="text-slate-500">({x.round2.low}–{x.round2.high})</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500 mt-2">Anonymous feedback between rounds: the round-1 median was week {p.round1Median}. In round 2 each panelist moved halfway toward it. The panelists are the five colleagues from Team Chat.</p>
    </Frame>
  );
}

function MarketTab({ S, onUse }) {
  const m = predictionMarket(S);
  const h = 130, x = (i) => 30 + (i / (m.chart.length - 1)) * (W - 42), y = (v) => 10 + (1 - v) * (h - 30);
  return (
    <Frame id="market" kind="prediction market" f={m.forecast} onUse={onUse}>
      <div className="flex items-baseline justify-between">
        <div className="text-sm text-slate-300">DELIVERED BY WEEK {S.rules.deadline} · pays $1</div>
        <div className="text-3xl font-bold font-mono text-violet-300">${m.price.toFixed(2)}</div>
      </div>
      <div className="text-xs text-slate-500">Volume {m.volume} contracts · {m.traders} simulated traders</div>
      <svg viewBox={`0 0 ${W} ${h}`} width="100%" className="mt-2" role="img" aria-label="Price chart">
        {[0, 0.5, 1].map((v) => <g key={v}><line x1={30} x2={W - 12} y1={y(v)} y2={y(v)} stroke="#1e293b" /><text x={26} y={y(v) + 4} textAnchor="end" {...svgText}>${v.toFixed(1)}</text></g>)}
        <polyline points={m.chart.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke="#a78bfa" strokeWidth="2" />
      </svg>
      <p className="text-[11px] text-slate-500">
        The traders are simulated, not real people: {m.byFrame.map((b) => `${b.n} use ${FRAME_NAMES[b.frame]}`).join(', ')}.
        Each buys if their own forecast is week {S.rules.deadline} or sooner. The price is the share who buy. Nobody in the market knows this scenario.
      </p>
    </Frame>
  );
}

function AiTab({ S, plan, onUse, planNote }) {
  const a = aiAssistant(S, plan);
  const [asked, setAsked] = useState(false);
  const bold = (s) => s.split('**').map((t, i) => (i % 2 ? <strong key={i} className="text-white">{t}</strong> : t));
  return (
    <Frame id="ai" kind="chat assistant" f={a.forecast} onUse={onUse} planNote={planNote}>
      <div className="text-[11px] text-slate-500 mb-2 bg-slate-950 rounded-lg p-2">
        <div className="uppercase tracking-wider mb-1">Context given to the assistant</div>
        {a.context.map((c) => <div key={c} className="font-mono">· {c}</div>)}
      </div>
      <div className="space-y-2 text-sm">
        <div className="ml-8 bg-slate-800 rounded-xl px-3 py-2 text-slate-100">When will this contract be accepted?</div>
        <div className="mr-8 bg-violet-500/10 border border-violet-500/30 rounded-xl px-3 py-2 text-slate-200">{bold(a.answer)}</div>
        {asked ? (
          <>
            <div className="ml-8 bg-slate-800 rounded-xl px-3 py-2 text-slate-100">What are you basing that on?</div>
            <div className="mr-8 bg-violet-500/10 border border-violet-500/30 rounded-xl px-3 py-2 text-slate-200">{a.basis}</div>
          </>
        ) : (
          <button type="button" onClick={() => setAsked(true)} className="ml-8 text-xs text-violet-300 underline">Ask: "What are you basing that on?"</button>
        )}
      </div>
    </Frame>
  );
}

// ── Records and structured judgment ──────────────────────────────────────────
function RecordsTab({ plan, planReady, onUse }) {
  const past = pastContracts();
  return (
    <Card title="Records · project database" tone="amber">
      <Label tab={tabById('records')} />
      <Records past={past} plan={planReady ? plan : null} onUse={(f, label) => onUse('records', f, label)} />
    </Card>
  );
}

function BenchmarkTab({ S, onUse }) {
  const b = industryBenchmark(S);
  return (
    <Frame id="benchmark" kind="industry survey" f={b.forecast} onUse={onUse}>
      <div className="text-xs font-bold uppercase tracking-wider text-amber-300">Sector Delivery Survey · {b.projects.toLocaleString()} projects</div>
      <div className="grid grid-cols-3 gap-2 mt-2">
        <Tile label="On time" value={`${Math.round(b.onTimeShare * 100)}%`} tone="text-amber-300" />
        <Tile label="Over schedule" value={`${Math.round(b.overrunShare * 100)}%`} tone="text-amber-300" />
        <Tile label="Median finish" value={`${b.medianRatio}×`} sub="planned duration" tone="text-amber-300" />
      </div>
      <p className="text-sm text-slate-300 mt-3">"Most projects run {Math.round((b.medianRatio - 1) * 100)}% over their planned duration; 80% finish between {b.p10Ratio}× and {b.p90Ratio}× of plan." Applied to a {S.rules.deadline}-week plan.</p>
      <p className="text-[11px] text-amber-200/80 mt-2 border border-amber-500/30 rounded-lg p-2">
        A different population: all projects in the sector, all sizes, all lines. Not this line's contracts. These figures are invented for the game.
      </p>
    </Frame>
  );
}

function ScenariosTab({ S, plan, onUse, planNote }) {
  const s = scenarios(S, plan);
  return (
    <Frame id="scenarios" kind="scenario matrix" f={s.forecast} onUse={onUse} planNote={planNote}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {s.rows.map((r) => (
          <div key={r.key} className="bg-slate-950 rounded-lg p-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">{r.label}</div>
            <div className="text-xl font-bold font-mono text-white">week {r.week}</div>
            <div className="text-[11px] text-slate-400 mt-1">{r.assumptions}</div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-500 mt-2">The Schedule's model under four named futures. Rework assumption: about {Math.round(s.reworkShare * 100)}% of units fail, as on the last contract; inspected work is fixed as you go, the rest at double the work. "Use this" takes the base + rework case, with best to worst as the range.</p>
    </Frame>
  );
}

function RisksTab({ S, plan, planNote }) {
  const r = riskRegister(S, plan);
  const P = ['Unlikely', 'Possible', 'Likely'], I = ['< 1 wk', '1–2 wks', '> 2 wks'];
  const shown = r.risks.filter((x) => x.applies);
  return (
    <Frame id="risks" kind="risk register" planNote={planNote}>
      <div className="grid grid-cols-[3.5rem_repeat(3,minmax(0,1fr))] gap-1 text-[10px]">
        {[2, 1, 0].map((p) => [
          <div key={`l${p}`} className="text-slate-400 flex items-center">{P[p]}</div>,
          ...[0, 1, 2].map((i) => {
            const here = shown.filter((x) => x.prob === p && x.impact === i);
            const heat = p + i;
            return (
              <div key={`${p}${i}`} className={`min-h-12 rounded p-1 ${['bg-slate-800', 'bg-violet-900/40', 'bg-violet-800/50', 'bg-violet-700/60', 'bg-violet-600/70'][heat]}`}>
                {here.map((x) => <div key={x.key} className="text-white leading-tight">{x.title}</div>)}
              </div>
            );
          }),
        ])}
        <div />{I.map((l) => <div key={l} className="text-center text-slate-400">{l}</div>)}
      </div>
      <p className="text-[10px] text-slate-500 text-center mt-1">Probability (up) × impact on the finish (across)</p>
      <ul className="mt-3 space-y-2">
        {shown.map((x) => (
          <li key={x.key} className="bg-slate-950 rounded-lg p-2 text-xs text-slate-300">
            <div className="font-semibold text-white">{x.title}</div>{x.note} About {x.weeks} weeks if it hits.
          </li>
        ))}
      </ul>
      <p className="text-sm text-violet-200 mt-3">No forecast here. If several of these can happen at once, does your range leave room for them? Most ranges that miss, miss late.</p>
    </Frame>
  );
}

function PremortemTab() {
  const key = 'blp-premortem';
  const [text, setText] = useState(() => { try { return localStorage.getItem(key) || ''; } catch { return ''; } });
  const save = (v) => { setText(v); try { localStorage.setItem(key, v); } catch { /* storage unavailable */ } };
  return (
    <Frame id="premortem" kind="premortem card">
      <p className="text-lg text-white leading-snug">It's week 17 and the customer has rejected the delivery. Why?</p>
      <textarea value={text} onChange={(e) => save(e.target.value)} rows={5} maxLength={1000} placeholder="Write the story of how it went wrong…"
        className="mt-3 w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-slate-200" />
      <p className="text-[11px] text-slate-500 mt-1">Nothing is computed from this. It stays on this device and is not in your result code.</p>
    </Frame>
  );
}

// ── Models ───────────────────────────────────────────────────────────────────
function AnalyticsTab({ S, plan, onUse, planNote }) {
  const a = analytics(S, plan);
  const h = 200, minW = 10, maxW = 22;
  const x = (c) => 40 + (c / 3.4) * (W - 60), y = (w) => 10 + (1 - (w - minW) / (maxW - minW)) * (h - 36);
  const jitter = (i) => ((i * 37) % 11 - 5) * 2.2;
  return (
    <Frame id="analytics" kind="BI dashboard" f={a.forecast} onUse={onUse} planNote={planNote}>
      <div className="grid grid-cols-4 gap-2">
        <Tile label="Contracts" value={a.n} tone="text-amber-300" />
        <Tile label="R²" value={a.r2} tone="text-amber-300" />
        <Tile label="Per crew" value={`${a.coef.crews > 0 ? '+' : ''}${a.coef.crews.toFixed(1)}`} sub="weeks" tone="text-amber-300" />
        <Tile label="Predicted" value={a.predicted} sub="for your plan" tone="text-amber-300" />
      </div>
      <svg viewBox={`0 0 ${W} ${h}`} width="100%" className="mt-3" role="img" aria-label="Scatter of past contracts with fitted line">
        {[10, 12, 14, 16, 18, 20, 22].map((w) => <g key={w}><line x1={40} x2={W - 12} y1={y(w)} y2={y(w)} stroke="#1e293b" /><text x={34} y={y(w) + 4} textAnchor="end" {...svgText}>{w}</text></g>)}
        <line x1={40} x2={W - 12} y1={y(S.rules.deadline)} y2={y(S.rules.deadline)} stroke="#fb7185" strokeDasharray="4 3" />
        {a.points.map((p, i) => <circle key={i} cx={x(p.crews) + jitter(i)} cy={y(Math.min(maxW, p.accepted))} r="4" fill="#fbbf24" fillOpacity={p.inspect === plan.inspect && p.shift === (plan.shift !== 'none') ? 0.9 : 0.3} />)}
        <polyline points={a.line.map((p) => `${x(p.crews)},${y(p.week)}`).join(' ')} fill="none" stroke="#fde68a" strokeWidth="2" />
        <circle cx={x(plan.crews)} cy={y(a.predicted)} r="7" fill="none" stroke="#fff" strokeWidth="2" />
        {[0, 1, 2, 3].map((c) => <text key={c} x={x(c)} y={h - 6} textAnchor="middle" {...svgText}>+{c} crews</text>)}
      </svg>
      <p className="text-[11px] text-slate-500">OLS: week accepted on crews added, inspection (any, and share) and second shift, across the 40. Line: fitted for your inspection and shift. 80% prediction interval ±{(1.306 * a.se).toFixed(1)} weeks.</p>
    </Frame>
  );
}

function SimulatorTab({ S, plan, onUse, planNote }) {
  const m = riskSimulator(S, plan);
  const weeks = Object.keys(m.hist).map(Number).sort((a, b) => a - b);
  const lo = Math.min(weeks[0], S.rules.deadline) - 1, hi = Math.max(weeks[weeks.length - 1], S.rules.deadline) + 1;
  const h = 190, x = (w) => 36 + ((w - lo) / (hi - lo)) * (W - 48), bw = (W - 48) / (hi - lo) - 4;
  const maxN = Math.max(...Object.values(m.hist));
  const y = (n) => h - 24 - (n / maxN) * (h - 50);
  let cum = 0;
  const curve = weeks.map((w) => { cum += m.hist[w]; return [w, cum / m.runs]; });
  const yc = (v) => h - 24 - v * (h - 50);
  return (
    <Frame id="simulator" kind="Monte Carlo schedule risk" f={m.forecast} onUse={onUse} planNote={planNote}>
      <div className="grid grid-cols-4 gap-2">
        {[10, 50, 80, 90].map((k) => <Tile key={k} label={`P${k}`} value={`wk ${m.p[k]}`} tone="text-sky-300" />)}
      </div>
      <svg viewBox={`0 0 ${W} ${h}`} width="100%" className="mt-3" role="img" aria-label="Histogram and S-curve of simulated finish weeks">
        {weeks.map((w) => <rect key={w} x={x(w) - bw / 2} y={y(m.hist[w])} width={bw} height={h - 24 - y(m.hist[w])} fill="#38bdf8" fillOpacity="0.5" />)}
        <polyline points={curve.map(([w, v]) => `${x(w)},${yc(v)}`).join(' ')} fill="none" stroke="#e0f2fe" strokeWidth="2" />
        <line x1={x(S.rules.deadline)} x2={x(S.rules.deadline)} y1={20} y2={h - 24} stroke="#fb7185" strokeDasharray="4 3" />
        {[...new Set([10, 50, 90].map((k) => m.p[k]))].map((w) => (
          <text key={w} x={x(w)} y={16} textAnchor="middle" fontSize="11" fill="#7dd3fc">{[10, 50, 90].filter((k) => m.p[k] === w).map((k) => `P${k}`).join('/')}</text>
        ))}
        {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map((w) => <text key={w} x={x(w)} y={h - 6} textAnchor="middle" {...svgText}>{w}</text>)}
      </svg>
      <p className="text-[11px] text-slate-500">{m.runs.toLocaleString()} iterations of the Schedule, with the pace's week-to-week wobble and a scope change drawn from the record. Bars: frequency. Line: cumulative probability. Defects are not in the model.</p>
    </Frame>
  );
}

function ConsensusTab({ S, plan, onUse, planNote }) {
  const [ticks, setTicks] = useState([]);
  const c = consensus(S, plan, ticks);
  const toggle = (k) => setTicks((t) => (t.includes(k) ? t.filter((x) => x !== k) : [...t, k]));
  return (
    <Frame id="consensus" kind="forecast combination" f={c.forecast} onUse={onUse} planNote={planNote}>
      <ul className="divide-y divide-slate-800">
        {Object.keys(FORECASTERS).map((k) => {
          const f = FORECASTERS[k](S, plan);
          return (
            <li key={k}>
              <label className="flex items-center gap-3 py-1.5 text-sm cursor-pointer">
                <input type="checkbox" checked={ticks.includes(k)} onChange={() => toggle(k)} className="accent-violet-400 w-4 h-4" />
                <span className="flex-1 text-slate-200">{FORECASTER_NAMES[k]}</span>
                <span className="font-mono text-slate-400 text-xs">{f.week} ({f.low}–{f.high}) {f.chance}%</span>
              </label>
            </li>
          );
        })}
      </ul>
      {!c.forecast && <p className="text-sm text-slate-400 mt-2">Tick the forecasts to average.</p>}
    </Frame>
  );
}

// ── Your own record ──────────────────────────────────────────────────────────
function TrackTab() {
  const t = readTrack();
  const held = t.filter((x) => x.held).length;
  const lateBy = t.map((x) => x.outcome - x.week);
  return (
    <Frame id="track" kind="personal stats">
      {t.length === 0 ? (
        <p className="text-sm text-slate-300">No record yet, which is most people's situation when they forecast their own work.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Tile label="Plays" value={t.length} tone="text-amber-300" />
            <Tile label="Ranges held" value={`${held} of ${t.length}`} tone="text-amber-300" />
            <Tile label="Avg. lateness" value={`${(lateBy.reduce((a, b) => a + b, 0) / t.length).toFixed(1)}`} sub="weeks after your point" tone="text-amber-300" />
          </div>
          <ul className="mt-3 text-xs font-mono text-slate-300 space-y-1">
            {t.slice(-8).reverse().map((x, i) => <li key={i}>{x.seed}: said {x.week} ({x.low}–{x.high}), accepted {x.outcome} · {x.held ? 'held' : 'missed'}</li>)}
          </ul>
        </>
      )}
    </Frame>
  );
}

/** One tool tab. `plan` is the stated plan, or hands-off until one is stated. */
export default function DeskTab({ id, S, plan, planReady, onUse }) {
  const planNote = !planReady
    ? <p className="text-xs text-violet-200 mb-3">Assuming a hands-off plan until you state yours on the front tab.</p>
    : <p className="text-xs text-slate-500 mb-3">For your plan: {describePlan(plan)}.</p>;
  const props = { S, plan, onUse, planNote };
  switch (id) {
    case 'status': return <StatusTab {...props} />;
    case 'burndown': return <BurndownTab {...props} />;
    case 'cost': return <CostTab {...props} />;
    case 'schedule': return <ScheduleTab {...props} />;
    case 'lessons': return <LessonsTab {...props} />;
    case 'chat': return <ChatTab {...props} />;
    case 'panel': return <PanelTab {...props} />;
    case 'market': return <MarketTab {...props} />;
    case 'ai': return <AiTab {...props} />;
    case 'records': return <RecordsTab plan={plan} planReady={planReady} onUse={onUse} />;
    case 'benchmark': return <BenchmarkTab {...props} />;
    case 'scenarios': return <ScenariosTab {...props} />;
    case 'risks': return <RisksTab {...props} />;
    case 'premortem': return <PremortemTab />;
    case 'analytics': return <AnalyticsTab {...props} />;
    case 'simulator': return <SimulatorTab {...props} />;
    case 'consensus': return <ConsensusTab {...props} />;
    case 'track': return <TrackTab />;
    default: return null;
  }
}
