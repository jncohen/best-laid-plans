import { useMemo, useState } from 'react';
import { CONFIG, pastContracts, describePlan, onboardingRule, isCheck, failuresLine, viewLimit, canOpen } from './engine';
import { TABS, screenData, liveScreen } from './desk.js';
import DeskTab from './DeskTabs';
import TabStrip from './DeskStrip';
import { Card, Stat, Slider } from './ui';
import { money, pct } from './format';
import { ProgressSpark, ForecastChart } from './charts';

const DECIDE = { id: 'decide', short: "This Week's Decisions" };

export default function Play({ project, onPlay, initialSeen = [], initialTab = 'decide' }) {
  const c = CONFIG;
  const p = project;
  const past = pastContracts();
  const last = p.history[p.history.length - 1];
  const lastLog = p.forecastLog[p.forecastLog.length - 1];
  const lastForecast = lastLog?.forecast ?? p.forecast.week;
  const S = useMemo(() => screenData(), []);

  const [hire, setHire] = useState(0);
  const [shift, setShift] = useState(false);
  const [inspect, setInspect] = useState(last ? last.inspect : 0);
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
  const limit = viewLimit(nextWeek, c);
  // In round 1 the AI prompt holds every tab opened so far, the briefing's included.
  const promptTabs = nextWeek === 1 ? [...new Set([...(p.desk?.order || []), ...seenTabs])] : seenTabs;
  // A forecast earlier than the week about to be played is no longer possible.
  const shownForecast = Math.max(forecast, nextWeek);
  const cost = p.weekCost({ hire, shift });
  const crewsNext = Math.max(1, p.crews + hire);
  const fatigueNext = shift && p.shiftStreak >= 1;
  const maxHire = Math.min(c.maxHirePerWeek, c.maxCrews - p.crews);

  const shownRange = { low: Math.min(Math.max(range.low, nextWeek), shownForecast), high: Math.max(range.high, shownForecast), chance: nextWeek > c.deadline ? 0 : range.chance };
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
    // Unlimited in week 1 (round 1), then viewsPerWeek tool tabs a week; tabs already viewed this week stay open,
    // and This Week's Decisions, The Contract and Ask an AI never count.
    if (!canOpen(id, seenTabs, limit)) return;
    setDeskTab(id);
    if (id !== 'decide' && !seenTabs.includes(id)) { setSeenTabs((t) => [...t, id]); p.noteDesk(nextWeek, id); }
    window.scrollTo(0, 0);
  };
  const useTool = (id, f) => {
    setUseNote(f.fail ? `${f.fail}: the range is from the delivered ones, and the chance counts the rest as not on time.` : null);
    moveForecast(Math.max(nextWeek, f.week));
    moveRange({ low: f.low, high: f.high, chance: Math.round(f.chance / 5) * 5 });
    p.noteDesk(nextWeek, `use:${id}`);
    openTab('decide');
  };
  const live = liveScreen(p);

  const late = nextWeek > c.deadline;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold text-white">Week {nextWeek}</h1>
        <span className={`text-sm font-mono ${late ? 'text-rose-400' : 'text-slate-400'}`}>
          {late ? `${nextWeek - c.deadline} past the deadline` : `${c.deadline - p.week} weeks left`}
        </span>
      </header>

      <TabStrip tab={deskTab} opened={seenTabs} onOpen={openTab} front={DECIDE} tabs={TABS.slice(1)}
        checks={{ left: Math.max(0, limit - seenTabs.filter(isCheck).length), limit, when: 'this week', counts: isCheck }} />

      {deskTab !== 'decide' ? (
        <>
          <DeskTab id={deskTab} S={S} plan={p.plan || { crews: 0, inspect: 0, shift: 'none' }} planReady={!!p.plan} onUse={useTool} live={live}
            onCopyPrompt={() => p.noteDesk(nextWeek, 'ai-copy')} opened={promptTabs} />
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
        <Slider label="Move it if the evidence says so" value={shownForecast} min={nextWeek} max={24} onChange={moveForecast}
          format={(v) => `week ${v}`}
          hint={`Committed before week 1 (the forecast that is scored): week ${p.forecast.week}, 80% sure of ${p.forecast.low}–${p.forecast.high}. Amber band: past contracts delivered${past.failed.total ? ` (${failuresLine(past)})` : ''}.`} />
        {useNote && <p className="text-xs text-rose-300 mt-1">{useNote}</p>}
        <details className="mt-2 text-sm">
          <summary className="text-slate-300 cursor-pointer">Now: 80% range weeks {shownRange.low}–{shownRange.high}, {shownRange.chance}% for week {c.deadline}</summary>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <Slider label="earliest" value={shownRange.low} min={nextWeek} max={24} onChange={(v) => moveRange((r) => ({ ...r, low: Math.min(v, shownForecast) }))} format={(v) => `wk ${v}`} />
            <Slider label="latest" value={shownRange.high} min={nextWeek} max={26} onChange={(v) => moveRange((r) => ({ ...r, high: Math.max(v, shownForecast) }))} format={(v) => `wk ${v}`} />
          </div>
          <Slider label={`Chance of week ${c.deadline}`} value={shownRange.chance} min={0} max={100} step={5} onChange={(v) => moveRange((r) => ({ ...r, chance: v }))} format={(v) => `${v}%`} />
        </details>
      </Card>

      <Card title="Dashboard">
        <div className="flex items-end justify-between mb-1">
          <span className="text-sm text-slate-300">Reported complete</span>
          <span className="text-3xl font-bold font-mono text-sky-300">{pct(p.reportedPct())}</span>
        </div>
        <div className="h-3 bg-slate-950 rounded-full overflow-hidden">
          <div className="h-full bg-sky-500 transition-all" style={{ width: pct(p.reportedPct()) }} />
        </div>
        <div className="grid grid-cols-4 gap-3 mt-4">
          <Stat label="Units left" value={Math.round(p.backlog)} sub={`of ${p.totalScope}`} />
          <Stat label="Crews" value={p.crews} sub={p.onboarding > 0 ? 'onboarding' : ''} />
          <Stat label="Budget left" value={money(p.budget)} sub={p.budget < 0 ? `credit left ${money(c.creditLine + p.budget)}` : `+ ${money(c.creditLine)} credit`} tone={p.budget < 0 ? 'text-rose-400' : 'text-emerald-300'} />
          <Stat label="Defects found" value={last ? Math.round(last.found + last.rejected) : 0} sub="last week" tone={last && last.rejected > 0 ? 'text-rose-400' : 'text-white'} />
        </div>
        {p.history.length > 0 && (
          <div className="mt-4">
            <ProgressSpark history={p.history} deadline={c.deadline} end={Math.max(c.deadline, p.week) + 1} />
          </div>
        )}
        {last && last.events.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {last.events.map((e, i) => (
              <li key={i} className={/rejected|changed the requirement/.test(e) ? 'text-amber-300' : 'text-slate-400'}>{e}</li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Decide week ${nextWeek}`}>
        <div className="space-y-5">
          {p.plan && <p className="text-xs text-slate-400 -mb-2">Your stated plan: {describePlan(p.plan)}.</p>}
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
            {hire > 0 && <p className="text-xs text-amber-300 mt-1">{money(hire * c.hireFee)} fee. {onboardingRule(c)}</p>}
          </div>

          <button
            type="button" onClick={() => setShift((s) => !s)}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border text-sm ${shift ? 'bg-amber-500/15 border-amber-500/50 text-amber-200' : 'bg-slate-950 border-slate-700 text-slate-300'}`}
          >
            <span><span className="mr-2">{shift ? '☑' : '☐'}</span>Second shift (+{Math.round((c.shiftBoost - 1) * 100)}% output)</span>
            <span className="font-mono">{money(crewsNext * c.shiftPremiumPerCrew)}</span>
          </button>
          {fatigueNext && <p className="text-xs text-rose-300 -mt-3">Second straight week: tired crews make more defects.</p>}

          <div>
            <div className="text-sm text-slate-300 mb-1">Inspection: share of the line checking instead of building</div>
            <div className="grid grid-cols-4 gap-2">
              {c.inspectionOptions.map((o) => (
                <button key={o} type="button" onClick={() => setInspect(o)}
                  className={`py-2 rounded-lg text-sm font-mono border ${inspect === o ? 'bg-sky-500/20 border-sky-400 text-sky-200' : 'bg-slate-950 border-slate-700 text-slate-400'}`}>
                  {Math.round(o * 100)}%
                </button>
              ))}
            </div>
          </div>

          {p.budget - cost < -c.creditLine && (
            <p className="text-xs text-rose-300">This week would take you past the {money(c.creditLine)} credit line. The company couldn't make payroll: it would go bankrupt and the contract would end.</p>
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
