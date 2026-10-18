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

// The comparison card appears once these three have been opened (nothing is locked).
const TOUR = ['chat', 'last5', 'records'];
const range = (f) => (f.low === f.high ? `week ${f.low}` : `${f.low}–${f.high}`);

export default function Brief({ onCommit, initialSeed = '', initialTab = 'commit', initialPlan = null, initialOpened = [] }) {
  const c = CONFIG;

  // No starting forecast: each number is unset until the student sets it (or a tool's numbers are used).
  const [week, setWeek] = useState(null);
  const [low, setLow] = useState(null);
  const [high, setHigh] = useState(null);
  const [chance, setChance] = useState(null);
  // The desk: which tab is showing, the tool tabs opened (in order), when the briefing
  // opened, and the numbers last copied in from a tool.
  const [tab, setTab] = useState(initialTab);
  const [opened, setOpened] = useState(initialOpened);
  // Every opening of an information tab (repeats count), and the AI steps: opening Ask an AI, copying its prompt, downloading the records.
  const [checks, setChecks] = useState(0);
  const [notes, setNotes] = useState([]);
  const [startedAt] = useState(() => Date.now());
  const [loaded, setLoaded] = useState(null);
  const [seed, setSeed] = useState(initialSeed);
  const [seedLocked, setSeedLocked] = useState(!!initialSeed);
  // Each scenario code has its own record of past contracts, so the desk follows the code.
  const S = useMemo(() => screenData(CONFIG, seed), [seed]);
  // The plan comes first: crews added at the start, inspection share, second shift.
  const [plan, setPlan] = useState(initialPlan || { crews: null, inspect: null, shift: null });
  const planReady = plan.crews !== null && plan.inspect !== null && plan.shift !== null;
  const setPlanPart = (k) => (v) => setPlan((p) => ({ ...p, [k]: v }));

  const left = TOUR.filter((id) => !opened.includes(id));

  const setPoint = (v) => {
    setWeek(v);
    if (low !== null && low > v) setLow(v);
    if (high !== null && high < v) setHigh(v);
  };
  const forecastSet = week !== null && low !== null && high !== null && chance !== null;
  const intervalOk = forecastSet && low <= week && week <= high;

  const open = (id) => {
    setTab(id);
    if (id !== 'commit') setOpened((o) => (o.includes(id) ? o : [...o, id]));
    if (isCheck(id) && id !== tab) setChecks((n) => n + 1);
    if (id === 'ai') setNotes((x) => [...x, 'ai']);
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
  const commit = () => {
    const given = loaded ? loaded.numbers : null;
    const edited = !given || given.week !== week || given.low !== low || given.high !== high || given.chance !== chance;
    const source = loaded ? (loaded.id === 'chat' && loaded.label ? `${loaded.label}'s` : tabById(loaded.id)?.name || '') : '';
    const desk = { tool: loaded ? tabById(loaded.id)?.letter || '' : '', source, tabs: opened.filter(isCheck).length, minutes: (Date.now() - startedAt) / 60000, edited, order: opened, checks, copied: notes.includes('ai-copy'), csv: notes.includes('records-csv'), ai: notes.includes('ai') };
    onCommit({ week, low, high, onTimeChance: chance, plan, desk }, seed.trim());
  };
  const deskPlan = planReady ? plan : { crews: 0, inspect: 0, shift: 'none' };
  const rows = planReady ? comparisonRows(S, plan, null) : [];
  const spread = rows.length ? Math.max(...rows.map((r) => r.f.week)) - Math.min(...rows.map((r) => r.f.week)) : 0;
  // The stated plan's cost, as the Status Report projects it: the plan run week by week from week 0.
  const cm = planReady ? costManagement(S, plan) : null;
  const finishWeek = planReady ? schedule(S, plan).forecast.week : null;

  const comparison = rows.length > 0 && !left.length ? (
            <Card title="Every forecast on the desk" tone="amber">
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
            </Card>
          ) : null;
  // Desktop: the plan and forecast always on the left, the information (a tab, or the comparison) on the right.
  // Phone: one at a time, as the tabs choose.
  const onFront = tab === 'commit';

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-white">Best Laid Plans</h1>
        <p className="text-lg text-white mt-2 leading-snug">
          Your job: <span className="text-emerald-300 font-semibold">predict when this contract will be accepted.</span>
        </p>
      </header>

      <TabStrip tab={tab} opened={opened} onOpen={open} />

      <p className="text-sm rounded-lg px-3 py-2 border text-slate-200 bg-slate-900 border-slate-700" role="status">
        Every tab is open. What you check before you commit is up to you.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] gap-4 items-start">
      <div className={`${onFront ? '' : 'hidden lg:block'} lg:sticky lg:top-4 min-w-0`}>
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
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 pt-1">2 · Your forecast</div>
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
          <button type="button" disabled={!intervalOk || !planReady} onClick={commit}
            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold">
            Commit plan and forecast, start week 1
          </button>
          {(!planReady || !forecastSet) && <p className="text-xs text-amber-200 text-center -mt-2">{!planReady ? 'Choose all three parts of your plan first.' : 'Set the week, both ends of the range and the chance first.'}</p>}
        </div>
      </Card>
      </div>
      <div className={`${onFront ? 'order-first lg:order-none' : ''} space-y-4 min-w-0`}>
        {!onFront ? (<>
          <DeskTab id={tab} S={S} plan={deskPlan} planReady={planReady} onUse={applyNumbers} onNote={(n) => setNotes((x) => [...x, n])} />
          <button type="button" onClick={() => open('commit')} className="lg:hidden w-full py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm">
            Back to Your Plan and Prediction
          </button>
        </>) : comparison || (
          // Nothing chosen yet: on a desktop the right panel starts on The Contract.
          <div className="hidden lg:block"><DeskTab id="contract" S={S} plan={deskPlan} planReady={planReady} onUse={applyNumbers} /></div>
        )}
      </div>
      </div>
    </div>
  );
}

