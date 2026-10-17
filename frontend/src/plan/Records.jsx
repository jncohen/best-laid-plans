import { useState } from 'react';
import { CONFIG, matchContracts, summarizeContracts, describePlan } from './engine';
import { DotStrip } from './ui';
import { ANY, filterContracts, sortContracts } from './table.js';

const COLS = [
  ['id', '#'],
  ['crews', 'Crews added'],
  ['inspect', 'Inspect'],
  ['shift', '2nd shift wks'],
  ['scope', 'Scope change'],
  ['full', 'Dashboard 100%'],
  ['rejected', 'Rejected'],
  ['accepted', 'Accepted'],
  ['onTime', 'On time'],
];

function Select({ label, value, onChange, options }) {
  return (
    <label className="text-xs text-slate-400 flex flex-col gap-1 min-w-0">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

/**
 * The record of past contracts as a table: what each manager did and how it ended.
 * Filter by plan, or ask for the contracts run like the plan you've chosen.
 */
export default function Records({ past, plan = null }) {
  const c = CONFIG;
  const [filters, setFilters] = useState({ crews: ANY, inspect: ANY, shift: ANY });
  const [match, setMatch] = useState(null); // the matchContracts() result, while in use
  const [sort, setSort] = useState({ key: 'id', dir: 1 });

  const rows = match ? match.contracts : filterContracts(past.contracts, filters);
  const sum = match ?? summarizeContracts(rows);
  const ids = new Set(rows.map((r) => r.id));
  const shown = sortContracts(rows, sort.key, sort.dir);
  const all = rows.length === past.contracts.length;
  const crewOptions = [...new Set(past.contracts.map((r) => r.crewsAdded))].sort((a, b) => a - b);

  const setFilter = (k, v) => { setMatch(null); setFilters((f) => ({ ...f, [k]: v === ANY ? ANY : v })); };
  const reset = () => { setMatch(null); setFilters({ crews: ANY, inspect: ANY, shift: ANY }); };
  const likeMine = () => { if (plan) setMatch(matchContracts(plan)); };
  const sortBy = (key) => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }));

  return (
    <div className="space-y-3">
      <DotStrip
        weeks={past.contracts.map((r) => r.accepted)} active={past.contracts.map((r) => ids.has(r.id))}
        band={sum.n ? [sum.p10, sum.p90] : null} deadline={c.deadline}
      />

      <p className="text-sm text-slate-300" aria-live="polite">
        {all ? `All ${sum.n} contracts` : `${sum.n} of ${past.contracts.length} contracts`}
        {sum.n > 0 && <>: median <strong className="text-amber-300">week {sum.median}</strong>, 10th–90th percentile weeks{' '}
          <strong className="text-amber-300">{sum.p10}–{sum.p90}</strong>, {Math.round(sum.onTimeShare * 100)}% made week {c.deadline}.</>}
      </p>
      {sum.n > 0 && sum.n < 5 && (
        <p className="text-xs text-amber-200">Only {sum.n} contract{sum.n > 1 ? 's' : ''} match. That is too few to lean on: widen the filters.</p>
      )}
      {sum.n === 0 && <p className="text-xs text-amber-200">No past contract was run this way.</p>}
      {match && (
        <p className="text-xs text-slate-400">
          Contracts run like your plan, {describePlan(plan)}. Matched on {match.rule}
          {match.rule !== 'crews, inspection and shift' && ' (no closer match had five contracts)'}.
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Select label="Crews added" value={match ? ANY : String(filters.crews)} onChange={(v) => setFilter('crews', v === ANY ? ANY : +v)}
          options={[[ANY, 'Any'], ...crewOptions.map((n) => [String(n), n ? `+${n}` : 'None'])]} />
        <Select label="Inspection" value={match ? ANY : filters.inspect} onChange={(v) => setFilter('inspect', v)}
          options={[[ANY, 'Any'], ['none', 'None'], ['some', 'Some']]} />
        <Select label="2nd shift" value={match ? ANY : filters.shift} onChange={(v) => setFilter('shift', v)}
          options={[[ANY, 'Any'], ['none', 'None'], ['some', 'Some']]} />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={likeMine} disabled={!plan}
          className={`flex-1 py-2 rounded-lg text-sm border ${match ? 'bg-amber-500/20 border-amber-400 text-amber-100' : 'bg-slate-950 border-amber-500/50 text-amber-200'} disabled:opacity-40`}>
          Contracts run like my plan
        </button>
        <button type="button" onClick={reset} disabled={all && !match}
          className="px-4 py-2 rounded-lg text-sm bg-slate-950 border border-slate-700 text-slate-300 disabled:opacity-40">
          All {past.contracts.length}
        </button>
      </div>
      {!plan && <p className="text-[11px] text-slate-500 -mt-1">Choose your plan at the bottom of the page to find contracts run like it.</p>}

      <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-lg border border-slate-800">
        <table className="w-full text-xs font-mono text-slate-200 whitespace-nowrap">
          <thead className="sticky top-0 bg-slate-900 text-slate-400">
            <tr>
              {COLS.map(([key, label]) => (
                <th key={key} scope="col" aria-sort={sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'} className="font-sans font-semibold text-left">
                  <button type="button" onClick={() => sortBy(key)} className="px-2 py-2 w-full text-left hover:text-white">
                    {label}{sort.key === key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-t border-slate-800">
                <td className="px-2 py-1.5 text-slate-500">{r.id}</td>
                <td className="px-2 py-1.5">{r.crewsAdded ? `+${r.crewsAdded} (wk ${r.hires.map((h) => h.week).join(',')})` : '—'}</td>
                <td className="px-2 py-1.5">{r.inspect ? `${Math.round(r.inspect * 100)}%` : '—'}</td>
                <td className="px-2 py-1.5">{r.shiftWeeks || '—'}</td>
                <td className="px-2 py-1.5">wk {r.scopeWeek}, +{r.scopeUnits}</td>
                <td className="px-2 py-1.5 text-sky-300">wk {r.dashboardFullWeek}</td>
                <td className={`px-2 py-1.5 ${r.rejected ? 'text-rose-300' : 'text-slate-500'}`}>{r.rejected}</td>
                <td className="px-2 py-1.5 text-amber-300 font-bold">wk {r.accepted}</td>
                <td className="px-2 py-1.5">{r.onTime ? 'yes' : 'no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
