import { useMemo, useState } from 'react';
import { CONFIG, pastContracts, describePlan, onboardingRule, failuresLine } from './engine';
import { TABS, screenData, liveScreen } from './desk.js';
import DeskTab from './DeskTabs';
import TabStrip from './DeskStrip';
import { Card, Stat, Slider } from './ui';
import { money, pct } from './format';
import { ProgressSpark, ForecastChart } from './charts';

const DECIDE = { id: 'decide', short: "This Week's Decisions" };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

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
    setSeenTabs([]);
    setDeskTab('decide');
  };
  const openTab = (id) => {
    setDeskTab(id);
    if (id !== 'decide' && !seenTabs.includes(id)) { setSeenTabs((t) => [...t, id]); p.noteDesk(nextWeek, id); }
    window.scrollTo(0, 0);
  };
  const useTool = (id, f) => {
    setUseNote(f.fail ? `${f.fail}: the range is from the delivered ones, and the chance counts the rest as not on time.` : null);
    moveForecast(Math.min(lastWeek, Math.max(nextWeek, f.week)));
    moveRange({ low: f.low, high: Math.min(lastWeek, f.high), chance: Math.round(f.chance / 5) * 5 });
    p.noteDesk(nextWeek, `use:${id}`);
    openTab('decide');
  };
  const live = liveScreen(p);
  // The tools work from where the contract stands and this week's decisions.
  const current = { crews: Math.max(0, crewsNext - c.crews), inspect, shift: shift ? 'every' : 'none' };

  const late = nextWeek > c.deadline;
  // The scope change and an acceptance rejection get their own cards; the rest stay in the week's log.
  const logLines = last ? last.events.filter((e) => !/^Customer acceptance test|changed the requirement/.test(e)) : [];
  const weeksLeft = c.deadline - p.week;
  const lateShift = p.plan && p.plan.shift === 'late' && nextWeek >= 9 && nextWeek <= 11;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold text-white">Week {nextWeek}</h1>
        <span className={`text-sm font-mono ${late ? 'text-rose-400' : 'text-slate-400'}`}>
          {late ? `${plural(nextWeek - c.deadline, 'week')} past the deadline` : `${plural(weeksLeft, 'week')} left`}
        </span>
      </header>

      <TabStrip tab={deskTab} opened={seenTabs} onOpen={openTab} front={DECIDE} tabs={TABS.slice(1)} />

      {deskTab !== 'decide' ? (
        <>
          <DeskTab id={deskTab} S={S} plan={current} planReady onUse={useTool} live={live} />
          <button type="button" onClick={() => openTab('decide')} className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold">
            Back to This Week's Decisions
          </button>
        </>
      ) : (<>

      <Card title="Your prediction" tone="emerald">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-sm text-slate-300">The customer accepts it in</span>
          <span className="text-3xl font-bold font-mono text-emerald-300">week {shownForecast}</span>
        </div>
        <ForecastChart
          compact log={[...p.forecastLog, { week: nextWeek, forecast: shownForecast }]} interval={p.forecast}
          band={[past.p10, past.p90]} deadline={c.deadline} xEnd={Math.max(c.deadline, nextWeek)}
        />
        <Slider label="Move it if the evidence says so" value={shownForecast} min={nextWeek} max={lastWeek} onChange={moveForecast}
          format={(v) => `week ${v}`}
          hint={`Committed before week 1 (the forecast that is scored): week ${p.forecast.week}, 80% sure of ${p.forecast.low}–${p.forecast.high}. Amber band: where most delivered past contracts landed${past.failed.total ? `; ${failuresLine(past)}` : ''}.`} />
        {calendarMoved.length > 0 && !touched && (
          <p className="text-xs text-amber-200 mt-1">The calendar moved {calendarMoved.join(', and ')}: those weeks have passed. Nothing else moves your forecast but you.</p>
        )}
        {useNote && <p className="text-xs text-rose-300 mt-1">{useNote}</p>}
        <details className="mt-2 text-sm">
          <summary className="text-slate-300 cursor-pointer">Now: 80% range weeks {shownRange.low}–{shownRange.high}, {shownRange.chance}% for week {c.deadline}</summary>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            <Slider label="Earliest (80% sure)" value={shownRange.low} min={nextWeek} max={lastWeek} onChange={(v) => moveRange((r) => ({ ...r, low: Math.min(v, shownForecast) }))} format={(v) => `week ${v}`} />
            <Slider label="Latest" value={shownRange.high} min={nextWeek} max={lastWeek} onChange={(v) => moveRange((r) => ({ ...r, high: Math.max(v, shownForecast) }))} format={(v) => `week ${v}`} />
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Week {lastWeek} is the last: after it the customer terminates the contract.</p>
          <Slider label={`Chance of week ${c.deadline}`} value={shownRange.chance} min={0} max={100} step={5} onChange={(v) => moveRange((r) => ({ ...r, chance: v }))} format={(v) => `${v}%`} />
        </details>
      </Card>

      {/* The week's big moments, as cards rather than log lines. */}
      {last && last.shock > 0 && (
        <div role="status" className="rounded-xl border-2 border-amber-400 bg-amber-500/15 px-4 py-3 text-amber-100 font-bold">
          The customer added {last.shock} units in week {last.week}.
        </div>
      )}
      {last && last.rejected > 0 && (
        <div role="status" className="rounded-xl border-2 border-rose-400 bg-rose-500/15 px-4 py-3 text-rose-100 font-bold">
          Customer acceptance test: {last.rejected} unit{last.rejected === 1 ? '' : 's'} rejected. Fixing {last.rejected === 1 ? 'it' : 'them'} now takes {last.rejected * c.lateFixMultiplier} units of work.
        </div>
      )}

      <Card title="Dashboard">
        <div className="flex items-end justify-between mb-1">
          <span className="text-sm text-slate-300">Reported complete</span>
          <span className="text-3xl font-bold font-mono text-sky-300">{pct(p.reportedPct())}</span>
        </div>
        <div className="h-3 bg-slate-950 rounded-full overflow-hidden">
          <div className="h-full bg-sky-500 transition-all" style={{ width: pct(p.reportedPct()) }} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <Stat label="Units left" value={Math.round(p.backlog)} sub={`of ${p.totalScope}`} />
          <Stat label="Crews" value={crewsNext} sub={hire > 0 ? `${p.crews} + ${hire} this week` : hire < 0 ? `${p.crews} − ${-hire} this week` : p.onboarding > 0 ? 'onboarding' : ''} />
          <Stat label="Budget left" value={money(p.budget)} sub={p.budget < 0 ? `credit left ${money(c.creditLine + p.budget)}` : `+ ${money(c.creditLine)} credit`} tone={p.budget < 0 ? 'text-rose-400' : 'text-emerald-300'} />
          <Stat label="Defects found" value={last ? Math.round(last.found + last.rejected) : 0} sub={last ? `in week ${last.week}` : 'none yet'} tone={last && last.rejected > 0 ? 'text-rose-400' : 'text-white'} />
        </div>
        {p.history.length > 0 && (
          <div className="mt-4">
            <ProgressSpark history={p.history} deadline={c.deadline} end={Math.max(c.deadline, p.week) + 1} />
          </div>
        )}
        {logLines.length > 0 && (
          <div className="mt-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">What happened in week {last.week}</div>
            <ul className="mt-1 space-y-1 text-sm">
              {logLines.map((e, i) => (
                <li key={i} className={/rejected|changed the requirement/.test(e) ? 'text-amber-300' : 'text-slate-400'}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card title={`Decide week ${nextWeek}`}>
        <div className="space-y-5">
          {p.plan && (
            <p className="text-xs text-slate-400 leading-snug">
              Your plan: {describePlan(p.plan)}.{week1 ? ' Week 1 is set from it below; change anything you like.' : ' A reminder: change course any week.'}
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

          {p.budget - cost < -c.creditLine && (
            <p className="text-xs text-rose-300">This week would take you past the {money(c.creditLine)} credit line. The company couldn't make payroll: it would go bankrupt and the contract would end, never delivered.</p>
          )}
          <button type="button" onClick={run}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold">
            Play week {nextWeek} · {money(cost)}
          </button>
        </div>
      </Card>
      </>)}
    </div>
  );
}
