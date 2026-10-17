import { useEffect } from 'react';
import { CONFIG, pastContracts, playedPlan, judgeForecast, describePlan, firstCloseWeek } from './engine';
import { screenData, allForecasts, tabById, tabByLetter } from './desk.js';
import { addToTrack } from './track';
import { Card } from './ui';
import { money } from './format';
import { RevealChart, ForecastChart } from './charts';

// What each tool sees and can't see: shown here, after the outcome, not on the tabs.
const TOOL_TAB = { status: 'status', cost: 'cost', schedule: 'schedule', last5: 'last5', 'records-all': 'records', 'records-plan': 'records', scenarios: 'scenarios', analytics: 'analytics', simulator: 'simulator', 'simulator-blind': 'simulator' };
function aboutTool(key) {
  if (key === 'simulator-blind') return 'Sees variability and scope changes · can\'t see rework';
  const tab = tabById(TOOL_TAB[key] || (key.startsWith('chat-') ? 'chat' : ''));
  if (key.startsWith('chat-')) return null;
  return tab ? `Sees ${tab.sees.charAt(0).toLowerCase()}${tab.sees.slice(1)} · can't see ${tab.cant.charAt(0).toLowerCase()}${tab.cant.slice(1)}` : null;
}

export default function Reveal({ project, onReplay }) {
  const c = CONFIG;
  const p = project;
  const past = pastContracts();
  const s = p.scores();
  const f = p.forecast;
  const outcome = s.outcome;
  const ninety = p.ninetyWeek();
  // How every tool on the desk would have done, for the plan the student stated.
  const tools = allForecasts(screenData(), p.plan || playedPlan(p)).map((t) => ({
    about: aboutTool(t.key),
    ...t, result: outcome >= t.low && outcome <= t.high ? 'held' : outcome > t.high ? 'late' : 'early',
  }));
  const usedTool = p.desk?.tool ? tabByLetter(p.desk.tool) : null;
  // The running forecast: when did it first come within a week of the outcome?
  const closeWeek = firstCloseWeek(p.forecastLog, outcome);
  const deskWeeks = new Set(p.deskLog.map((d) => d.week)).size;
  const deskUses = p.deskLog.filter((d) => d.tab.startsWith('use:')).length;
  const promptCopies = p.deskLog.filter((d) => d.tab === 'ai-copy').length;

  // Keep score on this device, once per contract, for the Your Track Record tab.
  useEffect(() => {
    if (p.tracked) return;
    p.tracked = true;
    addToTrack({ seed: p.seedInput || p.seed.toString(36), week: f.week, low: f.low, high: f.high, outcome, held: outcome >= f.low && outcome <= f.high });
  }, [p, f, outcome]);
  const delivered = p.result === 'DELIVERED';
  const played = playedPlan(p);
  const j = judgeForecast({ forecast: f, outcome, stated: p.plan, played });

  const end = Math.ceil(Math.max(outcome, c.deadline, past.p90)) + 1;


  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <header>
        <p className="text-xs uppercase tracking-wider text-slate-500">Your prediction</p>
        <h1 className="text-3xl font-bold text-white mt-1 leading-tight">
          You said <span className="text-emerald-300">week {f.week}</span>.{' '}
          {delivered ? 'It was accepted in' : 'It would have taken until'} <span className="text-amber-300">week {outcome}</span>.
          {p.result === 'BANKRUPT' && <span className="block text-xl text-rose-300 mt-1">The company went bankrupt in week {p.week}.</span>}
        </h1>
        {ninety && <p className="text-sm text-slate-400 mt-2">Your dashboard said 90% done in week {ninety}.</p>}
      </header>

      <Card title="Your numbers" tone="emerald">
        <p className="text-xs text-slate-400 mb-3">Keep this screen open: your instructor will ask the room for a show of hands.</p>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            ['Your 80% range', s.held ? 'Held' : `Missed, ${Math.abs(s.missBy)} wk ${s.missBy > 0 ? 'late' : 'early'}`, `weeks ${f.low}–${f.high}`],
            ['Outcome', `week ${outcome}`, delivered ? 'accepted' : p.result === 'BANKRUPT' ? 'bankrupt: projected' : 'terminated: projected'],
            [`Your chance of week ${c.deadline}`, `${f.onTimeChance}%`, s.onTime ? 'you made it' : 'you missed it'],
            ['Your plan', j.kept === null ? '—' : j.kept ? 'Kept' : 'Changed', j.kept === null ? 'no plan stated' : j.kept ? 'played as stated' : 'played differently'],
            ['Tool used', usedTool ? usedTool.name : 'None', p.desk ? `${p.desk.tabs} tab${p.desk.tabs === 1 ? '' : 's'} opened${p.desk.copied ? ' · AI prompt copied' : ''}` : ''],
          ].map(([k, v, sub]) => (
            <div key={k} className="bg-slate-950 rounded-lg p-3">
              <dt className="text-[10px] uppercase tracking-wider text-slate-500">{k}</dt>
              <dd className="text-xl font-bold text-white">{v}</dd>
              <dd className="text-[11px] text-slate-500">{sub}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <ForecastChart
          log={p.forecastLog} interval={f} band={[past.p10, past.p90]} deadline={c.deadline}
          outcome={outcome} ninetyWeek={ninety} xEnd={Math.max(p.week, c.deadline)}
        />
        <p className="text-sm text-slate-200 mt-2">
          {closeWeek === null ? 'Your forecast never came within a week of the outcome.' : closeWeek === 0 ? 'Your forecast was within a week of the outcome from the start, before week 1.' : `Your forecast first came within a week of the outcome when you played week ${closeWeek}.`}
          {' '}During play you opened decision support in {deskWeeks} of {p.week} week{p.week === 1 ? '' : 's'}{deskUses ? ` and used a tool's numbers ${deskUses} time${deskUses === 1 ? '' : 's'}` : ''}{promptCopies ? `, and copied the AI prompt ${promptCopies} time${promptCopies === 1 ? '' : 's'}` : ''}.
          {' '}The forecast you committed before week 1 is the one that is scored.
        </p>
        <p className="text-xs text-slate-500 mt-2">
          Green: the week you predicted, each week (the bar at week 0 is your 80% range). Gold: when it was actually
          accepted. Amber band: where most past contracts landed — on your screen before week 1.
        </p>
      </Card>

      {p.plan && (
        <Card title="Your plan" tone="amber">
          <dl className="space-y-3">
            <div>
              <dd className="text-xl font-bold text-white">{j.kept ? 'You played the plan you stated' : 'You changed plan'}</dd>
              <dd className="text-sm text-slate-300">{j.kept ? `${describePlan(p.plan)}.` : `You said ${describePlan(p.plan)}; you played ${describePlan(played)}.`}</dd>
            </div>
          </dl>
          <div className="mt-4 pt-3 border-t border-slate-800">
            {j.coaster && (
              <p className="text-sm text-amber-200 mt-3">
                {j.coaster.n} past managers also ran it hands-off.{' '}
                {j.coaster.late === j.coaster.n ? 'All were late' : `${j.coaster.late} of ${j.coaster.n} were late`}; median week {j.coaster.median}.
                {j.coaster.matched && <> Counting managers who added at most one crew: {j.coaster.matched.n}, {j.coaster.matched.late === j.coaster.matched.n ? 'all' : j.coaster.matched.late} late, median week {j.coaster.matched.median}.</>}
              </p>
            )}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card title="Forecast score" tone="emerald">
          <div className="text-4xl font-bold font-mono text-white">{s.forecast}</div>
          <div className="text-xs text-slate-500 mt-1">How right you were about your own project</div>
        </Card>
        <Card title="Delivery score">
          <div className="text-3xl font-bold font-mono text-slate-300">{s.delivery}</div>
          <div className="text-xs text-slate-500 mt-1">{s.late > 0 ? `${s.late} wk late` : 'On time'} · spent {money(p.spent)} of {money(c.budget)}</div>
        </Card>
      </div>

      <Card title="How each tool on the desk would have done">
        {p.desk && (
          <p className="text-xs text-slate-400 mb-3">
            You opened {p.desk.tabs} tool tab{p.desk.tabs === 1 ? '' : 's'}
            {p.desk.order.length > 0 && <> ({p.desk.order.map((id) => tabById(id)?.name).filter(Boolean).join(' → ')})</>} and spent about {p.desk.minutes} minute{p.desk.minutes === 1 ? '' : 's'} before committing.{' '}
            {usedTool ? <>You used the numbers from <strong className="text-white">{usedTool.name}</strong>{p.desk.edited ? ' and then changed them' : ''}.</> : 'You set your own numbers.'}
          </p>
        )}
        <ul className="divide-y divide-slate-800">
          {tools.map((t) => (
            <li key={t.key} className="py-1.5 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-slate-200 min-w-0">{t.name}</span>
                <span className="font-mono text-xs text-slate-400 whitespace-nowrap">wk {t.week} ({t.low}–{t.high})</span>
                <span className={`text-xs font-semibold w-20 text-right ${t.result === 'held' ? 'text-slate-100' : 'text-rose-300'}`}>
                  {t.result === 'held' ? 'held' : `missed ${t.result}`}
                </span>
              </div>
              {t.about && <div className="text-[11px] text-slate-500">{t.about}</div>}
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-slate-500 mt-2">Each tool's 80% range for the plan you stated, against week {outcome}. The tools never knew this scenario.</p>
      </Card>

      <Card title="Why: what your dashboard told you">
        <RevealChart
          history={p.history} deadline={c.deadline}
          finishWeek={delivered ? p.finishWeek : null} ninetyWeek={ninety}
          band={[past.p10, past.p90]} end={end}
        />
        <p className="text-xs text-slate-500 mt-2">
          Blue: reported complete each week. Red: units the customer's acceptance test rejected. The last stretch is
          where the time went.
        </p>
      </Card>

      <button type="button" onClick={onReplay} className="w-full py-3 rounded-xl bg-slate-800 text-white text-sm">Play again</button>
    </div>
  );
}
