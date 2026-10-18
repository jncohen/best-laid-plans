// The Decision Desk's tool tabs. Each is a generic replica of a dashboard genre, fed
// only by desk.js, which sees only what the briefing shows.
import { useState } from 'react';
import { statusReport, lastFive, teamChat, tabById } from './desk.js';
import { CONFIG, pastContracts, describePlan, onboardingRule, failuresLine } from './engine';
import { Card, ScoringNote } from './ui';
import { CHART_W as W, CHART_CLASS, svgText } from './chartStyle';
import { money } from './format';
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
        <p>Your company can overspend the budget by up to {money(c.creditLine)} on credit. Past that, it can't make payroll: the company goes bankrupt and the contract ends. Either way, bankrupt or terminated, the contract is never delivered.</p>
        <p>Customers on this line add to the requirement partway through: every past contract on record had a scope change. Nobody knows in advance which week it comes or how many units it adds.</p>
        <p>Some built units turn out defective. The dashboard counts them complete until inspection or the customer's acceptance test finds them.</p>
        <p>Contracts differ: some lines build faster or slower than others, and some turn out more defects. Each week's output and inspection finds show how this one runs. Your line also has its own week-to-week luck.</p>
      </div>
      <div className="mt-4 pt-3 border-t border-slate-800">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">What you decide each week</div>
        <ul className="space-y-2 text-sm text-slate-300">
          <li><strong className="text-white">Crews.</strong> Add up to {c.maxHirePerWeek} a week ({money(c.hireFee)} each, {c.maxCrews} crews at most) or
            release one ({money(c.releaseFee)}). {onboardingRule(c)} Every crew beyond {c.crews} makes all of them a little less efficient. Each crew costs {money(c.crewWeek)} a week.</li>
          <li><strong className="text-white">Second shift.</strong> +{Math.round((c.shiftBoost - 1) * 100)}% output for {money(c.shiftPremiumPerCrew)} per crew. From the second straight week, tired crews make more defects.</li>
          <li><strong className="text-white">Inspection.</strong> Move 0–30% of the line from building to checking. You build less, but you find defects while they are cheap. Each unit the customer's test rejects takes {c.lateFixMultiplier} units of work to fix.</li>
          <li><strong className="text-white">Your forecast.</strong> Each week you may move your finish-week estimate.</li>
        </ul>
        <ScoringNote className="mt-3" />
        <p className="text-xs text-slate-400 mt-1">
          The forecast is the one you commit before week 1: the week, the 80% range and the chance of week {c.deadline}. It loses points for being far off, for a wide range and for a range that misses: a narrow range that holds scores best.
          Delivery: −{c.latePenaltyPerWeek} a week late, −{c.overspendPenaltyPer50k} per $50k over budget, 0 if the contract is never delivered.
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
      <div className="bg-slate-950 rounded-xl p-3 space-y-3">
        <div className="text-xs text-slate-500"># contract-200 · {live ? `after week ${live.week} · ` : ''}You: When will we be done?</div>
        {people.map((p) => (
          <div key={p.key} className="flex gap-2">
            <div className="w-8 h-8 rounded-full bg-violet-500/30 text-violet-200 text-sm font-bold flex items-center justify-center shrink-0">{p.name[0]}</div>
            <div className="min-w-0 flex-1">
              <div className="text-xs"><span className="font-semibold text-white">{p.name}</span> <span className="text-slate-500">{p.role}</span></div>
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

// ── The record ───────────────────────────────────────────────────────────────
function RecordsTab({ plan, planReady, onUse }) {
  const past = pastContracts();
  return (
    <Card title="Records · project database" tone="amber">
      <Records past={past} plan={planReady ? plan : null} onUse={(f, label) => onUse('records', f, label)} />
    </Card>
  );
}

/** One tool tab. `plan` is the stated plan before week 1 (hands-off until one is stated), and this week's decisions during play. */
export default function DeskTab({ id, S, plan, planReady, onUse, live = null }) {
  const planNote = live
    ? <p className="text-xs text-slate-500 mb-3">From week {live.week + 1} on, assuming this week's decisions: {describePlan(plan)}.</p>
    : !planReady
      ? <p className="text-xs text-violet-200 mb-3">Assuming a hands-off plan until you state yours on the front tab.</p>
      : <p className="text-xs text-slate-500 mb-3">For your plan: {describePlan(plan)}.</p>;
  const props = { S, plan, onUse, planNote, live };
  switch (id) {
    case 'contract': return <ContractTab />;
    case 'status': return <StatusTab {...props} />;
    case 'last5': return <Last5Tab {...props} />;
    case 'chat': return <ChatTab {...props} />;
    case 'records': return <RecordsTab plan={plan} planReady={planReady || !!live} onUse={onUse} />;
    default: return null;
  }
}
