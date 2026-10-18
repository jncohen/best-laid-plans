import { useMemo, useState } from 'react';
import { CONFIG, isCheck } from './engine';
import { tabById, screenData, costManagement, schedule, comparisonRows } from './desk.js';
import TabStrip from './DeskStrip';
import { Card, Slider, ScoringNote } from './ui';
import { money } from './format';
import DeskTab from './DeskTabs';

function Choice({ label, options, value, onChange }) {
  return (
    <div role="radiogroup" aria-label={label}>
      <div className="text-sm text-slate-300 mb-1">{label}</div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map(([v, l]) => (
          <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
            className={`py-2 px-1 rounded-lg text-sm border ${value === v ? 'bg-slate-700 border-slate-300 text-white font-semibold' : 'bg-slate-950 border-slate-700 text-slate-300'}`}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

// Before the gut forecast only The Contract and the Status Report are open; before the final one,
// the student must have opened each of these.
const TOUR = ['chat', 'last5', 'records'];
const TOUR_NAMES = { chat: 'Team Chat', last5: 'Last 5', records: 'Records' };
const range = (f) => (f.low === f.high ? `week ${f.low}` : `${f.low}–${f.high}`);

export default function Brief({ onCommit, initialSeed = '', initialTab = 'commit', initialPlan = null, initialGut = null, initialOpened = [] }) {
  const c = CONFIG;

  const S = useMemo(() => screenData(), []);
  // No starting forecast: each number is unset until the student sets it (or a tool's numbers are used).
  const [week, setWeek] = useState(initialGut ? initialGut.week : null);
  const [low, setLow] = useState(initialGut ? initialGut.low : null);
  const [high, setHigh] = useState(initialGut ? initialGut.high : null);
  const [chance, setChance] = useState(initialGut ? initialGut.onTimeChance : null);
  // Two stages: the gut forecast (from The Contract and the Status Report), then the final one, after the tour.
  const [gut, setGut] = useState(initialGut);
  // The desk: which tab is showing, the tool tabs opened (in order), when the briefing
  // opened, and the numbers last copied in from a tool.
  const [tab, setTab] = useState(initialTab);
  const [opened, setOpened] = useState(initialOpened);
  const [startedAt] = useState(() => Date.now());
  const [loaded, setLoaded] = useState(null);
  const [seed, setSeed] = useState(initialSeed);
  const [seedLocked, setSeedLocked] = useState(!!initialSeed);
  // The plan comes first: crews added at the start, inspection share, second shift.
  const [plan, setPlan] = useState(initialPlan || { crews: null, inspect: null, shift: null });
  const planReady = plan.crews !== null && plan.inspect !== null && plan.shift !== null;
  const setPlanPart = (k) => (v) => setPlan((p) => ({ ...p, [k]: v }));

  const locked = gut ? [] : TOUR;
  const left = TOUR.filter((id) => !opened.includes(id));

  const setPoint = (v) => {
    setWeek(v);
    if (low !== null && low > v) setLow(v);
    if (high !== null && high < v) setHigh(v);
  };
  const forecastSet = week !== null && low !== null && high !== null && chance !== null;
  const intervalOk = forecastSet && low <= week && week <= high;

  const open = (id) => {
    if (locked.includes(id)) return;
    setTab(id);
    if (id !== 'commit') setOpened((o) => (o.includes(id) ? o : [...o, id]));
    window.scrollTo(0, 0);
  };
  const applyNumbers = (id, f, label = null) => {
    const n = { week: Math.max(8, Math.min(c.horizon, f.week)), chance: Math.max(0, Math.min(100, Math.round(f.chance / 5) * 5)) };
    n.low = Math.max(6, Math.min(n.week, f.low));
    n.high = Math.min(c.horizon, Math.max(n.week, f.high));
    setWeek(n.week); setLow(n.low); setHigh(n.high); setChance(n.chance);
    setLoaded(id ? { id, label, numbers: n, fail: f.fail || null } : null);
    open('commit');
  };
  const commitGut = () => { setGut({ week, low, high, onTimeChance: chance }); window.scrollTo(0, 0); };
  const commit = () => {
    const given = loaded ? loaded.numbers : null;
    const edited = !given || given.week !== week || given.low !== low || given.high !== high || given.chance !== chance;
    const source = loaded ? (loaded.id === 'chat' && loaded.label ? `${loaded.label}'s` : tabById(loaded.id)?.name || '') : '';
    const desk = { tool: loaded ? tabById(loaded.id)?.letter || '' : '', source, tabs: opened.filter(isCheck).length, minutes: (Date.now() - startedAt) / 60000, edited, order: opened };
    onCommit({ week, low, high, onTimeChance: chance, plan, desk, gut }, seed.trim());
  };
  const deskPlan = planReady ? plan : { crews: 0, inspect: 0, shift: 'none' };
  const rows = gut && planReady ? comparisonRows(S, plan, gut) : [];
  const spread = rows.length ? Math.max(...rows.map((r) => r.f.week)) - Math.min(...rows.map((r) => r.f.week)) : 0;
  // The stated plan's cost, as the Status Report projects it: the plan run week by week from week 0.
  const cm = planReady ? costManagement(S, plan) : null;
  const finishWeek = planReady ? schedule(S, plan).forecast.week : null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-white">Best Laid Plans</h1>
        <p className="text-lg text-white mt-2 leading-snug">
          Your job: <span className="text-emerald-300 font-semibold">predict when this contract will be accepted.</span>
        </p>
      </header>

      <TabStrip tab={tab} opened={opened} onOpen={open} locked={locked} lockedWhy="Opens after your gut forecast" />

      {tab !== 'commit' ? (
        <>
          <DeskTab id={tab} S={S} plan={deskPlan} planReady={planReady} onUse={applyNumbers} />
          <button type="button" onClick={() => open('commit')} className="w-full py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm">
            Back to Your Plan and Prediction
          </button>
        </>
      ) : (<>
      {!gut ? (
        <p className="text-sm text-slate-200 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2">
          <strong className="text-white">Step 1: your gut forecast.</strong> Read The Contract and the Status Report, choose a plan and set your numbers. The other tabs open after this.
        </p>
      ) : (
        <p className={`text-sm rounded-lg px-3 py-2 border ${left.length ? 'text-amber-100 bg-amber-500/15 border-amber-400' : 'text-slate-200 bg-slate-900 border-slate-700'}`} role="status">
          <strong className="text-white">Step 2: your final forecast.</strong>{' '}
          {left.length ? `Open ${left.map((id) => TOUR_NAMES[id]).join(', ')} before your final forecast.` : 'Keep your gut numbers, use another row below, or set your own.'}
        </p>
      )}

      <Card tone="emerald">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">1 · Your plan <span className="normal-case font-normal tracking-normal text-slate-500">(you can change course during play)</span></div>
            <Choice label="Crews to add at the start" value={plan.crews} onChange={setPlanPart('crews')}
              options={[[0, 'None'], [1, '+1'], [2, '+2'], [3, '+3']]} />
            <Choice label="Inspection" value={plan.inspect} onChange={setPlanPart('inspect')}
              options={c.inspectionOptions.map((o) => [o, `${Math.round(o * 100)}%`])} />
            <Choice label="Second shift" value={plan.shift} onChange={setPlanPart('shift')}
              options={[['none', 'None'], ['late', 'Late weeks'], ['every', 'Every week']]} />
            {cm && (
              <p className={`text-xs ${cm.brokeWeek && cm.brokeWeek <= finishWeek ? 'text-rose-300' : 'text-slate-400'}`}>
                This plan costs about {money(cm.cost.bac)} by week {finishWeek}, against a {money(c.budget)} budget plus {money(c.creditLine)} credit.
                {' '}Money lasts {cm.brokeWeek ? `to week ${cm.brokeWeek - 1}` : `past week ${c.horizon}`} at this spend.
              </p>
            )}
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 pt-1">2 · {gut ? 'Your final forecast' : 'Your gut forecast'}</div>
          {gut && rows.length > 0 && !left.length && (
            <div className="-mt-2">
              <table className="w-full text-xs text-slate-200">
                <thead className="text-slate-400"><tr><th className="text-left font-semibold py-1">Forecast</th><th className="text-right font-semibold">Week</th><th className="text-right font-semibold">80% range</th><th className="text-right font-semibold">Wk 12</th><th /></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="border-t border-slate-800 align-top">
                      <td className="py-1.5 pr-1">
                        {r.name}
                        {r.f.fail && <div className="text-[11px] text-rose-300">{r.f.fail}</div>}
                        {r.note && <div className={`text-[11px] ${r.f.crewsDropped ? 'text-rose-300 font-bold' : 'text-amber-200'}`}>{r.note}</div>}
                      </td>
                      <td className="text-right font-mono">{r.f.week}</td>
                      <td className="text-right font-mono whitespace-nowrap">{range(r.f)}</td>
                      <td className="text-right font-mono">{r.f.chance}%</td>
                      <td className="text-right pl-1">
                        <button type="button" onClick={() => applyNumbers(r.id, r.f, r.label || null)} className="text-emerald-300 underline">Use</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-slate-300 mt-1">These disagree by {spread} week{spread === 1 ? '' : 's'}. Pick one to use, or set your own.</p>
            </div>
          )}
          {loaded && (
            <p className="text-xs text-slate-300 bg-slate-950 rounded-lg px-3 py-2">
              Loaded from <strong className="text-white">{tabById(loaded.id).name}{loaded.label ? ` (${loaded.label})` : ''}</strong>: week {loaded.numbers.week},{' '}
              {loaded.numbers.low}–{loaded.numbers.high}, {loaded.numbers.chance}%.
              {loaded.fail && <span className="text-rose-300"> {loaded.fail}: the range is from the delivered ones, and the chance counts the rest as not on time.</span>} You can still change them.
            </p>
          )}
          <Slider label="Week the customer accepts it" value={week} min={8} max={c.horizon} onChange={setPoint} format={(v) => `week ${v}`} />
          <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Slider label="80% sure: earliest" value={low} min={6} max={c.horizon} onChange={(v) => setLow(week === null ? v : Math.min(v, week))} format={(v) => `week ${v}`} />
              <Slider label="Latest" value={high} min={8} max={c.horizon} onChange={(v) => setHigh(week === null ? v : Math.max(v, week))} format={(v) => `week ${v}`} />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Week {c.horizon} is the last: after it the customer terminates the contract. A contract never delivered (bankrupt or terminated) misses its range.</p>
          </div>
          <Slider
            label={`Chance you deliver by week ${c.deadline}`} value={chance} min={0} max={100} step={5}
            onChange={setChance} format={(v) => `${v}%`}
          />
          <ScoringNote className="bg-slate-950 rounded-lg px-3 py-2" />
          {gut ? (<>
            {seedLocked ? (
              <p className="text-sm text-slate-400">Scenario code <span className="font-mono text-white">{seed}</span>{' '}
                <button type="button" onClick={() => setSeedLocked(false)} className="text-xs text-slate-400 underline">change</button></p>
            ) : (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-slate-300 whitespace-nowrap">Scenario code</span>
                <input value={seed} onChange={(e) => setSeed(e.target.value)} maxLength={24} placeholder="from your instructor"
                  className="min-w-0 flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono" />
              </label>
            )}
            <p className="text-xs text-slate-400">Your gut forecast: week {gut.week}, {range(gut)}, {gut.onTimeChance}%. The final forecast is the one that is scored.</p>
            <button type="button" disabled={!intervalOk || !planReady || left.length > 0} onClick={commit}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold">
              Commit final forecast, start week 1
            </button>
            {left.length > 0 && <p className="text-xs text-amber-200 text-center -mt-2">Open {left.map((id) => TOUR_NAMES[id]).join(', ')} first.</p>}
          </>) : (<>
            <button type="button" disabled={!intervalOk || !planReady} onClick={commitGut}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold">
              Commit gut forecast
            </button>
            {(!planReady || !forecastSet) && <p className="text-xs text-slate-500 text-center -mt-2">{!planReady ? 'Choose all three parts of your plan' : 'Set the week, both ends of the range and the chance'} first.</p>}
          </>)}
        </div>
      </Card>
      </>)}
    </div>
  );
}

