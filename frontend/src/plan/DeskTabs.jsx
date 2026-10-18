// The Decision Desk's tool tabs. Each is a generic replica of a dashboard genre, fed
// only by desk.js, which sees only what the briefing shows.
import { useState } from 'react';
import { statusReport, lastFive, teamChat, aiPrompt, recordsCsv, tabById, projectControls, whatIf, RISK_KINDS, RISK_LEVELS } from './desk.js';
import { CONFIG, pastContracts, describePlan, onboardingRule, failuresLine } from './engine';
import { Card, ScoringNote } from './ui';
import { CHART_W as W, CHART_CLASS, svgText } from './chartStyle';
import { money, downloadText } from './format';
import Records from './Records';

const TONE = {
  inside: { border: 'sky', text: 'text-sky-300', fill: '#38bdf8', soft: 'bg-sky-500/15', ring: 'border-sky-500/50' },
  record: { border: 'amber', text: 'text-amber-300', fill: '#fbbf24', soft: 'bg-amber-500/15', ring: 'border-amber-500/50' },
  people: { border: 'violet', text: 'text-violet-300', fill: '#a78bfa', soft: 'bg-violet-500/15', ring: 'border-violet-500/50' },
  front: { border: 'slate', text: 'text-white', fill: '#e2e8f0', soft: 'bg-slate-800', ring: 'border-slate-600' },
};
const toneOf = (id) => TONE[tabById(id)?.tone || 'front'];

/** The forecast a tab produces, and the button that copies it to the front tab. */
export function ForecastTile({ f, tone, onUse, label = 'This tool says' }) {
  if (!f) return null;
  return (
    <div className={`rounded-xl border ${tone.ring} ${tone.soft} p-3 mt-3`}>
      <div className="text-[11px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mt-1">
        <div><span className={`text-2xl font-bold font-mono ${tone.text}`}>week {f.week}</span></div>
        <div className="text-sm text-slate-200">{f.rangeLabel || '80% range'} <span className="font-mono">{f.low}–{f.high}</span></div>
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
    <div className="text-[11px] uppercase tracking-wider text-slate-500 leading-tight">{label}</div>
    <div className={`text-lg font-bold font-mono ${tone}`}>{value}</div>
    {sub && <div className="text-[11px] text-slate-500 leading-tight">{sub}</div>}
  </div>
);

// ── The contract ─────────────────────────────────────────────────────────────
function ContractTab() {
  const c = CONFIG;
  const Rule = ({ k, children }) => <li><strong className="text-white">{k}</strong> {children}</li>;
  return (
    <Card title="The Contract" tone="slate">
      <div className="grid grid-cols-4 gap-2 text-center">
        <div><div className="text-lg font-bold text-white">{c.scope}</div><div className="text-[11px] text-slate-500">units</div></div>
        <div><div className="text-lg font-bold text-white">{c.deadline}</div><div className="text-[11px] text-slate-500">weeks</div></div>
        <div><div className="text-lg font-bold text-white">{c.crews}</div><div className="text-[11px] text-slate-500">crews</div></div>
        <div><div className="text-lg font-bold text-white">{money(c.budget)}</div><div className="text-[11px] text-slate-500">budget</div></div>
      </div>
      <ul className="space-y-1.5 mt-3 text-sm text-slate-300 list-disc pl-5">
        <li>Done when the customer's acceptance test passes every unit. Not accepted by week {c.horizon}: the customer terminates the contract.</li>
        <li>You can overspend by up to {money(c.creditLine)} on credit. Past that, payroll fails and the company goes bankrupt. Bankrupt or terminated, it is never delivered.</li>
        <li>The customer will add units once, partway through (a scope change). When, and how many, isn't known.</li>
        <li>Some built units turn out defective. The dashboard counts them done until inspection or the acceptance test finds them.</li>
        <li>Lines differ in speed and defects. Your line also has its own week-to-week luck.</li>
      </ul>
      <div className="mt-4 pt-3 border-t border-slate-800">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">What you decide each week</div>
        <ul className="space-y-1.5 text-sm text-slate-300">
          <Rule k="Crews.">{money(c.crewWeek)} a crew a week. Add up to {c.maxHirePerWeek} a week ({money(c.hireFee)} each, {c.maxCrews} at most) or release one ({money(c.releaseFee)}). {onboardingRule(c)} Each crew past {c.crews} slows them all a little.</Rule>
          <Rule k="Second shift.">+{Math.round((c.shiftBoost - 1) * 100)}% output for {money(c.shiftPremiumPerCrew)} a crew. From the second straight week, tired crews make more defects.</Rule>
          <Rule k="Inspection.">0–30% of the line checks instead of building. A defect found early costs 1 unit; each unit the acceptance test rejects takes {c.lateFixMultiplier} units of work to fix.</Rule>
          <Rule k="Forecast.">Move it any week.</Rule>
        </ul>
        <ScoringNote className="mt-3" />
        <p className="text-xs text-slate-400 mt-1">
          The forecast you commit before week 1 loses points for being far off, for a wide range and for a miss: a narrow range that holds scores best.
          Delivery: −{c.latePenaltyPerWeek} a week late, −{c.overspendPenaltyPer50k} per $50k over budget, 0 if never delivered.
        </p>
      </div>
    </Card>
  );
}

// ── The dashboards ───────────────────────────────────────────────────────────
function StatusTab({ S, plan, onUse, live }) {
  const st = statusReport(S, live, plan);
  const R = S.rules;
  const light = { green: 'bg-emerald-400', amber: 'bg-amber-400', red: 'bg-rose-500' }[st.light];
  const flags = [st.behind.schedule && 'behind schedule', st.behind.cost && 'over budget for the work done'].filter(Boolean);
  // Burn-up: units reported complete each week (against the scope of the time), then the projection to the finish.
  const scopeAt = (w) => R.scope + (st.scopeWeek !== null && w >= st.scopeWeek ? st.scopeAdded : 0);
  const cum = live ? [0, ...live.rows.map((r) => r.reported * scopeAt(r.week))] : S.history.reduce((a, v) => [...a, a[a.length - 1] + v], [0]);
  const end = Math.max(R.deadline, Math.ceil(st.eacWeeks)) + 1, h = 170;
  const x = (w) => 32 + (w / end) * (W - 40), y = (u) => 16 + (1 - u / (st.scope * 1.05)) * (h - 40);
  const m = st.money;
  return (
    <Frame id="status" kind="progress and money" f={st.forecast} onUse={onUse}>
      <div className="flex items-center gap-3 mb-3">
        <span className={`w-10 h-10 rounded-full ${light} shadow-lg shrink-0`} aria-label={`status ${st.light}`} />
        <div>
          <div className="text-lg font-bold text-white">{st.light.toUpperCase()}: {flags.length ? flags.join(' and ') : 'on schedule and on budget'}</div>
          <div className="text-xs text-slate-400">Week {st.weeksShown} of {live ? 'this contract' : 'the last contract'} · reported complete {Math.round(100 * st.earnedPct)}% vs planned {Math.round(100 * st.plannedPct)}%</div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Tile label="Reported complete" value={`${Math.round(100 * st.earnedPct)}%`} sub={`of ${st.scope} units`} tone="text-sky-300" />
        <Tile label="Schedule efficiency" value={st.spi} sub="below 1 = behind plan · SPI" tone={st.behind.schedule ? 'text-amber-300' : 'text-sky-300'} />
        <Tile label="Projected finish" value={`wk ${Math.ceil(st.eacWeeks)}`} sub={`12 weeks ÷ schedule efficiency · EAC`} tone="text-sky-300" />
        <Tile label="Scope" value={st.scope} sub={st.scopeAdded ? `${R.scope} + ${st.scopeAdded} added in week ${st.scopeWeek}` : 'units, no change yet'} tone="text-sky-300" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
        {live ? (<>
          <Tile label="Spent" value={money(m.spent)} sub={`of ${money(m.budget)} budget`} />
          <Tile label="Budget left" value={money(m.budgetLeft)} tone={m.budgetLeft < 0 ? 'text-rose-300' : 'text-white'} />
          <Tile label="Credit left" value={money(Math.min(m.creditLine, m.creditLeft))} sub={`of ${money(m.creditLine)} credit line`} tone={m.budgetLeft < 0 ? 'text-rose-300' : 'text-white'} />
        </>) : (<>
          <Tile label="Your plan's cost" value={money(m.plannedCost)} sub="if it runs as planned on paper" />
          <Tile label="Budget" value={money(m.budget)} />
          <Tile label="Credit line" value={money(m.creditLine)} sub="past it: bankrupt" />
        </>)}
        <Tile label="Cost efficiency" value={st.cpi} sub="below 1 = over budget for the work done · CPI" tone={st.behind.cost ? 'text-amber-300' : 'text-white'} />
      </div>
      <p className="text-xs text-slate-400 mt-2">
        {m.brokeWeek ? <span className="text-rose-300">At this rate of spending the money runs out in week {m.brokeWeek}: past the credit line the company goes bankrupt.</span> : `At this rate of spending the money lasts past week ${R.horizon}.`}
      </p>
      <svg viewBox={`0 0 ${W} ${h}`} className={`${CHART_CLASS} mt-2`} role="img" aria-label="Burn-up chart">
        <line x1={x(0)} y1={y(st.scope)} x2={x(end)} y2={y(st.scope)} stroke="#475569" strokeDasharray="3 3" />
        <text x={x(0) + 4} y={y(st.scope) - 4} {...svgText}>scope {st.scope}</text>
        <line x1={x(0)} y1={y(0)} x2={x(R.deadline)} y2={y(st.scope)} stroke="#64748b" strokeWidth="1.5" />
        <text x={x(R.deadline / 2) + 6} y={y(st.scope / 2) + 4} {...svgText}>plan</text>
        <line x1={x(R.deadline)} x2={x(R.deadline)} y1={10} y2={h - 22} stroke="#fb7185" strokeDasharray="4 3" />
        <line x1={x(st.weeksShown)} y1={y(st.built)} x2={x(st.eacWeeks)} y2={y(st.scope)} stroke="#38bdf8" strokeDasharray="5 4" strokeWidth="2" />
        <polyline points={cum.map((u, w) => `${x(w)},${y(u)}`).join(' ')} fill="none" stroke="#38bdf8" strokeWidth="3" />
        <text x={Math.min(W - 4, x(st.eacWeeks) + 4)} y={y(st.scope) + 30} textAnchor={x(st.eacWeeks) > W - 90 ? 'end' : 'start'} fill="#7dd3fc" fontSize="12">projected wk {Math.ceil(st.eacWeeks)}</text>
        {Array.from({ length: Math.floor(end / 2) + 1 }, (_, i) => i * 2).map((w) => <text key={w} x={x(w)} y={h - 6} textAnchor="middle" {...svgText}>{w}</text>)}
      </svg>
      {live && (() => { const r = live.rows[live.rows.length - 1]; return (
        <p className="text-sm text-slate-300 mt-1">Built in week {r.week}: <span className="font-mono">{Math.round(r.built)}</span> units with {r.crews} crew{r.crews === 1 ? '' : 's'}
          {' '}({st.perCrew} a crew so far, allowing for onboarding and inspection; the last contract: {(S.history.reduce((a, b) => a + b, 0) / S.history.length / S.rules.crews).toFixed(1)}).
          {' '}Defects found in week {r.week}: {Math.round(r.found + r.rejected)}; so far: {Math.round(st.found)}. The last contract had {st.rejectedLast} of {R.scope} units rejected at acceptance.</p>
      ); })()}
      <p className="text-[11px] text-slate-500 mt-1">
        Projected finish is the standard earned-value estimate: 12 weeks ÷ schedule efficiency. Its range is that estimate as of each week shown
        (weeks {st.forecast.low}–{st.forecast.high}). Reported complete counts units built, whether or not they will pass.
      </p>
    </Frame>
  );
}

// ── Management information ────────────────────────────────────────────────────
function ControlsTab({ S, plan, planNote, live }) {
  const pc = projectControls(S, plan, live);
  const R = S.rules;
  const end = Math.max(R.deadline, pc.finish || 0, pc.weekNow) + 1, h = 170;
  const top = Math.max(pc.scope, ...pc.actual.map((a) => a.left)) * 1.05;
  const x = (w) => 32 + (w / end) * (W - 40), y = (u) => 16 + (1 - u / top) * (h - 40);
  const line = (pts) => pts.map((a) => `${x(a.week)},${y(a.left)}`).join(' ');
  const ticks = Array.from({ length: Math.floor(end / 2) + 1 }, (_, i) => i * 2);
  // The defect chart: one bar a week, the centre line and the upper control limit.
  const dmax = Math.max(4, ...pc.defects.map((d) => d.count), pc.ucl || 0) * 1.1, dh = 150;
  const dx = (w) => 32 + ((w - 0.5) / end) * (W - 40), dy = (n) => 12 + (1 - n / dmax) * (dh - 34), bw = Math.max(4, (W - 40) / end - 4);
  const leftNow = Math.round(pc.actual[pc.actual.length - 1].left);
  return (
    <Frame id="controls" kind="burn-down and defect control chart" planNote={planNote}>
      <div className="text-xs font-bold uppercase tracking-wider text-sky-300">Burn-down: units left</div>
      <p className="text-xs text-slate-400 mt-1">
        {live ? <>After week {pc.weekNow}: <span className="font-mono text-white">{leftNow}</span> units left,{' '}
          {pc.behindBy > 0 ? <span className="text-amber-300">{pc.behindBy} more than the straight line to week {R.deadline}</span> : `${-pc.behindBy} fewer than the straight line to week ${R.deadline}`}.
          {' '}Units left include known rework; the scope change adds to them. Dashed: the Schedule&apos;s projection, week {pc.finish}.</>
          : <>The last contract&apos;s first six weeks, against the straight line from {R.scope} units to zero at week {R.deadline}. During play this shows your contract.</>}
      </p>
      <svg viewBox={`0 0 ${W} ${h}`} className={`${CHART_CLASS} mt-2`} role="img" aria-label="Burn-down chart">
        <polyline points={line(pc.ideal)} fill="none" stroke="#64748b" strokeWidth="1.5" />
        <text x={x(2)} y={y(pc.scope * 0.75)} {...svgText}>plan</text>
        <line x1={x(R.deadline)} x2={x(R.deadline)} y1={10} y2={h - 22} stroke="#fb7185" strokeDasharray="4 3" />
        <text x={x(R.deadline) + 3} y={20} fill="#fda4af" fontSize="11">deadline</text>
        {pc.projection.length > 1 && <polyline points={line(pc.projection)} fill="none" stroke="#38bdf8" strokeDasharray="5 4" strokeWidth="2" />}
        <polyline points={line(pc.actual)} fill="none" stroke="#38bdf8" strokeWidth="3" />
        <line x1={x(0)} x2={x(end)} y1={y(0)} y2={y(0)} stroke="#334155" />
        {ticks.map((w) => <text key={w} x={x(w)} y={h - 6} textAnchor="middle" {...svgText}>{w}</text>)}
      </svg>
      <div className="text-xs font-bold uppercase tracking-wider text-sky-300 mt-4">Defect control chart: defects found each week</div>
      {!live ? (
        <p className="text-xs text-slate-400 mt-1">Starts in week 1: defects found by inspection and by the acceptance test, week by week, against limits from your own weeks. The last contract had no inspection and {pc.rejectedLast} units rejected at acceptance.</p>
      ) : (<>
        <p className="text-xs text-slate-400 mt-1">
          {pc.centre === null ? 'The limits need three weeks without an acceptance test.' : <>Centre line {pc.centre} a week; upper control limit {pc.ucl} (centre + 3√centre, from the weeks before any acceptance test).</>}
          {pc.out.length > 0 && <span className="text-rose-300"> Above the limit in week{pc.out.length > 1 ? 's' : ''} {pc.out.join(', ')}: something other than the usual has changed.</span>}
          {' '}Few defects found can mean few made, or little inspection.
        </p>
        <svg viewBox={`0 0 ${W} ${dh}`} className={`${CHART_CLASS} mt-2`} role="img" aria-label="Defect control chart">
          {pc.defects.map((d) => <rect key={d.week} x={dx(d.week) - bw / 2} y={dy(d.count)} width={bw} height={dy(0) - dy(d.count)} fill={pc.out.includes(d.week) ? '#fb7185' : d.rejected ? '#fbbf24' : '#38bdf8'} />)}
          {pc.centre !== null && <>
            <line x1={x(0)} x2={x(end)} y1={dy(pc.centre)} y2={dy(pc.centre)} stroke="#94a3b8" />
            <line x1={x(0)} x2={x(end)} y1={dy(pc.ucl)} y2={dy(pc.ucl)} stroke="#fb7185" strokeDasharray="4 3" />
            <text x={x(end) - 2} y={dy(pc.ucl) - 3} textAnchor="end" fill="#fda4af" fontSize="11">upper limit</text>
          </>}
          <line x1={x(0)} x2={x(end)} y1={dy(0)} y2={dy(0)} stroke="#334155" />
          {ticks.map((w) => <text key={w} x={dx(w)} y={dh - 6} textAnchor="middle" {...svgText}>{w}</text>)}
        </svg>
        <p className="text-[11px] text-slate-500">Blue: found by inspection. Amber: a week with an acceptance test. Red: above the upper limit.</p>
      </>)}
    </Frame>
  );
}

function Seg({ label, options, value, onChange }) {
  return (
    <div className="flex items-center gap-1 flex-wrap" role="radiogroup" aria-label={label}>
      <span className="text-[11px] text-slate-500 w-20 shrink-0">{label}</span>
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={`px-2 py-1 rounded text-xs border ${value === v ? 'bg-slate-700 border-slate-300 text-white font-semibold' : 'bg-slate-950 border-slate-700 text-slate-300'}`}>{l}</button>
      ))}
    </div>
  );
}

function WhatIfTab({ S, plan, planNote, live }) {
  const R = S.rules;
  const base = { crews: plan.crews, inspect: plan.inspect, shift: plan.shift };
  // During play crews can only be added from here: the plan engine does not model releases.
  const minCrews = live ? Math.max(0, live.crews - R.crews) : 0;
  const maxCrews = Math.min(R.maxCrews - R.crews, minCrews + (live ? R.maxHirePerWeek : 3));
  const crewOpts = Array.from({ length: maxCrews - minCrews + 1 }, (_, i) => minCrews + i);
  const [alts, setAlts] = useState(() => [
    { ...base, crews: Math.min(maxCrews, Math.max(minCrews, base.crews) + 1) },
    { ...base, crews: Math.max(minCrews, base.crews), inspect: base.inspect ? 0 : R.inspectionOptions[1], shift: base.shift === 'none' ? 'late' : 'none' },
  ]);
  const setAlt = (i, k) => (v) => setAlts((a) => a.map((o, j) => (j === i ? { ...o, [k]: v } : o)));
  const rows = whatIf(S, [base, ...alts], live);
  const names = [live ? "This week's decisions" : 'Your plan', 'Option A', 'Option B'];
  return (
    <Frame id="whatif" kind="scenario planner" planNote={planNote}>
      <p className="text-xs text-slate-400 mb-2">
        Price a change of course before you make it. Each option runs on paper{live ? ` from week ${live.week + 1}` : ''}: the plan engine and the money, with no defects and no scope change.
        {live ? '' : ' The last column is the record for plans like it.'}
      </p>
      {alts.map((a, i) => (
        <div key={i} className="bg-slate-950 rounded-lg p-2 mb-2 space-y-1">
          <div className="text-xs font-semibold text-white">{names[i + 1]}</div>
          <Seg label={live ? 'Crews added' : 'Crews at start'} value={a.crews} onChange={setAlt(i, 'crews')} options={crewOpts.map((n) => [n, `+${n}`])} />
          <Seg label="Inspection" value={a.inspect} onChange={setAlt(i, 'inspect')} options={R.inspectionOptions.map((o) => [o, `${Math.round(o * 100)}%`])} />
          <Seg label="Second shift" value={a.shift} onChange={setAlt(i, 'shift')} options={[['none', 'None'], ['late', 'Wks 9–11'], ['every', 'Every week']]} />
        </div>
      ))}
      <table className="w-full text-xs text-slate-200 mt-2">
        <thead className="text-slate-400">
          <tr><th className="text-left font-semibold py-1">Option</th><th className="text-right font-semibold">Done on paper</th><th className="text-right font-semibold">Cost to finish</th><th className="text-right font-semibold">Money</th>{!live && <th className="text-right font-semibold">Record</th>}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-800 align-top">
              <td className="py-1.5 pr-1"><div className="text-white">{names[i]}</div><div className="text-[11px] text-slate-500">{describePlan(r.plan)}</div></td>
              <td className="text-right font-mono">wk {r.finish}</td>
              <td className={`text-right font-mono ${r.overBudget ? 'text-amber-300' : ''}`}>{money(r.cost)}</td>
              <td className={`text-right ${r.brokeWeek ? 'text-rose-300' : 'text-slate-400'}`}>{r.brokeWeek ? `runs out wk ${r.brokeWeek}` : 'lasts'}</td>
              {!live && (
                <td className="text-right font-mono whitespace-nowrap">wk {r.record.median}
                  <div className={`text-[11px] ${r.record.crewsDropped ? 'text-rose-300' : 'text-slate-500'}`}>{r.record.low}–{r.record.high} · {r.record.n} contracts{r.record.loose ? ' · loose' : ''}</div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-slate-500 mt-2">&quot;Done on paper&quot; is when the dashboard would read 100% if nothing goes wrong; acceptance comes later. This tab gives no forecast of its own.</p>
    </Frame>
  );
}

function RiskTab({ risks = [], onAddRisk, live }) {
  const [kind, setKind] = useState('scope');
  const [level, setLevel] = useState('medium');
  const [note, setNote] = useState('');
  const add = () => { if (onAddRisk) { onAddRisk({ kind, level, note: note.trim() }); setNote(''); } };
  const name = (k) => RISK_KINDS.find((r) => r.id === k).name;
  return (
    <Card title="Risk Register · your notes" tone="slate">
      <p className="text-xs text-slate-400">List what could go wrong and how likely you think it is. It changes nothing in the game. At the end you see which of your risks happened, and which happened that you didn&apos;t list.</p>
      <ul className="mt-3 divide-y divide-slate-800">
        {risks.length === 0 && <li className="text-sm text-slate-500 py-2">No risks logged yet.</li>}
        {risks.map((r, i) => (
          <li key={i} className="py-2 text-sm text-slate-200 flex justify-between gap-2">
            <span>{name(r.kind)}{r.note ? <span className="text-slate-400">: {r.note}</span> : ''}</span>
            <span className="text-xs text-slate-400 whitespace-nowrap">{r.level} · {r.week ? `after wk ${r.week}` : 'before wk 1'}</span>
          </li>
        ))}
      </ul>
      <div className="bg-slate-950 rounded-lg p-2 mt-3 space-y-2">
        <label className="block text-xs text-slate-400">Risk
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="mt-1 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white">
            {RISK_KINDS.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        </label>
        <Seg label="Likelihood" value={level} onChange={setLevel} options={RISK_LEVELS.map((l) => [l, l])} />
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder="What you'd watch for, or do (optional)" aria-label="Note"
          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white" />
        <button type="button" onClick={add} className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold">
          Add to the register{live ? ` (after week ${live.week})` : ''}
        </button>
      </div>
    </Card>
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

// ── People ───────────────────────────────────────────────────────────────────
function ChatTab({ S, plan, onUse, planNote, live }) {
  const people = teamChat(S, plan, live);
  const [open, setOpen] = useState(null);
  return (
    <Frame id="chat" kind="team thread" planNote={planNote}>
      <p className="text-xs text-slate-400 mb-2">Five colleagues, five ways of answering the same question. Each tag says what that person goes by.{live ? ` Updated after week ${live.week}.` : ''}</p>
      <div className="bg-slate-950 rounded-xl p-3 space-y-3">
        <div className="text-xs text-slate-500"># contract-200 · {live ? `after week ${live.week} · ` : ''}You: When will we be done?</div>
        {people.map((p) => (
          <div key={p.key} className="flex gap-2">
            <div className="w-8 h-8 rounded-full bg-violet-500/30 text-violet-200 text-sm font-bold flex items-center justify-center shrink-0">{p.name[0]}</div>
            <div className="min-w-0 flex-1">
              <div className="text-xs"><span className="font-semibold text-white">{p.name}</span> <span className="text-slate-500">{p.role}</span>
                <span className="ml-1 inline-block rounded bg-violet-500/20 text-violet-200 px-1.5 py-0.5 text-[11px]">{p.approach}</span></div>
              <div className="text-sm text-slate-200">{p.says}</div>
              <div className="flex gap-3 mt-1 text-xs">
                <button type="button" className="text-violet-300 underline" aria-expanded={open === p.key} onClick={() => setOpen(open === p.key ? null : p.key)}>{open === p.key ? 'Hide reasoning' : 'Why?'}</button>
                <button type="button" className="text-slate-300 underline" onClick={() => onUse('chat', p.forecast, p.name)}>Use {p.name}'s numbers</button>
              </div>
              {open === p.key && <div className="text-xs text-slate-400 mt-1 border-l-2 border-violet-500/50 pl-2">From: {p.frame}. {p.reasoning} In numbers: week {p.forecast.week}, range {p.forecast.low}–{p.forecast.high}, {p.forecast.chance}% for week 12.</div>}
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function AiTab({ S, plan, planNote, live, onNote }) {
  const text = aiPrompt(S, plan, live);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (onNote) onNote('ai-copy');
    try { await navigator.clipboard.writeText(text); setCopied(true); } catch {
      // No clipboard (an old browser, or not allowed): select the text so it can be copied by hand.
      const el = document.getElementById('ai-prompt'); if (el) { el.focus(); el.select(); }
    }
  };
  return (
    <Frame id="ai" kind="prompt for your AI assistant" planNote={planNote}>
      <p className="text-sm text-slate-300">Copy this into any AI assistant. It holds the basic numbers and the situation{live ? `, up to week ${live.week}` : ''}, and asks one question. How you question the AI after that is up to you.</p>
      <p className="text-xs text-slate-400 mt-1">The past contracts are not in it. Records can download them as a CSV file, to upload to the AI if you choose.</p>
      <button type="button" onClick={copy} className="mt-2 w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold">{copied ? 'Copied' : 'Copy the prompt'}</button>
      <textarea id="ai-prompt" readOnly value={text} rows={10} onFocus={(e) => e.target.select()}
        className="mt-2 w-full bg-slate-950 border border-slate-700 rounded-xl p-3 font-mono text-[11px] text-slate-300" />
      <p className="text-[11px] text-slate-500 mt-1">{text.length.toLocaleString()} characters. This tab gives no forecast of its own; type the AI's numbers into your forecast if you want to use them.</p>
    </Frame>
  );
}

// ── The record ───────────────────────────────────────────────────────────────
function RecordsTab({ S, plan, planReady, onUse, onNote }) {
  const past = pastContracts();
  const csv = () => { if (onNote) onNote('records-csv'); downloadText('best-laid-plans-past-contracts.csv', recordsCsv(S), 'text/csv'); };
  return (
    <Card title="Records · project database" tone="amber">
      <Records past={past} plan={planReady ? plan : null} onUse={(f, label) => onUse('records', f, label)} />
      <button type="button" onClick={csv} className="mt-3 w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold">Download the records (.csv)</button>
      <p className="text-[11px] text-slate-500 mt-1">All {past.contracts.length} contracts, one row each: for a spreadsheet, or to upload to an AI.</p>
    </Card>
  );
}

/** One tool tab. `plan` is the stated plan before week 1 (hands-off until one is stated), and this week's decisions during play. */
export default function DeskTab({ id, S, plan, planReady, onUse, live = null, risks = [], onAddRisk = null, onNote = null }) {
  const planNote = live
    ? <p className="text-xs text-slate-500 mb-3">From week {live.week + 1} on, assuming this week's decisions: {describePlan(plan)}.</p>
    : !planReady
      ? <p className="text-xs text-violet-200 mb-3">Assuming a hands-off plan until you state yours on the front tab.</p>
      : <p className="text-xs text-slate-500 mb-3">For your plan: {describePlan(plan)}.</p>;
  const props = { S, plan, onUse, planNote, live, onNote };
  switch (id) {
    case 'contract': return <ContractTab />;
    case 'status': return <StatusTab {...props} />;
    case 'controls': return <ControlsTab {...props} />;
    case 'whatif': return <WhatIfTab key={live ? live.week : 'brief'} {...props} />;
    case 'risks': return <RiskTab risks={risks} onAddRisk={onAddRisk} live={live} />;
    case 'last5': return <Last5Tab {...props} />;
    case 'chat': return <ChatTab {...props} />;
    case 'ai': return <AiTab {...props} />;
    case 'records': return <RecordsTab S={S} plan={plan} planReady={planReady || !!live} onUse={onUse} onNote={onNote} />;
    default: return null;
  }
}
