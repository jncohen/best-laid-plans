import { useMemo, useState } from 'react';
import { CONFIG, pastContracts, lastContract, historyMean } from './engine';
import { TABS, tabById, screenData } from './desk.js';
import { Card, Slider, DotStrip } from './ui';
import { money } from './format';
import DeskTab from './DeskTabs';

const DEFAULTS = { week: 12, low: 11, high: 13, chance: 50 };
const TAB_TONE = {
  inside: ['text-sky-300', 'border-sky-400'],
  record: ['text-amber-300', 'border-amber-400'],
  people: ['text-violet-300', 'border-violet-400'],
  front: ['text-white', 'border-white'],
};

/** The tab strip: the front tab, then the tools in their groups. Scrolls sideways on a phone. */
function TabStrip({ tab, opened, onOpen }) {
  const groups = [];
  for (const t of TABS) {
    const g = t.group || '';
    if (!groups.length || groups[groups.length - 1].name !== g) groups.push({ name: g, tabs: [] });
    groups[groups.length - 1].tabs.push(t);
  }
  return (
    <nav aria-label="Briefing tabs" className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-slate-950/95 backdrop-blur border-b border-slate-800">
      <div className="flex gap-4 gap-y-2 overflow-x-auto sm:flex-wrap pb-1" role="tablist">
        {groups.map((g) => (
          <div key={g.name} className="shrink-0">
            <div className="text-[9px] uppercase tracking-wider text-slate-500 h-3 whitespace-nowrap">{g.name}</div>
            <div className="flex gap-1 mt-1">
              {g.tabs.map((t) => {
                const active = tab === t.id;
                const [txt, bd] = TAB_TONE[t.tone];
                return (
                  <button key={t.id} type="button" role="tab" aria-selected={active} onClick={() => onOpen(t.id)}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs border ${active ? `bg-slate-800 ${bd} ${txt} font-semibold` : `border-slate-800 ${opened.includes(t.id) ? 'text-slate-300' : 'text-slate-400'}`}`}>
                    {t.id === 'commit' ? t.short : t.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}

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
  const past = pastContracts();
  const last = lastContract();
  const pace = historyMean();
  const insideWeeks = (c.scope / pace).toFixed(1);

  const S = useMemo(() => screenData(), []);
  const [week, setWeek] = useState(DEFAULTS.week);
  const [low, setLow] = useState(DEFAULTS.low);
  const [high, setHigh] = useState(DEFAULTS.high);
  const [chance, setChance] = useState(DEFAULTS.chance);
  // The desk: which tab is showing, the tool tabs opened (in order), when the briefing
  // opened, and the numbers last copied in from a tool.
  const [tab, setTab] = useState(initialTab);
  const [opened, setOpened] = useState([]);
  const [startedAt] = useState(() => Date.now());
  const [loaded, setLoaded] = useState(null);
  const [seed, setSeed] = useState(initialSeed);
  const [name, setName] = useState('');
  // The plan comes first: crews added at the start, inspection share, second shift.
  const [plan, setPlan] = useState(initialPlan || { crews: null, inspect: null, shift: null });
  const planReady = plan.crews !== null && plan.inspect !== null && plan.shift !== null;
  const setPlanPart = (k) => (v) => setPlan((p) => ({ ...p, [k]: v }));

  const setPoint = (v) => {
    setWeek(v);
    if (low > v) setLow(v);
    if (high < v) setHigh(v);
  };
  const intervalOk = low <= week && week <= high;

  const open = (id) => {
    setTab(id);
    if (id !== 'commit') setOpened((o) => (o.includes(id) ? o : [...o, id]));
    window.scrollTo(0, 0);
  };
  const applyNumbers = (id, f, label = null) => {
    const n = { week: Math.max(8, Math.min(22, f.week)), chance: Math.max(0, Math.min(100, Math.round(f.chance / 5) * 5)) };
    n.low = Math.max(6, Math.min(n.week, f.low));
    n.high = Math.min(24, Math.max(n.week, f.high));
    setWeek(n.week); setLow(n.low); setHigh(n.high); setChance(n.chance);
    setLoaded({ id, label, numbers: n });
    open('commit');
  };
  const commit = () => {
    const given = loaded ? loaded.numbers : DEFAULTS;
    const edited = given.week !== week || given.low !== low || given.high !== high || given.chance !== chance;
    const desk = { tool: loaded ? tabById(loaded.id).letter : '', tabs: opened.length, minutes: (Date.now() - startedAt) / 60000, edited, order: opened };
    onCommit({ week, low, high, onTimeChance: chance, plan, desk }, seed.trim(), name.trim());
  };
  const deskPlan = planReady ? plan : { crews: 0, inspect: 0, shift: 'none' };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-white">Best Laid Plans</h1>
        <p className="text-lg text-white mt-2 leading-snug">
          Your job: <span className="text-emerald-300 font-semibold">predict when this contract will be accepted.</span>
        </p>
        <p className="text-sm text-slate-400 mt-1">
          You run a production line. The customer wants {c.scope} units by week {c.deadline}. You commit a prediction
          now, run the line week by week, and find out how right you were. The forecast score is the one that counts most.
        </p>
      </header>

      <TabStrip tab={tab} opened={opened} onOpen={open} />

      {tab !== 'commit' ? (
        <>
          <DeskTab id={tab} S={S} plan={deskPlan} planReady={planReady} onUse={applyNumbers} />
          <button type="button" onClick={() => open('commit')} className="w-full py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm">
            Back to Your Plan and Prediction
          </button>
        </>
      ) : (<>
      <h2 className="text-lg font-bold text-white text-center">Your Plan and Prediction · Commit Before Week 1</h2>
      <p className="text-xs text-slate-400 text-center -mt-2">The tabs above are tools a project office uses. Open any of them, or none, before you commit.</p>

      <Card title="The contract">
        <div className="grid grid-cols-4 gap-2 text-center">
          <div><div className="text-lg font-bold text-white">{c.scope}</div><div className="text-[11px] text-slate-500">units</div></div>
          <div><div className="text-lg font-bold text-white">{c.deadline}</div><div className="text-[11px] text-slate-500">weeks</div></div>
          <div><div className="text-lg font-bold text-white">{c.crews}</div><div className="text-[11px] text-slate-500">crews</div></div>
          <div><div className="text-lg font-bold text-white">{money(c.budget)}</div><div className="text-[11px] text-slate-500">budget</div></div>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          The contract is done when the customer's acceptance test passes every unit. If it has not passed by the end
          of week {c.horizon}, the customer terminates the contract.
        </p>
        <p className="text-xs text-slate-400 mt-2">
          Customers on this line add to the requirement partway through: every past contract below had a scope change.
          Nobody knows in advance which week it comes or how many units it adds.
        </p>
        <p className="text-xs text-slate-400 mt-2">
          Some built units turn out defective. The dashboard counts them complete until inspection or the customer's
          acceptance test finds them.
        </p>
      </Card>

      <Card title="Your line's last contract" tone="sky">
        <p className="text-xs text-slate-400 mb-2">Same line, same {c.crews} crews. Units completed each week, from its dashboard:</p>
        <div className="grid grid-cols-6 gap-1 font-mono text-sm text-center text-white">
          {last.history.map((v, i) => <div key={i} className="bg-slate-950 rounded py-1">{Math.round(v)}</div>)}
        </div>
        <p className="text-sm text-slate-300 mt-3">
          About <strong className="text-sky-300">{pace} a week</strong>. At that pace, {c.scope} units takes{' '}
          <strong className="text-sky-300">{insideWeeks} weeks</strong>.
        </p>
        <p className="text-xs text-slate-400 mt-2">
          How it ended: the dashboard read 100% in week {last.dashboardFullWeek}. The customer accepted it in
          week {last.deliveredWeek}.
        </p>
      </Card>

      <Card title={`${past.weeks.length} past contracts on this line`} tone="amber">
        <p className="text-xs text-slate-400 mb-2">The week each one was finally accepted. Green made week {c.deadline}.</p>
        <DotStrip weeks={past.weeks} deadline={c.deadline} />
        <p className="text-sm text-slate-300 mt-1">
          Median <strong className="text-amber-300">week {past.median}</strong>. Most landed between week {past.p10} and
          week {past.p90}. {Math.round(past.onTimeShare * 100)}% made week {c.deadline}.
        </p>
        <button type="button" onClick={() => open('records')} className="mt-2 text-xs text-amber-200 underline">
          What each manager did: open the Records tab
        </button>
      </Card>

      <Card title="What you decide each week">
        <ul className="space-y-2 text-sm text-slate-300">
          <li><strong className="text-white">Crews.</strong> Add up to 3 a week ({money(c.hireFee)} each, {c.maxCrews} crews at most) or
            release one ({money(c.releaseFee)}). A new crew slows the
            whole line for {c.onboardingWeeks} weeks, and every crew beyond {c.crews} makes all of them a little less efficient.</li>
          <li><strong className="text-white">Second shift.</strong> +{Math.round((c.shiftBoost - 1) * 100)}% output for{' '}
            {money(c.shiftPremiumPerCrew)} per crew. From the second straight week, tired crews make more defects.</li>
          <li><strong className="text-white">Inspection.</strong> Move 0–30% of the line from building to checking. You build less,
            but you find defects while they are cheap. Any defect the customer's test finds costs double to fix.</li>
          <li><strong className="text-white">Your forecast.</strong> Each week you may move your finish-week estimate.</li>
        </ul>
        <p className="text-xs text-slate-500 mt-3">
          Each crew costs {money(c.crewWeek)} a week. Two scores, kept apart: <strong className="text-emerald-300">Forecast</strong> (how
          right you were about your own project) and <strong className="text-slate-300">Delivery</strong> (on time, on budget:
          −{c.latePenaltyPerWeek} a week late, −{c.overspendPenaltyPer50k} per $50k over budget, 0 if the contract is terminated).
        </p>
      </Card>

      <Card title="Your plan and prediction — commit before week 1" tone="emerald">
        <div className="space-y-5">
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">1 · Your plan</div>
            <p className="text-xs text-slate-400 -mt-1">How you intend to run the line. You can still change course during play.</p>
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
              {loaded.numbers.low}–{loaded.numbers.high}, {loaded.numbers.chance}%. You can still change them.
            </p>
          )}
          <Slider label="Week the customer accepts it" value={week} min={8} max={22} onChange={setPoint} format={(v) => `week ${v}`} />
          <div>
            <div className="text-sm text-slate-300 mb-1">80% range: you are 80% sure it lands between</div>
            <div className="grid grid-cols-2 gap-3">
              <Slider label="earliest" value={low} min={6} max={22} onChange={(v) => setLow(Math.min(v, week))} format={(v) => `wk ${v}`} />
              <Slider label="latest" value={high} min={8} max={24} onChange={(v) => setHigh(Math.max(v, week))} format={(v) => `wk ${v}`} />
            </div>
          </div>
          <Slider
            label={`Chance you deliver by week ${c.deadline}`} value={chance} min={0} max={100} step={5}
            onChange={setChance} format={(v) => `${v}%`}
          />
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-slate-300">Your name <span className="text-slate-500">(for the room chart)</span></span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24}
                className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white" />
            </label>
            <label className="block text-sm">
              <span className="text-slate-300">Scenario code <span className="text-slate-500">(from your instructor)</span></span>
              <input value={seed} onChange={(e) => setSeed(e.target.value)} maxLength={24}
                className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono" />
            </label>
          </div>
          <button
            type="button"
            disabled={!intervalOk || !planReady}
            onClick={commit}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold"
          >
            Commit plan and forecast, start week 1
          </button>
          {!planReady && <p className="text-xs text-slate-500 text-center -mt-2">Choose all three parts of your plan first.</p>}
        </div>
      </Card>
      </>)}
    </div>
  );
}
