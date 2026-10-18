import { useMemo, useState } from 'react';
import { CONFIG, pastContracts, describePlan, onboardingRule, failuresLine, dashboardPeak } from './engine';
import { TABS, screenData, liveScreen } from './desk.js';
import DeskTab from './DeskTabs';
import TabStrip from './DeskStrip';
import { Card, Slider } from './ui';
import { money, pct } from './format';
import { ProgressSpark, ForecastChart } from './charts';

const DECIDE = { id: 'decide', short: "This Week's Decisions" };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A KPI tile on the dashboard's top row. */
function Kpi({ label, value, sub, tone = 'text-white', children }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-slate-400 leading-tight">{label}</div>
      <div className={`text-2xl font-bold font-mono leading-tight ${tone}`}>{value}</div>
      {children}
      {sub && <div className="text-[11px] text-slate-500 leading-tight mt-0.5">{sub}</div>}
    </div>
  );
}

export default function Play({ project, onPlay, initialSeen = [], initialTab = 'decide' }) {
  const c = CONFIG;
  const p = project;
  const past = pastContracts();
  const last = p.history[p.history.length - 1];
  const lastLog = p.forecastLog[p.forecastLog.length - 1];
  const lastForecast = lastLog?.forecast ?? p.forecast.week;
  const S = useMemo(() => screenData(), []);
  // Week 1 starts from the plan the student committed: its crews, inspection and shift. They can change it any week.
  const week1 = p.week === 0 && p.plan;
  const maxHire = Math.min(c.maxHirePerWeek, c.maxCrews - p.crews);

  const [hire, setHire] = useState(week1 ? Math.min(maxHire, p.plan.crews) : 0);
  const [shift, setShift] = useState(week1 ? p.plan.shift === 'every' : false);
  const [inspect, setInspect] = useState(week1 ? p.plan.inspect : last ? last.inspect : 0);
  const [forecast, setForecast] = useState(lastForecast);
  // The running forecast's range and chance, carried from week to week; the week-1 commitment is what is scored.
  const [range, setRange] = useState({ low: lastLog?.low ?? p.forecast.low, high: lastLog?.high ?? p.forecast.high, chance: lastLog?.chance ?? p.forecast.onTimeChance });
  // The decisions tab opens each week; tool tabs sit beside it. Switching tabs keeps every choice above.
  const [deskTab, setDeskTab] = useState(initialTab);
  const [seenTabs, setSeenTabs] = useState(initialSeen);
  // For "How you played": did the student move the running forecast this week, and how long did the week take.
  const [touched, setTouched] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [, setTaps] = useState(0); // re-render after a checkpoint tap
  const [useNote, setUseNote] = useState(null); // the failures behind numbers taken from the record
  const [weekStart, setWeekStart] = useState(() => Date.now());
  const moveForecast = (v) => { setForecast(v); setTouched(true); };
  const moveRange = (f) => { setRange((r) => (typeof f === 'function' ? f(r) : f)); setTouched(true); };

  const nextWeek = p.week + 1;
  const lastWeek = c.horizon;
  // A forecast earlier than the week about to be played is no longer possible: the calendar moves it, and says so.
  const shownForecast = Math.min(lastWeek, Math.max(forecast, nextWeek));
  const cost = p.weekCost({ hire, shift });
  const crewsNext = Math.max(1, p.crews + hire);
  // Fatigue from the second straight week of a second shift.
  const fatigueNext = shift && p.shiftStreak >= 1;

  const shownRange = { low: Math.min(Math.max(range.low, nextWeek), shownForecast), high: Math.min(lastWeek, Math.max(range.high, shownForecast)), chance: nextWeek > c.deadline ? 0 : range.chance };
  const calendarMoved = [
    forecast < nextWeek && `your forecast from week ${forecast} to week ${shownForecast}`,
    range.low < nextWeek && `the start of your range from week ${range.low} to week ${shownRange.low}`,
    nextWeek > c.deadline && range.chance > 0 && `your chance of week ${c.deadline} to 0%`,
  ].filter(Boolean);
  const run = () => {
    // A forecast the student left behind the calendar is carried forward to the week being played; mark it.
    p.noteTime(nextWeek, (Date.now() - weekStart) / 1000);
    onPlay({ hire, shift, inspect, forecast: shownForecast, range: { ...shownRange, carried: forecast < nextWeek && !touched, touched } });
    setTouched(false);
    setWeekStart(Date.now());
    setHire(0);
    setRangeOpen(false);
    setSeenTabs([]);
    setDeskTab('decide');
  };
  const openTab = (id) => {
    setDeskTab(id);
    if (id !== 'decide' && !seenTabs.includes(id)) { setSeenTabs((t) => [...t, id]); p.noteDesk(nextWeek, id); }
    window.scrollTo(0, 0);
  };
  const useTool = (id, f, who = null) => {
    setUseNote(f.fail ? `${f.fail}: the range is from the delivered ones, and the chance counts the rest as not on time.` : null);
    moveForecast(Math.min(lastWeek, Math.max(nextWeek, f.week)));
    moveRange({ low: f.low, high: Math.min(lastWeek, f.high), chance: Math.round(f.chance / 5) * 5 });
    // Team Chat names the colleague whose numbers were used.
    p.noteDesk(nextWeek, `use:${id}${id === 'chat' && who ? `:${who}` : ''}`);
    openTab('decide');
  };
  const live = liveScreen(p);
  // The tools work from where the contract stands and this week's decisions.
  const current = { crews: Math.max(0, crewsNext - c.crews), inspect, shift: shift ? 'every' : 'none' };

  const late = nextWeek > c.deadline;
  const logLines = last ? last.events : [];
  const rows = p.history.filter((r) => !r.bankrupt);
  const firstNinety = rows.find((r) => dashboardPeak(r) >= 0.9);
  // Fix 3: how long the money lasts at this week's spend, and a warning one week before bankruptcy is unavoidable.
  const avail = p.budget + c.creditLine;
  const steady = crewsNext * c.crewWeek + (shift ? crewsNext * c.shiftPremiumPerCrew : 0);
  const lastsTo = cost > avail ? p.week : nextWeek + Math.floor((avail - cost) / Math.max(1, steady));
  const brokeNext = cost <= avail && avail - cost < steady;

  // One card per event, in the week it happens: the scope change, the dashboard first passing 90%, an
  // acceptance rejection, and the first time the money runs out before the forecast. It says what happened
  // and holds the next week until the student keeps or changes the forecast.
  const runwayBase = last ? p.week + Math.floor(avail / Math.max(1, p.crews * c.crewWeek + (last.shift ? p.crews * c.shiftPremiumPerCrew : 0))) : lastWeek;
  const due = !last ? [] : [
    last.shock > 0 && { event: 'scope', text: `The customer added ${last.shock} units in week ${last.week}.` },
    firstNinety && firstNinety.week === last.week && { event: 'ninety', text: `Your dashboard passed 90% in week ${last.week} (it read ${Math.round(dashboardPeak(last) * 100)}%).` },
    last.rejected > 0 && { event: 'reject', text: `Your dashboard read 100%, and the customer's acceptance test rejected ${last.rejected} unit${last.rejected === 1 ? '' : 's'} in week ${last.week}. Fixing ${last.rejected === 1 ? 'it' : 'them'} now takes ${last.rejected * c.lateFixMultiplier} units of work.` },
    runwayBase < lastForecast && !p.checkpoints.some((k) => k.event === 'runway') && { event: 'runway', text: `At this spend the money lasts to week ${runwayBase}.` },
  ].filter(Boolean);
  const pending = due.filter((d) => !p.checkpoints.some((k) => k.week === nextWeek && k.event === d.event));
  const tap = (choice) => {
    for (const d of pending) p.noteCheckpoint(nextWeek, d.event, choice);
    if (choice === 'change') setRangeOpen(true);
    setTaps((n) => n + 1);
  };
  const weeksLeft = c.deadline - p.week;
  const lateShift = p.plan && p.plan.shift === 'late' && nextWeek >= 9 && nextWeek <= 11;

  const rangeText = shownRange.low === shownRange.high ? `week ${shownRange.low}` : `weeks ${shownRange.low}–${shownRange.high}`;
  const defects = last ? Math.round(last.found + last.rejected) : 0;
  const onFront = deskTab === 'decide';

  return (
    <div className="max-w-6xl mx-auto px-4 py-5 space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Contract · {p.totalScope} units · deadline week {c.deadline}</div>
          <h1 className="text-xl font-bold text-white">Week {nextWeek}</h1>
        </div>
        <div className="flex items-baseline gap-3 text-sm font-mono">
          <span className={late ? 'text-rose-400' : 'text-slate-400'}>{late ? `${plural(nextWeek - c.deadline, 'week')} past the deadline` : `${plural(weeksLeft, 'week')} left`}</span>
          <span className="text-emerald-300">Forecast: week {shownForecast}</span>
        </div>
      </header>

      <TabStrip tab={deskTab} opened={seenTabs} onOpen={openTab} front={DECIDE} tabs={TABS.slice(1)} />

      {/* The event card: one per event, in the week it happens, above everything. */}
      {pending.length > 0 && (
        <div role="dialog" aria-label="What happened" className="rounded-xl border-2 border-amber-400 bg-slate-900 px-4 py-3 space-y-2">
          {pending.map((d) => <p key={d.event} className="font-bold text-amber-100">{d.text}</p>)}
          <p className="text-sm text-slate-300">Your forecast: week {shownForecast}, {rangeText}, {shownRange.chance}% for week {c.deadline}.</p>
          <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
            <button type="button" onClick={() => tap('keep')} className="py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-semibold">Keep forecast</button>
            <button type="button" onClick={() => tap('change')} className="py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold">Change forecast</button>
          </div>
        </div>
      )}

      {/* Desktop: your forecast and decisions always on the left; the information on the right (the dashboard,
          or the tab you choose). Phone: one at a time, as the tabs choose; the KPI row comes first. */}
      {onFront && <div className="lg:hidden">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <Kpi label="Reported complete" value={pct(p.reportedPct())} tone="text-sky-300">
          <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden mt-1"><div className="h-full bg-sky-500" style={{ width: pct(p.reportedPct()) }} /></div>
        </Kpi>
        <Kpi label="Units left" value={Math.round(p.backlog)} sub={`of ${p.totalScope}`} />
        <Kpi label="Crews" value={crewsNext} sub={hire > 0 ? `${p.crews} + ${hire} this week` : hire < 0 ? `${p.crews} − ${-hire} this week` : p.onboarding > 0 ? 'onboarding' : 'this week'} />
        <Kpi label="Budget left" value={money(p.budget)} sub={p.budget < 0 ? `credit left ${money(c.creditLine + p.budget)}` : `+ ${money(c.creditLine)} credit`} tone={p.budget < 0 ? 'text-rose-400' : 'text-emerald-300'} />
        <Kpi label="Money lasts to" value={`wk ${lastsTo}`} sub={lastsTo < shownForecast ? `before your forecast (wk ${shownForecast})` : 'at this spend'} tone={lastsTo < shownForecast ? 'text-rose-400' : 'text-white'} />
        <Kpi label="Defects found" value={defects} sub={last ? `in week ${last.week}` : 'none yet'} tone={last && last.rejected > 0 ? 'text-rose-400' : 'text-white'} />
      </div>
      </div>}

      <div className="grid grid-cols-1 lg:grid-cols-[400px_minmax(0,1fr)] gap-4 items-start">
        <div className={`${onFront ? '' : 'hidden lg:block'} space-y-4 lg:sticky lg:top-4 min-w-0`}>
      <Card title="Your forecast" tone="emerald">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-sm text-slate-300">The customer accepts it in</span>
          <span className="text-3xl font-bold font-mono text-emerald-300">week {shownForecast}</span>
        </div>
        <Slider label="Move it if the evidence says so" value={shownForecast} min={nextWeek} max={lastWeek} onChange={moveForecast}
          format={(v) => `week ${v}`}
          hint={`Committed before week 1 (the forecast that is scored): week ${p.forecast.week}, 80% sure of ${p.forecast.low}–${p.forecast.high}.`} />
        {calendarMoved.length > 0 && !touched && (
          <p className="text-xs text-amber-200 mt-1">The calendar moved {calendarMoved.join(', and ')}: those weeks have passed. Nothing else moves your forecast but you.</p>
        )}
        {useNote && <p className="text-xs text-rose-300 mt-1">{useNote}</p>}
        <details className="mt-2 text-sm" open={rangeOpen} onToggle={(e) => setRangeOpen(e.currentTarget.open)}>
          <summary className="text-slate-300 cursor-pointer">Now: 80% range {rangeText}, {shownRange.chance}% for week {c.deadline}</summary>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3 mt-2">
            <Slider label="Earliest (80% sure)" value={shownRange.low} min={nextWeek} max={lastWeek} onChange={(v) => moveRange((r) => ({ ...r, low: Math.min(v, shownForecast) }))} format={(v) => `week ${v}`} />
            <Slider label="Latest" value={shownRange.high} min={nextWeek} max={lastWeek} onChange={(v) => moveRange((r) => ({ ...r, high: Math.max(v, shownForecast) }))} format={(v) => `week ${v}`} />
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Week {lastWeek} is the last: after it the customer terminates the contract.</p>
          <Slider label={`Chance of week ${c.deadline}`} value={shownRange.chance} min={0} max={100} step={5} onChange={(v) => moveRange((r) => ({ ...r, chance: v }))} format={(v) => `${v}%`} />
        </details>
      </Card>

      <Card title={`Decide week ${nextWeek}`}>
        <div className="space-y-5">
          {p.plan && (
            <p className="text-xs text-slate-400 leading-snug">
              Your stated plan: {describePlan(p.plan)}.{week1 ? ' Week 1 is set from it below; change anything you like.' : ` This week: ${crewsNext} crews, ${Math.round(inspect * 100)}% inspection, ${shift ? 'a second shift' : 'no second shift'}.`}
              {lateShift && !shift && <span className="text-amber-200"> Your plan has a second shift in weeks 9–11.</span>}
            </p>
          )}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-300">Crews</span>
              <span className="font-mono font-bold text-white">{crewsNext}</span>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setHire((h) => Math.max(-(p.crews - 1), h - 1))} disabled={crewsNext <= 1}
                className="flex-1 py-2 rounded-lg bg-slate-800 disabled:opacity-40 text-white">− Release</button>
              <button type="button" onClick={() => setHire((h) => Math.min(maxHire, h + 1))} disabled={hire >= maxHire}
                className="flex-1 py-2 rounded-lg bg-slate-800 disabled:opacity-40 text-white">+ Add</button>
            </div>
            {/* Space is kept for this line so nothing below jumps when a crew is added. */}
            <p className="text-xs text-amber-300 mt-1 min-h-[2.5rem]">
              {hire > 0 ? `${money(hire * c.hireFee)} fee. ${onboardingRule(c)}` : hire < 0 ? `${money(Math.min(-hire, p.crews - 1) * c.releaseFee)} to release.` : ''}
            </p>
          </div>

          <button
            type="button" onClick={() => setShift((s) => !s)} aria-pressed={shift}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border text-sm ${shift ? 'bg-amber-500/15 border-amber-500/50 text-amber-200' : 'bg-slate-950 border-slate-700 text-slate-300'}`}
          >
            <span><span className="mr-2" aria-hidden="true">{shift ? '☑' : '☐'}</span>Second shift (+{Math.round((c.shiftBoost - 1) * 100)}% output)</span>
            <span className="font-mono">{money(crewsNext * c.shiftPremiumPerCrew)}</span>
          </button>
          {fatigueNext && <p className="text-xs text-rose-300 -mt-3">Second straight week: tired crews make more defects.</p>}

          <div>
            <div className="text-sm text-slate-300 mb-1">Inspection: share of the line checking instead of building</div>
            <div className="grid grid-cols-4 gap-2">
              {c.inspectionOptions.map((o) => (
                <button key={o} type="button" onClick={() => setInspect(o)} aria-pressed={inspect === o}
                  className={`py-2 rounded-lg text-sm font-mono border ${inspect === o ? 'bg-sky-500/20 border-sky-400 text-sky-200' : 'bg-slate-950 border-slate-700 text-slate-400'}`}>
                  {Math.round(o * 100)}%
                </button>
              ))}
            </div>
          </div>

          <p className={`text-sm ${lastsTo < shownForecast ? 'text-rose-300 font-semibold' : 'text-slate-400'}`}>
            Money lasts to week {lastsTo} at this spend{lastsTo < shownForecast ? `, before your forecast of week ${shownForecast}` : ''}.
          </p>
          {brokeNext && (
            <p className="text-sm font-bold text-rose-200 bg-rose-500/15 border border-rose-400 rounded-lg px-3 py-2">At this spend, next week's payroll will take the company past its credit line: it would go bankrupt.</p>
          )}
          {p.budget - cost < -c.creditLine && (
            <p className="text-xs text-rose-300">This week would take you past the {money(c.creditLine)} credit line. The company couldn't make payroll: it would go bankrupt and the contract would end, never delivered.</p>
          )}
          <button type="button" onClick={run} disabled={pending.length > 0}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold">
            Play week {nextWeek} · {money(cost)}
          </button>
          {pending.length > 0 && <p className="text-xs text-slate-400 text-center -mt-2">Keep or change your forecast first (the card above).</p>}
        </div>
      </Card>
        </div>

        <div className="space-y-4 min-w-0">
          {!onFront ? (<>
            <DeskTab id={deskTab} S={S} plan={current} planReady onUse={useTool} live={live} risks={p.risks} onAddRisk={(r) => { p.noteRisk(p.week, r); setTaps((n) => n + 1); }} />
            <button type="button" onClick={() => openTab('decide')} className="lg:hidden w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold">
              Back to This Week's Decisions
            </button>
          </>) : (<>
            <div className="hidden lg:block">
      <div className="grid grid-cols-3 xl:grid-cols-6 gap-2">
        <Kpi label="Reported complete" value={pct(p.reportedPct())} tone="text-sky-300">
          <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden mt-1"><div className="h-full bg-sky-500" style={{ width: pct(p.reportedPct()) }} /></div>
        </Kpi>
        <Kpi label="Units left" value={Math.round(p.backlog)} sub={`of ${p.totalScope}`} />
        <Kpi label="Crews" value={crewsNext} sub={hire > 0 ? `${p.crews} + ${hire} this week` : hire < 0 ? `${p.crews} − ${-hire} this week` : p.onboarding > 0 ? 'onboarding' : 'this week'} />
        <Kpi label="Budget left" value={money(p.budget)} sub={p.budget < 0 ? `credit left ${money(c.creditLine + p.budget)}` : `+ ${money(c.creditLine)} credit`} tone={p.budget < 0 ? 'text-rose-400' : 'text-emerald-300'} />
        <Kpi label="Money lasts to" value={`wk ${lastsTo}`} sub={lastsTo < shownForecast ? `before your forecast (wk ${shownForecast})` : 'at this spend'} tone={lastsTo < shownForecast ? 'text-rose-400' : 'text-white'} />
        <Kpi label="Defects found" value={defects} sub={last ? `in week ${last.week}` : 'none yet'} tone={last && last.rejected > 0 ? 'text-rose-400' : 'text-white'} />
      </div>
            </div>
          <Card title="Progress: reported complete">
            {p.history.length > 0
              ? <ProgressSpark history={p.history} deadline={c.deadline} end={Math.max(c.deadline, p.week) + 1} />
              : <p className="text-sm text-slate-400">No weeks played yet.</p>}
          </Card>
          <Card title="Your forecast, week by week">
            <ForecastChart
              compact log={[...p.forecastLog, { week: nextWeek, forecast: shownForecast }]} interval={p.forecast}
              band={[past.p10, past.p90]} deadline={c.deadline} xEnd={Math.max(c.deadline, nextWeek)}
            />
            <p className="text-[11px] text-slate-500 mt-1">Amber band: where most delivered past contracts landed{past.failed.total ? `; ${failuresLine(past)}` : ''}.</p>
          </Card>
          {logLines.length > 0 && (
            <Card title={`What happened in week ${last.week}`}>
              <ul className="space-y-1 text-sm">
                {logLines.map((e, i) => (
                  <li key={i} className={/rejected|changed the requirement/.test(e) ? 'text-amber-300' : 'text-slate-300'}>{e}</li>
                ))}
              </ul>
            </Card>
          )}
          </>)}
        </div>
      </div>
    </div>
  );
}
