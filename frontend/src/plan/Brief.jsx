import { useMemo, useState } from 'react';
import { CONFIG, isCheck, viewLimit, canOpen } from './engine';
import { tabById, screenData } from './desk.js';
import TabStrip from './DeskStrip';
import { Card, Slider } from './ui';
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

export default function Brief({ onCommit, initialSeed = '', initialTab = 'commit', initialPlan = null }) {
  const c = CONFIG;

  const S = useMemo(() => screenData(), []);
  // No starting forecast: each number is unset until the student sets it (or a tool's numbers are used).
  const [week, setWeek] = useState(null);
  const [low, setLow] = useState(null);
  const [high, setHigh] = useState(null);
  const [chance, setChance] = useState(null);
  // The desk: which tab is showing, the tool tabs opened (in order), when the briefing
  // opened, and the numbers last copied in from a tool.
  const [tab, setTab] = useState(initialTab);
  const [opened, setOpened] = useState([]);
  const [startedAt] = useState(() => Date.now());
  const [loaded, setLoaded] = useState(null);
  const [copied, setCopied] = useState(false);
  const [seed, setSeed] = useState(initialSeed);
  const [seedLocked, setSeedLocked] = useState(!!initialSeed);
  // The plan comes first: crews added at the start, inspection share, second shift.
  const [plan, setPlan] = useState(initialPlan || { crews: null, inspect: null, shift: null });
  const planReady = plan.crews !== null && plan.inspect !== null && plan.shift !== null;
  const setPlanPart = (k) => (v) => setPlan((p) => ({ ...p, [k]: v }));

  const setPoint = (v) => {
    setWeek(v);
    if (low !== null && low > v) setLow(v);
    if (high !== null && high < v) setHigh(v);
  };
  const forecastSet = week !== null && low !== null && high !== null && chance !== null;
  const intervalOk = forecastSet && low <= week && week <= high;

  const open = (id) => {
    // Round 1 is unlimited; the front tab and The Contract never count.
    if (!canOpen(id, opened, viewLimit(1, c))) return;
    setTab(id);
    if (id !== 'commit') setOpened((o) => (o.includes(id) ? o : [...o, id]));
    window.scrollTo(0, 0);
  };
  const applyNumbers = (id, f, label = null) => {
    const n = { week: Math.max(8, Math.min(22, f.week)), chance: Math.max(0, Math.min(100, Math.round(f.chance / 5) * 5)) };
    n.low = Math.max(6, Math.min(n.week, f.low));
    n.high = Math.min(24, Math.max(n.week, f.high));
    setWeek(n.week); setLow(n.low); setHigh(n.high); setChance(n.chance);
    setLoaded({ id, label, numbers: n, fail: f.fail || null });
    open('commit');
  };
  const commit = () => {
    const given = loaded ? loaded.numbers : null;
    const edited = !given || given.week !== week || given.low !== low || given.high !== high || given.chance !== chance;
    const desk = { tool: loaded ? tabById(loaded.id)?.letter || '' : '', tabs: opened.filter(isCheck).length, minutes: (Date.now() - startedAt) / 60000, edited, copied, order: opened };
    onCommit({ week, low, high, onTimeChance: chance, plan, desk }, seed.trim());
  };
  const deskPlan = planReady ? plan : { crews: 0, inspect: 0, shift: 'none' };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-white">Best Laid Plans</h1>
        <p className="text-lg text-white mt-2 leading-snug">
          Your job: <span className="text-emerald-300 font-semibold">predict when this contract will be accepted.</span>
        </p>
      </header>

      <TabStrip tab={tab} opened={opened} onOpen={open}
        checks={{ left: Math.max(0, viewLimit(1, c) - opened.filter(isCheck).length), limit: viewLimit(1, c), when: 'before week 1', counts: isCheck }} />

      {tab !== 'commit' ? (
        <>
          <DeskTab id={tab} S={S} plan={deskPlan} planReady={planReady} onUse={applyNumbers} onCopyPrompt={() => setCopied(true)} opened={opened} />
          <button type="button" onClick={() => open('commit')} className="w-full py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm">
            Back to Your Plan and Prediction
          </button>
        </>
      ) : (<>
      <p className="text-sm text-slate-300 -mb-2">The contract, its rules and the line's history are in the tabs.</p>

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
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 pt-1">2 · Your forecast</div>
          {loaded && (
            <p className="text-xs text-slate-300 bg-slate-950 rounded-lg px-3 py-2 -mt-2">
              Loaded from <strong className="text-white">{tabById(loaded.id).name}{loaded.label ? ` (${loaded.label})` : ''}</strong>: week {loaded.numbers.week},{' '}
              {loaded.numbers.low}–{loaded.numbers.high}, {loaded.numbers.chance}%.
              {loaded.fail && <span className="text-rose-300"> {loaded.fail}: the range is from the delivered ones, and the chance counts the rest as not on time.</span>} You can still change them.
            </p>
          )}
          <Slider label="Week the customer accepts it" value={week} min={8} max={22} onChange={setPoint} format={(v) => `week ${v}`} />
          <div>
            <div className="grid grid-cols-2 gap-3">
              <Slider label="80% sure: earliest" value={low} min={6} max={22} onChange={(v) => setLow(week === null ? v : Math.min(v, week))} format={(v) => `wk ${v}`} />
              <Slider label="latest" value={high} min={8} max={24} onChange={(v) => setHigh(week === null ? v : Math.max(v, week))} format={(v) => `wk ${v}`} />
            </div>
          </div>
          <Slider
            label={`Chance you deliver by week ${c.deadline}`} value={chance} min={0} max={100} step={5}
            onChange={setChance} format={(v) => `${v}%`}
          />
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
          <button
            type="button"
            disabled={!intervalOk || !planReady}
            onClick={commit}
            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold"
          >
            Commit plan and forecast, start week 1
          </button>
          {(!planReady || !forecastSet) && <p className="text-xs text-slate-500 text-center -mt-2">{!planReady ? 'Choose all three parts of your plan' : 'Set the week, both ends of the range and the chance'} first.</p>}
        </div>
      </Card>


      </>)}
    </div>
  );
}
