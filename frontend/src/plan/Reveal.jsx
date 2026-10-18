import { CONFIG, pastContracts, playedPlan, judgeForecast, describePlan, firstCloseWeek, playSummary } from './engine';
import { screenData, allForecasts, tabById, tabByLetter } from './desk.js';
import { Card } from './ui';
import { money } from './format';
import { RevealChart, ForecastChart, RangeChart } from './charts';

// What each tool sees and can't see: shown here, after the outcome, not on the tabs.
const TOOL_TAB = { status: 'status', schedule: 'schedule', last5: 'last5', 'records-all': 'records', 'records-plan': 'records', analytics: 'analytics', simulator: 'simulator', 'simulator-blind': 'simulator' };
function aboutTool(key) {
  if (key === 'simulator-blind') return 'Sees variability and scope changes · can\'t see rework';
  if (key.startsWith('chat-')) return null;
  const tab = tabById(TOOL_TAB[key]);
  return tab ? `Sees ${tab.sees.charAt(0).toLowerCase()}${tab.sees.slice(1)} · can't see ${tab.cant.charAt(0).toLowerCase()}${tab.cant.slice(1)}` : null;
}
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const times = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

/** The finish screen: what happened, stated plainly, before the results are revealed. */
export function Finished({ project, onReveal }) {
  return (
    <div className="max-w-md mx-auto px-4 py-24 text-center space-y-6">
      {project.result === 'DELIVERED' ? (
        <h1 className="text-3xl font-bold text-yellow-300">Accepted in full in week {project.finishWeek}.</h1>
      ) : project.result === 'BANKRUPT' ? (
        <h1 className="text-2xl font-bold text-rose-300">The company went bankrupt in week {project.week}. The contract was never delivered.</h1>
      ) : (
        <h1 className="text-2xl font-bold text-rose-300">The customer terminated the contract after week {project.week}. It was never delivered.</h1>
      )}
      <p className="text-slate-300">Don't reveal your results yet. Wait for your instructor.</p>
      <p className="text-sm text-slate-400">While you wait: was your forecast before week 1 right? How sure were you, 0–100?</p>
      <button type="button" onClick={onReveal} className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold">
        Reveal results
      </button>
    </div>
  );
}

/** How you played, in three plain sentences. */
function HowYouPlayed({ p }) {
  const h = playSummary(p);
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">How you played</div>
      <ul className="space-y-1 text-sm text-slate-200">
        <li>You checked tools in {h.checkedWeeks} of {plural(h.played, 'week')}.</li>
        <li>{h.forecastChanges === 0 ? 'You never changed your forecast.' : `You changed your forecast ${times(h.forecastChanges)} (first in week ${h.firstForecastChange}).`}</li>
        <li>{h.engagedToEnd ? 'You were still checking or changing things in your last week.'
          : h.autopilotAfter === 0 ? 'After you committed, you changed nothing.'
            : `After week ${h.autopilotAfter} you changed nothing.`}</li>
      </ul>
    </div>
  );
}

export default function Reveal({ project, onReplay }) {
  const c = CONFIG;
  const p = project;
  const past = pastContracts();
  const s = p.scores();
  const f = p.forecast;
  const outcome = s.outcome;
  const delivered = p.result === 'DELIVERED';
  const played = playedPlan(p);
  const j = judgeForecast({ forecast: f, outcome, stated: p.plan, played, failed: s.failed });
  // How every tool on the desk would have done, for the plan the student stated.
  const tools = allForecasts(screenData(), p.plan || played).map((t) => ({
    about: aboutTool(t.key),
    // Never delivered is a miss for every range.
    ...t, result: s.failed ? s.failed : outcome >= t.low && outcome <= t.high ? 'held' : outcome > t.high ? 'late' : 'early',
  }));
  const usedTool = p.desk?.tool ? tabByLetter(p.desk.tool) : null;
  const closeWeek = firstCloseWeek(p.forecastLog, outcome);
  const rows = p.history.filter((r) => !r.bankrupt);
  // The week the dashboard first read 100%: the acceptance test ran then (and any rejects pulled it back below 100%).
  const full = rows.find((r) => r.rejected > 0 || r.reported >= 0.9995);
  const ninety = rows.find((r) => r.reported >= 0.9);
  // The plan, judged by the week-1 decisions (the game sets them from the plan), and the changes after.
  const w1 = rows[0];
  const startedAsStated = p.plan && w1 ? w1.crews === Math.min(c.maxCrews, c.crews + Math.min(c.maxHirePerWeek, p.plan.crews)) && w1.inspect === p.plan.inspect && w1.shift === (p.plan.shift === 'every') : null;
  const laterChanges = playSummary(p).weeks.filter((w) => w.week > 1 && w.decided).length;
  const ended = p.result === 'BANKRUPT' ? `It was never delivered: the company went bankrupt in week ${p.week}.`
    : p.result === 'TERMINATED' ? `It was never delivered: the customer terminated the contract after week ${c.horizon}.` : `It was accepted in week ${outcome}.`;
  const end = Math.ceil(Math.max(outcome, c.deadline, past.p90)) + 1;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <header>
        <p className="text-xs uppercase tracking-wider text-slate-500">The lesson</p>
        <h1 className="text-2xl font-bold text-white mt-1 leading-snug">
          {full ? <>Your dashboard said <span className="text-sky-300">week {full.week}</span>.</> : <>Your dashboard never read 100%.</>}{' '}
          The past contracts said <span className="text-amber-300">week {past.median}</span>.{' '}
          <span className={delivered ? 'text-yellow-300' : 'text-rose-300'}>{ended}</span>
        </h1>
        <p className="text-xs text-slate-400 mt-2">"Said" means the week the dashboard first read 100%, and the median of the past contracts that were delivered ({past.p10}–{past.p90} for most; {past.failed.total} of {past.n} never delivered). Keep this screen open: your instructor will ask the room for a show of hands.</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card title="Forecast score" tone="emerald">
          <div className="text-4xl font-bold font-mono text-white">{s.forecast}</div>
          <p className="text-sm text-slate-300 mt-1">
            Your week-1 prediction: week {f.week}, 80% sure of {f.low}–{f.high}.{' '}
            {s.held ? 'The range held.' : s.failed ? 'It missed: the contract was never delivered.' : `It missed by ${plural(Math.abs(s.missBy), 'week')} (${s.missBy > 0 ? 'late' : 'early'}).`}{' '}
            You gave {f.onTimeChance}% to week {c.deadline}; {s.onTime ? 'it was made' : "it wasn't made"}.
          </p>
        </Card>
        <Card title="Updating score" tone="emerald">
          <div className="text-4xl font-bold font-mono text-white">{s.updating}</div>
          <p className="text-sm text-slate-300 mt-1">How well your weekly forecast tracked the evidence, later weeks counting more. Narrow ranges that hold score best.</p>
        </Card>
        <Card title="Delivery score">
          <div className="text-4xl font-bold font-mono text-slate-300">{s.delivery}</div>
          <p className="text-sm text-slate-300 mt-1">
            {s.failed ? `Never delivered (${s.failed}).` : s.late > 0 ? `${plural(s.late, 'week')} late.` : 'On time.'} You spent {money(p.spent)} of {money(c.budget)}.
          </p>
        </Card>
      </div>

      <Card title="How each tool on the desk would have done">
        <ul className="divide-y divide-slate-800">
          {tools.map((t) => (
            <li key={t.key} className="py-1.5 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-slate-200 min-w-0">{t.name}</span>
                <span className="font-mono text-xs text-slate-400 whitespace-nowrap">wk {t.week} ({t.low}–{t.high})</span>
                <span className={`text-xs font-semibold w-24 text-right ${t.result === 'held' ? 'text-slate-100' : 'text-rose-300'}`}>
                  {t.result === 'held' ? 'held' : `missed${s.failed ? ':' : ''} ${t.result}`}
                </span>
              </div>
              {t.fail && <div className="text-[11px] text-rose-300">{t.fail}</div>}
              {t.about && <div className="text-[11px] text-slate-500">{t.about}</div>}
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-slate-500 mt-2">
          Each tool's 80% range before week 1, for the plan you stated, against {s.failed ? `a contract that was never delivered (${s.failed}): a miss for every range` : `week ${outcome}`}. Ranges from the record are from delivered contracts; the line under one counts those that weren't. The tools never knew this scenario, or your own luck.
        </p>
      </Card>

      <Card title="Your range against the record">
        <RangeChart yours={[f.low, f.high]} point={f.week} record={[past.p10, past.p90]} median={past.median} outcome={outcome} delivered={delivered} deadline={c.deadline} />
        <p className="text-[11px] text-slate-500 mt-1">Green: your 80% range and point before week 1. Amber: where most delivered past contracts landed, and their median. Yellow: the week it was accepted. Red dashes: the deadline.</p>
      </Card>

      <Card title="What your dashboard told you">
        <RevealChart
          history={p.history} deadline={c.deadline}
          finishWeek={delivered ? p.finishWeek : null} ninetyWeek={ninety ? ninety.week : null}
          band={[past.p10, past.p90]} end={end}
        />
        <p className="text-sm text-slate-300 mt-2">
          {ninety ? `Your dashboard first passed 90% in week ${ninety.week} (it read ${Math.round(ninety.reported * 100)}%).` : 'Your dashboard never passed 90%.'}
          {full && delivered ? ` It read 100% in week ${full.week}; the customer accepted it in week ${outcome}.` : ''}
        </p>
        <p className="text-xs text-slate-500 mt-1">Blue: reported complete each week. Red: units the customer's acceptance test rejected. The last stretch is where the time went.</p>
      </Card>

      <details className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <summary className="text-sm font-semibold text-slate-200 cursor-pointer">More detail</summary>
        <div className="space-y-5 mt-4">
          <div>
            <ForecastChart
              log={p.forecastLog} interval={f} band={[past.p10, past.p90]} deadline={c.deadline}
              outcome={delivered ? outcome : null} ninetyWeek={ninety ? ninety.week : null} xEnd={Math.max(p.week, c.deadline)}
            />
            <p className="text-sm text-slate-200 mt-2">
              {closeWeek === null ? 'Your forecast never came within a week of the outcome.' : closeWeek === 0 ? 'Your forecast was within a week of the outcome from the start, before week 1.' : `Your forecast first came within a week of the outcome when you played week ${closeWeek}.`}
            </p>
            <p className="text-xs text-slate-500 mt-1">Green: the week you predicted, each week (the bar at week 0 is your 80% range). Gold: when it was accepted. Amber band: where most past contracts landed.</p>
          </div>

          <HowYouPlayed p={p} />

          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Your plan and your numbers</div>
            <ul className="space-y-1 text-sm text-slate-200">
              {p.plan && <li>Your plan: {describePlan(p.plan)}. {startedAsStated ? 'Week 1 ran as stated' : 'You changed it before playing week 1'}{laterChanges ? `; you changed your decisions in ${plural(laterChanges, 'later week')}.` : '; you changed nothing after.'}</li>}
              {p.desk && <li>Before committing you opened {plural(p.desk.tabs, 'tool tab')}{p.desk.order.length > 0 ? ` (${p.desk.order.map((id) => tabById(id)?.name).filter(Boolean).join(', ')})` : ''}{p.desk.copied ? ' and copied the AI prompt' : ''}.</li>}
              <li>{usedTool ? `Your committed numbers came from ${usedTool.name}${p.desk.edited ? ', and you then changed them' : ''}.` : 'You set your committed numbers yourself.'}</li>
              {j.coaster && (
                <li className="text-amber-200">
                  {j.coaster.n} past managers also ran it hands-off.{' '}
                  {j.coaster.late === j.coaster.n ? 'All were late' : `${j.coaster.late} of ${j.coaster.n} were late`}; median week {j.coaster.median}.
                </li>
              )}
            </ul>
          </div>
        </div>
      </details>

      <button type="button" onClick={onReplay} className="w-full py-3 rounded-xl bg-slate-800 text-white text-sm">Play again</button>
    </div>
  );
}
