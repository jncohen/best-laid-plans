// The Decision Desk's tool tabs. Each is a generic replica of a dashboard genre, fed
// only by desk.js, which sees only what the briefing shows.
import { useState } from 'react';
import {
  statusReport, costManagement, schedule, lastFive, teamChat, aiPrompt,
  scenarios, riskRegister, analytics, riskSimulator, consensus, FORECASTERS, FORECASTER_NAMES, tabById,
} from './desk.js';
import { CONFIG, pastContracts, describePlan, onboardingRule, eventRules, failuresLine } from './engine';
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
const svgText = { fontSize: 11, fill: '#94a3b8' };

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
      {f.fail && <p className="text-xs text-rose-300 mt-1">{f.fail}. The range is from delivered contracts; the week-12 chance counts the rest as not on time.</p>}
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

// ── The contract ─────────────────────────────────────────────────────────────
function ContractTab() {
  const c = CONFIG;
  return (
    <Card title="The Contract" tone="slate">
      <div className="grid grid-cols-4 gap-2 text-center">
        <div><div className="text-lg font-bold text-white">{c.scope}</div><div className="text-[11px] text-slate-500">units</div></div>
        <div><div className="text-lg font-bold text-white">{c.deadline}</div><div className="text-[11px] text-slate-500">weeks</div></div>
        <div><div className="text-lg font-bold text-white">{c.crews}</div><div className="text-[11px] text-slate-500">crews</div></div>
        <div><div className="text-lg font-bold text-white">{money(c.budget)}</div><div className="text-[11px] text-slate-500">budget</div></div>
      </div>
      <div className="space-y-2 mt-3 text-sm text-slate-300">
        <p>The contract is done when the customer's acceptance test passes every unit. If it has not passed by the end of week {c.horizon}, the customer terminates the contract.</p>
        <p>Your company can overspend the budget by up to {money(c.creditLine)} on credit. Past that, it can't make payroll: the company goes bankrupt and the contract ends.</p>
        <p>Customers on this line add to the requirement partway through: every past contract on record had a scope change. Nobody knows in advance which week it comes or how many units it adds.</p>
        <p>Some built units turn out defective. The dashboard counts them complete until inspection or the customer's acceptance test finds them.</p>
        <p>Contracts differ: some lines build faster or slower than others, and some turn out more defects. Each week's output and inspection finds show how this one runs. In any week you inspect, the inspectors also report the share of that week's units their sample found defective.</p>
        {eventRules(c).map((e) => <p key={e}>{e}</p>)}
      </div>
      <div className="mt-4 pt-3 border-t border-slate-800">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">What you decide each week</div>
        <ul className="space-y-2 text-sm text-slate-300">
          <li><strong className="text-white">Crews.</strong> Add up to {c.maxHirePerWeek} a week ({money(c.hireFee)} each, {c.maxCrews} crews at most) or
            release one ({money(c.releaseFee)}). {onboardingRule(c)} Every crew beyond {c.crews} makes all of them a little less efficient.</li>
          <li><strong className="text-white">Second shift.</strong> +{Math.round((c.shiftBoost - 1) * 100)}% output for {money(c.shiftPremiumPerCrew)} per crew. From the second straight week, tired crews make more defects.</li>
          <li><strong className="text-white">Inspection.</strong> Move 0–30% of the line from building to checking. You build less, but you find defects while they are cheap. Any defect the customer's test finds costs double to fix.</li>
          <li><strong className="text-white">Your forecast.</strong> Each week you may move your finish-week estimate.</li>
        </ul>
        <p className="text-xs text-slate-400 mt-3">
          Each crew costs {money(c.crewWeek)} a week. Two scores, kept apart: <strong className="text-emerald-300">Forecast</strong> (how right you were about your own project)
          and <strong className="text-slate-200">Delivery</strong> (on time, on budget: −{c.latePenaltyPerWeek} a week late, −{c.overspendPenaltyPer50k} per $50k over budget,
          0 if the contract is terminated or the company goes bankrupt). The forecast score is the one that counts most.
        </p>
      </div>
    </Card>
  );
}

// ── The mind's own frames ────────────────────────────────────────────────────
function StatusTab({ S, plan, onUse, live }) {
  const st = statusReport(S, live, plan);
  const R = S.rules;
  const light = { green: 'bg-emerald-400', amber: 'bg-amber-400', red: 'bg-rose-500' }[st.light];
  // Burn-up: cumulative earned units for the weeks shown, then the EVM projection to completion.
  const cum = live ? [0, ...live.rows.map((r) => r.reported * R.scope)] : S.history.reduce((a, v) => [...a, a[a.length - 1] + v], [0]);
  const end = Math.max(R.deadline, Math.ceil(st.eacWeeks)) + 1, h = 170;
  const x = (w) => 36 + (w / end) * (W - 48), y = (u) => 14 + (1 - u / (R.scope * 1.05)) * (h - 38);
  return (
    <Frame id="status" kind="earned-value status report" f={st.forecast} onUse={onUse}>
      <div className="flex items-center gap-3 mb-3">
        <span className={`w-10 h-10 rounded-full ${light} shadow-lg shrink-0`} aria-label={`status ${st.light}`} />
        <div>
          <div className="text-lg font-bold text-white uppercase">{st.light}: {st.light === 'green' ? 'ahead of schedule' : st.light === 'amber' ? 'slightly behind' : 'behind schedule'}</div>
          <div className="text-xs text-slate-400">Week {st.weeksShown} of {live ? 'this contract' : 'the last contract'} · earned {Math.round(100 * st.earnedPct)}% vs planned {Math.round(100 * st.plannedPct)}%</div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Tile label="Earned" value={`${Math.round(100 * st.earnedPct)}%`} tone="text-sky-300" />
        <Tile label="SPI" value={st.spi} sub="EV ÷ PV" tone="text-sky-300" />
        <Tile label="CPI" value={st.cpi} sub="EV ÷ AC" tone="text-sky-300" />
        <Tile label="EAC (time)" value={`wk ${st.eacWeeks}`} sub={`${R.deadline} wk ÷ SPI`} tone="text-sky-300" />
      </div>
      <svg viewBox={`0 0 ${W} ${h}`} width="100%" className="mt-3" role="img" aria-label="Burn-up chart">
        <line x1={x(0)} y1={y(R.scope)} x2={x(end)} y2={y(R.scope)} stroke="#475569" strokeDasharray="3 3" />
        <text x={x(0) + 4} y={y(R.scope) - 4} {...svgText}>scope {R.scope}</text>
        <line x1={x(0)} y1={y(0)} x2={x(R.deadline)} y2={y(R.scope)} stroke="#64748b" strokeWidth="1.5" />
        <text x={x(R.deadline) - 4} y={y(R.scope) + 14} textAnchor="end" {...svgText}>planned value</text>
        <line x1={x(R.deadline)} x2={x(R.deadline)} y1={10} y2={h - 22} stroke="#fb7185" strokeDasharray="4 3" />
        <line x1={x(st.weeksShown)} y1={y(st.built)} x2={x(st.eacWeeks)} y2={y(R.scope)} stroke="#38bdf8" strokeDasharray="5 4" strokeWidth="2" />
        <polyline points={cum.map((u, w) => `${x(w)},${y(u)}`).join(' ')} fill="none" stroke="#38bdf8" strokeWidth="3" />
        <text x={x(st.eacWeeks) + 4} y={y(R.scope) + 14} fill="#7dd3fc" fontSize="11">forecast wk {st.eacWeeks}</text>
        {Array.from({ length: Math.floor(end / 2) + 1 }, (_, i) => i * 2).map((w) => <text key={w} x={x(w)} y={h - 6} textAnchor="middle" {...svgText}>{w}</text>)}
      </svg>
      {live && (() => { const r = live.rows[live.rows.length - 1]; return (
        <p className="text-sm text-slate-300 mt-1">Built last week: <span className="font-mono">{Math.round(r.built)}</span> units with {r.crews} crews
          ({(r.built / Math.max(1, r.crews * (1 - r.inspect))).toFixed(1)} a crew building; the last contract: {(S.history.reduce((a, b) => a + b, 0) / S.history.length / S.rules.crews).toFixed(1)}).
          {r.found > 0.5 ? ` Defects found: ${Math.round(r.found)}.` : ''}</p>
      ); })()}
      {live && (
        <p className="text-sm text-slate-300 mt-1">
          {st.sample
            ? <>Inspectors' sample: <span className="font-mono">{(100 * st.sample.last).toFixed(1)}%</span> of week {st.sample.lastWeek}'s units defective{st.sample.weeks > 1 ? <> (<span className="font-mono">{(100 * st.sample.mean).toFixed(1)}%</span> on average over {st.sample.weeks} inspected weeks)</> : ''}.</>
            : "No inspectors' sample: no week has been inspected."}
          {' '}Defects found so far: <span className="font-mono">{Math.round(st.found)}</span>. The last contract had {st.rejectedLast} of {R.scope} units rejected at acceptance.
        </p>
      )}
      <p className="text-[11px] text-slate-500">
        Standard earned-value forecasting: estimate at completion = planned duration ÷ SPI. The range is that estimate as of each week shown
        (weeks {st.forecast.low}–{st.forecast.high}). Earned value counts units reported complete.
      </p>
    </Frame>
  );
}

function CostTab({ S, plan, onUse, planNote, live }) {
  const c = costManagement(S, plan, live);
  const R = S.rules;
  const end = R.horizon, h = 180;
  const top = Math.max(c.limit, c.burn[c.burn.length - 1].spent) * 1.05;
  const x = (w) => 44 + (w / end) * (W - 56), y = (v) => 12 + (1 - v / top) * (h - 36);
  const m = (v) => `$${(v / 1e6).toFixed(1)}M`;
  return (
    <Frame id="cost" kind="project cost control" f={c.forecast} onUse={onUse} planNote={planNote}>
      <div className="grid grid-cols-4 gap-2">
        <Tile label="Plan baseline" value={m(c.cost.bac)} sub="BAC" />
        <Tile label="Est. at completion" value={m(c.cost.eac)} sub="EAC = BAC ÷ CPI" tone="text-sky-300" />
        <Tile label="CPI" value={c.cost.cpi} sub="EV ÷ AC" tone="text-sky-300" />
        <Tile label="Cash runway" value={`${c.runwayWeeks} wk`} sub={`at ${money(c.perWeek)}/wk`} tone="text-sky-300" />
      </div>
      <p className="text-sm text-slate-300 mt-3">
        Spend to date{c.live ? ` (week ${c.week})` : ''}: <span className="font-mono">{money(c.spent)}</span>. Your plan's cost baseline is {money(c.cost.bac)}
        {c.live ? `; at CPI ${c.cost.cpi} the estimate at completion is ${money(c.cost.eac)}` : ''}.
      </p>
      <p className="text-sm text-slate-300 mt-1">
        Budget {money(c.budget)}: headroom <span className="font-mono">{money(c.headroom)}</span>. With the {money(c.creditLine)} credit line: <span className="font-mono">{money(c.headroomCredit)}</span>.
      </p>
      <svg viewBox={`0 0 ${W} ${h}`} width="100%" className="mt-3" role="img" aria-label="Cumulative spend against the budget and the bankruptcy line">
        <line x1={x(0)} x2={x(end)} y1={y(c.budget)} y2={y(c.budget)} stroke="#64748b" strokeDasharray="3 3" />
        <text x={x(0) + 4} y={y(c.budget) - 4} {...svgText}>budget {m(c.budget)}</text>
        <line x1={x(0)} x2={x(end)} y1={y(c.limit)} y2={y(c.limit)} stroke="#fb7185" strokeWidth="1.5" />
        <text x={x(end) - 4} y={y(c.limit) - 4} textAnchor="end" fontSize="11" fill="#fda4af">bankruptcy: budget + credit line</text>
        <line x1={x(R.deadline)} x2={x(R.deadline)} y1={8} y2={h - 22} stroke="#fb7185" strokeDasharray="4 3" />
        <polyline points={[[0, 0], ...c.burn.map((b) => [b.week, b.spent])].map(([w, v]) => `${x(w)},${y(v)}`).join(' ')} fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="5 4" />
        <polyline points={[[0, 0], ...c.burn.filter((b) => b.week <= c.forecast.week).map((b) => [b.week, b.spent])].map(([w, v]) => `${x(w)},${y(v)}`).join(' ')} fill="none" stroke="#38bdf8" strokeWidth="3" />
        {c.live && <line x1={x(c.week)} x2={x(c.week)} y1={8} y2={h - 22} stroke="#e2e8f0" strokeDasharray="2 3" />}
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
      <p className="text-[11px] text-slate-500 mt-2">The schedule forecast below is the one this spend plan assumes, the Schedule's.</p>
    </Frame>
  );
}

function ScheduleTab({ S, plan, onUse, planNote, live }) {
  const s = schedule(S, plan, live);
  const f0 = s.from + 1;
  const R = S.rules;
  const end = Math.max(R.deadline, s.forecast.week) + 1;
  const rows = [
    ...(live ? [['Done so far', 1, s.from, '#334155']] : []),
    ['Build', f0, s.forecast.week, '#38bdf8'],
    ...(s.weeks.some((w) => w.onboarding) ? [['Onboard new crews', f0, f0 + R.onboardingWeeks - 1, '#7dd3fc']] : []),
    ...(plan.inspect > 0 ? [[`Inspect ${Math.round(plan.inspect * 100)}%`, f0, s.forecast.week, '#0ea5e9']] : []),
    ...(plan.shift !== 'none' && (plan.shift === 'every' || s.forecast.week >= 9) ? [['Second shift', plan.shift === 'every' ? f0 : Math.max(9, f0), plan.shift === 'every' ? s.forecast.week : Math.min(11, s.forecast.week), '#bae6fd']] : []),
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
      <p className="text-[11px] text-slate-500">Finish milestone: week {s.forecast.week}. {live ? `Re-planned from week ${s.from}: the units left and the rate built so far, under the stated rules.` : "Built from the briefing's pace and stated rules, one week at a time."}</p>
    </Frame>
  );
}

function Last5Tab({ S, onUse }) {
  const L = lastFive(S);
  const N = L.newest;
  const plan = (r) => [r.crewsAdded ? `+${r.crewsAdded} crews (wk ${r.hires.map((h) => h.week).join(', ')})` : 'no crews added',
    r.inspect ? `${Math.round(r.inspect * 100)}% inspection` : 'no inspection', r.shiftWeeks ? `${r.shiftWeeks} second-shift weeks` : 'no second shift'].join(', ');
  return (
    <Frame id="last5" kind="recent projects and after-action review" f={L.forecast} onUse={onUse}>
      <div className="text-xs font-bold uppercase tracking-wider text-amber-300">The line's last contract (#{N.id}): its first six weeks</div>
      <p className="text-xs text-slate-400 mt-1">Same line, same {S.rules.crews} crews. Units completed each week, from its dashboard:</p>
      <div className="grid grid-cols-6 gap-1 font-mono text-sm text-center text-white mt-1">
        {S.history.map((v, i) => <div key={i} className="bg-slate-950 rounded py-1">{Math.round(v)}</div>)}
      </div>
      <p className="text-sm text-slate-300 mt-2">
        About <strong className="text-sky-300">{N.pace} a week</strong>. At that pace, {S.rules.scope} units takes <strong className="text-sky-300">{(S.rules.scope / N.pace).toFixed(1)} weeks</strong>.
      </p>
      <div className="text-xs font-bold uppercase tracking-wider text-amber-300 mt-4">After-action review · contract #{N.id}</div>
      <div className="space-y-2 text-sm text-slate-300 mt-2">
        <p><span className="text-slate-500">What happened.</span> Same line, same {S.rules.crews} crews, {plan(N)}. The dashboard showed {N.pace} units a week and read 100% in week {N.dashboardFullWeek}. The customer added {N.scopeUnits} units in week {N.scopeWeek}.</p>
        <p><span className="text-slate-500">What went wrong.</span> The acceptance test rejected <span className="text-rose-300 font-semibold">{N.rejected} units</span>, and fixing them that late took twice the work. Accepted in week {N.deliveredWeek}, {N.deliveredWeek - N.dashboardFullWeek} weeks after the dashboard said done.</p>
        <p><span className="text-slate-500">Lessons.</span> 100% on the dashboard is not accepted. Defects found at the end cost double.</p>
      </div>
      <div className="text-xs font-bold uppercase tracking-wider text-amber-300 mt-4">The five newest contracts</div>
      <ul className="mt-2 divide-y divide-slate-800">
        {[...L.rows].reverse().map((r) => (
          <li key={r.id} className="py-2 text-sm">
            <div className="flex justify-between gap-2"><span className="text-white font-semibold">#{r.id}</span>
              <span className="font-mono text-amber-300">{r.delivered ? `accepted wk ${r.accepted}` : r.bankrupt ? `bankrupt wk ${r.endedWeek}` : `terminated wk ${r.endedWeek}`}{r.onTime ? ' · on time' : ''}</span></div>
            <div className="text-xs text-slate-400">{plan(r)} · scope +{r.scopeUnits} in wk {r.scopeWeek} · dashboard 100% wk {r.dashboardFullWeek} · <span className="text-rose-300">{r.rejected} rejected</span></div>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-slate-500 mt-2">
        These are records #{L.rows[0].id}–#{N.id}, the newest in the Records tab.{L.summary.failed.total ? ` ${failuresLine(L.summary)}; weeks are from the delivered ones.` : ''}
        {' '}"Use this" takes their median, with the earliest and latest delivered as the range.
      </p>
    </Frame>
  );
}

// ── Other people ─────────────────────────────────────────────────────────────
function ChatTab({ S, plan, onUse, planNote, live }) {
  const people = teamChat(S, plan, live);
  const [open, setOpen] = useState(null);
  return (
    <Frame id="chat" kind="team thread" planNote={planNote}>
      <div className="bg-slate-950 rounded-xl p-3 space-y-3">
        <div className="text-xs text-slate-500"># contract-200 · {live ? `after week ${live.week} · ` : ''}You: When will we be done?</div>
        {people.map((p) => (
          <div key={p.key} className="flex gap-2">
            <div className="w-8 h-8 rounded-full bg-violet-500/30 text-violet-200 text-sm font-bold flex items-center justify-center shrink-0">{p.name[0]}</div>
            <div className="min-w-0 flex-1">
              <div className="text-xs"><span className="font-semibold text-white">{p.name}</span> <span className="text-slate-500">{p.role}</span></div>
              <div className="text-sm text-slate-200">{p.says}</div>
              <div className="flex gap-3 mt-1 text-xs">
                <button type="button" className="text-violet-300 underline" onClick={() => setOpen(open === p.key ? null : p.key)}>{open === p.key ? 'Hide reasoning' : 'Why?'}</button>
                <button type="button" className="text-slate-300 underline" onClick={() => onUse('chat', p.forecast, p.name)}>Use {p.name}'s numbers</button>
              </div>
              {open === p.key && <div className="text-xs text-slate-400 mt-1 border-l-2 border-violet-500/50 pl-2">From: {p.frame}. {p.reasoning} In numbers: week {p.forecast.week}, range {p.forecast.low}–{p.forecast.high}, {p.forecast.chance}% for week 12; {p.confidence}% sure.</div>}
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function AiTab({ S, plan, planNote, live, onCopyPrompt, opened = [] }) {
  const looked = opened.filter((id) => id !== 'ai' && id !== 'contract' && tabById(id));
  const text = aiPrompt(S, plan, live, looked);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // No clipboard (an old browser, or not allowed): select the text so it can be copied by hand.
      const el = document.getElementById('ai-prompt');
      if (el) { el.focus(); el.select(); }
    }
    if (onCopyPrompt) onCopyPrompt();
  };
  return (
    <Frame id="ai" kind="prompt for your AI assistant" planNote={planNote}>
      <p className="text-sm text-slate-300 mb-1">
        Copy this into whatever AI assistant you use and read what it says.
      </p>
      <p className="text-xs text-slate-400 mb-1">
        The prompt includes: The Contract{live ? `, your dashboard after week ${live.week}` : ''}{looked.length ? `, ${looked.map((id) => tabById(id).name).join(', ')}` : ''}.
      </p>
      <p className="text-xs text-violet-200 mb-2">Your AI knows only what you've looked at. Open more tabs to tell it more.</p>
      <button type="button" onClick={copy} className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold">
        {copied ? 'Copied' : 'Copy the prompt'}
      </button>
      <textarea id="ai-prompt" readOnly value={text} rows={10} onFocus={(e) => e.target.select()}
        className="mt-2 w-full bg-slate-950 border border-slate-700 rounded-xl p-3 font-mono text-[11px] text-slate-300" />
      <p className="text-[11px] text-slate-500 mt-1">{text.length.toLocaleString()} characters. This tab gives no forecast of its own; type the AI's numbers into your prediction if you want to use them.</p>
    </Frame>
  );
}

// ── Records and structured judgment ──────────────────────────────────────────
function RecordsTab({ plan, planReady, onUse }) {
  const past = pastContracts();
  return (
    <Card title="Records · project database" tone="amber">
      <Records past={past} plan={planReady ? plan : null} onUse={(f, label) => onUse('records', f, label)} />
    </Card>
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
      <p className="text-sm text-violet-200 mt-3">No forecast here: each risk is listed on its own.</p>
      <Premortem />
    </Frame>
  );
}

function Premortem() {
  const key = 'blp-premortem';
  const [text, setText] = useState(() => { try { return localStorage.getItem(key) || ''; } catch { return ''; } });
  const save = (v) => { setText(v); try { localStorage.setItem(key, v); } catch { /* storage unavailable */ } };
  return (
    <div className="mt-4 pt-3 border-t border-slate-800">
      <div className="text-xs font-bold uppercase tracking-wider text-violet-300">Premortem</div>
      <p className="text-sm text-white mt-1">It's week 17 and the customer has rejected the delivery. Why?</p>
      <textarea value={text} onChange={(e) => save(e.target.value)} rows={4} maxLength={1000} placeholder="Write the story of how it went wrong…"
        className="mt-2 w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-slate-200" />
      <p className="text-[11px] text-slate-500 mt-1">Nothing is computed from this. It stays on this device.</p>
    </div>
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
      <p className="text-[11px] text-slate-500">OLS: week accepted on crews added, inspection (any, and share) and second shift, across the {a.n} delivered past contracts; the {a.left} never delivered have no week, so they aren't in the fit. Line: fitted for your inspection and shift. 80% prediction interval ±{(1.306 * a.se).toFixed(1)} weeks.</p>
    </Frame>
  );
}

function SimulatorTab({ S, plan, onUse, planNote, live }) {
  const [rework, setRework] = useState(true);
  const m = riskSimulator(S, plan, { rework, live });
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
      <label className="flex items-center gap-3 mb-3 text-sm text-slate-200 cursor-pointer">
        <input type="checkbox" checked={rework} onChange={(e) => setRework(e.target.checked)} className="accent-violet-400 w-4 h-4" />
        Include rework like the last contracts (historical slip)
      </label>
      <div className="grid grid-cols-4 gap-2">
        {[10, 50, 80, 90].map((k) => <Tile key={k} label={`P${k}`} value={`wk ${m.p[k]}`} tone="text-violet-300" />)}
      </div>
      <svg viewBox={`0 0 ${W} ${h}`} width="100%" className="mt-3" role="img" aria-label="Histogram and S-curve of simulated finish weeks">
        {weeks.map((w) => <rect key={w} x={x(w) - bw / 2} y={y(m.hist[w])} width={bw} height={h - 24 - y(m.hist[w])} fill="#a78bfa" fillOpacity="0.5" />)}
        <polyline points={curve.map(([w, v]) => `${x(w)},${yc(v)}`).join(' ')} fill="none" stroke="#ede9fe" strokeWidth="2" />
        <line x1={x(S.rules.deadline)} x2={x(S.rules.deadline)} y1={20} y2={h - 24} stroke="#fb7185" strokeDasharray="4 3" />
        {[...new Set([10, 50, 90].map((k) => m.p[k]))].map((w) => (
          <text key={w} x={x(w)} y={16} textAnchor="middle" fontSize="11" fill="#c4b5fd">{[10, 50, 90].filter((k) => m.p[k] === w).map((k) => `P${k}`).join('/')}</text>
        ))}
        {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map((w) => <text key={w} x={x(w)} y={h - 6} textAnchor="middle" {...svgText}>{w}</text>)}
      </svg>
      <p className="text-[11px] text-slate-500">
        {m.runs.toLocaleString()} iterations of the Schedule, with the pace's week-to-week wobble and a scope change drawn from the record.
        {live ? ` Starts from week ${live.week}'s reported state.` : ''}
        {m.rework && m.tested ? ' The acceptance test has already run, so its rework is in the units left.' : m.rework
          ? ` Each run also adds a historical slip: how much later one of ${m.slips.n} delivered past contracts inspected like your plan was accepted than this model predicted for it (median +${m.slips.median} weeks, mostly rework).${m.pool.failed ? ` ${m.pool.failed} more of them never delivered and have no slip.` : ''}`
          : ' Rework is switched off: the model sees only the plan, so it finishes when the dashboard would read 100%.'}
      </p>
    </Frame>
  );
}

function ConsensusTab({ S, plan, onUse, planNote, live }) {
  const [ticks, setTicks] = useState([]);
  const c = consensus(S, plan, ticks, live);
  const toggle = (k) => setTicks((t) => (t.includes(k) ? t.filter((x) => x !== k) : [...t, k]));
  return (
    <Frame id="consensus" kind="forecast combination" f={c.forecast} onUse={onUse} planNote={planNote}>
      <ul className="divide-y divide-slate-800">
        {Object.keys(FORECASTERS).map((k) => {
          const f = FORECASTERS[k](S, plan, live);
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
export default function DeskTab({ id, S, plan, planReady, onUse, live = null, onCopyPrompt = null, opened = [] }) {
  const planNote = !planReady
    ? <p className="text-xs text-violet-200 mb-3">Assuming a hands-off plan until you state yours on the front tab.</p>
    : <p className="text-xs text-slate-500 mb-3">For your plan: {describePlan(plan)}.</p>;
  const props = { S, plan, onUse, planNote, live, onCopyPrompt, opened };
  switch (id) {
    case 'contract': return <ContractTab />;
    case 'status': return <StatusTab {...props} />;
    case 'cost': return <CostTab {...props} />;
    case 'schedule': return <ScheduleTab {...props} />;
    case 'last5': return <Last5Tab {...props} />;
    case 'chat': return <ChatTab {...props} />;
    case 'ai': return <AiTab {...props} />;
    case 'records': return <RecordsTab plan={plan} planReady={planReady} onUse={onUse} />;
    case 'scenarios': return <ScenariosTab {...props} />;
    case 'risks': return <RisksTab {...props} />;
    case 'analytics': return <AnalyticsTab {...props} />;
    case 'simulator': return <SimulatorTab {...props} />;
    case 'consensus': return <ConsensusTab {...props} />;
    case 'track': return <TrackTab />;
    default: return null;
  }
}
