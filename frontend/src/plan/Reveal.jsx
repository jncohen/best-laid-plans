import { useEffect } from 'react';
import { CONFIG, pastContracts, playedPlan, judgeForecast, describePlan, planKept } from './engine';
import { screenData, allForecasts, tabById, tabByLetter } from './desk.js';
import { addToTrack } from './track';
import { Card } from './ui';
import { money } from './format';
import { RevealChart, ForecastChart } from './charts';

const VERDICT = {
  reasoned: ['Reasoned', 'Your range held because you forecast from contracts run like yours.'],
  lucky: ['Lucky', 'Your range held, but not for the reason you gave.'],
  missed: ['Missed', 'Your range missed.'],
};

/** One range on a shared week axis, with the outcome marked. */
function RangeBar({ label, low, high, mid, outcome, tone, lo, hi }) {
  const x = (w) => `${((Math.min(hi, Math.max(lo, w)) - lo) / (hi - lo)) * 100}%`;
  const held = outcome >= low && outcome <= high;
  return (
    <div className="grid grid-cols-[7.5rem_1fr_3.5rem] items-center gap-2 py-1.5">
      <div className="text-xs text-slate-300 leading-tight">{label}</div>
      <div className="relative h-4">
        <div className="absolute top-1.5 inset-x-0 h-px bg-slate-700" />
        <div className={`absolute top-1 h-2 rounded ${tone}`} style={{ left: x(low), width: `calc(${x(high)} - ${x(low)})` }} />
        {mid !== null && <div className="absolute top-0 w-0.5 h-4 bg-white/80" style={{ left: x(mid) }} />}
        <div className="absolute inset-y-0 border-l-2 border-amber-200" style={{ left: x(outcome) }} />
      </div>
      <div className={`text-xs font-mono text-right ${held ? 'text-slate-200' : 'text-rose-300'}`}>{low}–{high}</div>
    </div>
  );
}

function Row({ label, children, verdict, good }) {
  return (
    <div className="py-3 border-t border-slate-800 first:border-t-0">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="flex items-baseline justify-between gap-3 mt-0.5">
        <div className="text-sm text-slate-200">{children}</div>
        {verdict && <div className={`text-sm font-bold whitespace-nowrap ${good ? 'text-emerald-400' : 'text-rose-400'}`}>{verdict}</div>}
      </div>
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
  const ninety = p.ninetyWeek();
  const outsideHeld = outcome >= past.p10 && outcome <= past.p90;
  // How every tool on the desk would have done, for the plan the student stated.
  const tools = allForecasts(screenData(), p.plan || playedPlan(p)).map((t) => ({
    ...t, verdict: outcome >= t.low && outcome <= t.high ? 'held' : outcome > t.high ? 'late' : 'early',
  }));
  const usedTool = p.desk?.tool ? tabByLetter(p.desk.tool) : null;
  // The running forecast: when did it first come within a week of the outcome?
  const close = p.forecastLog.find((e) => Math.abs(e.forecast - outcome) <= 1);
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
  const m = j.matched;
  const [vTitle, vLine] = j.verdict ? VERDICT[j.verdict] : [null, null];
  const lo = Math.floor(Math.min(f.low, past.p10, m.p10, outcome)) - 1;
  const hi = Math.ceil(Math.max(f.high, past.p90, m.p90, outcome)) + 1;

  const end = Math.ceil(Math.max(outcome, c.deadline, past.p90)) + 1;
  const missText = s.held ? 'inside your 80% range' : s.missBy > 0 ? `${s.missBy} weeks past your 80% range` : `${-s.missBy} weeks before your 80% range`;


  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <header>
        <p className="text-xs uppercase tracking-wider text-slate-500">Your prediction</p>
        <h1 className="text-3xl font-bold text-white mt-1 leading-tight">
          You said <span className="text-emerald-300">week {f.week}</span>.{' '}
          {delivered ? 'It was accepted in' : 'It would have taken until'} <span className="text-amber-300">week {outcome}</span>.
          {p.result === 'BANKRUPT' && <span className="block text-xl text-rose-300 mt-1">The company went bankrupt in week {p.week}.</span>}
        </h1>
        <p className="text-sm text-slate-400 mt-2">
          That is {missText}.
          {ninety && <> Your dashboard said 90% done in week {ninety}.</>}
        </p>
      </header>

      <Card title="Your numbers" tone="emerald">
        <p className="text-xs text-slate-400 mb-3">Keep this screen open: your instructor will ask the room for a show of hands.</p>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            ['Your 80% range', s.held ? 'Held' : 'Missed', `weeks ${f.low}–${f.high}`],
            ['Late or early', s.held ? 'Neither' : s.missBy > 0 ? 'Late' : 'Early', s.held ? 'inside your range' : `by ${Math.abs(s.missBy)} wk`],
            ['Outcome', `week ${outcome}`, delivered ? 'accepted' : p.result === 'BANKRUPT' ? 'bankrupt: projected' : 'terminated: projected'],
            [`Your chance of week ${c.deadline}`, `${f.onTimeChance}%`, s.onTime ? 'you made it' : 'you missed it'],
            ['Verdict', vTitle || '—', vTitle ? 'plan and range' : 'no plan stated'],
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
          {close ? (close.week === 0 ? 'Your forecast was within a week of the outcome from the start, before week 1.' : `Your forecast first came within a week of the outcome when you played week ${close.week}.`) : 'Your forecast never came within a week of the outcome.'}
          {' '}During play you opened decision support in {deskWeeks} of {p.week} week{p.week === 1 ? '' : 's'}{deskUses ? ` and used a tool's numbers ${deskUses} time${deskUses === 1 ? '' : 's'}` : ''}{promptCopies ? `, and copied the AI prompt ${promptCopies} time${promptCopies === 1 ? '' : 's'}` : ''}.
          {' '}The forecast you committed before week 1 is the one that is scored.
        </p>
        <p className="text-xs text-slate-500 mt-2">
          Green: the week you predicted, each week (the bar at week 0 is your 80% range). Gold: when it was actually
          accepted. Amber band: where most past contracts landed — on your screen before week 1.
        </p>
      </Card>

      {p.plan && (
        <Card title="Your plan and your range" tone="amber">
          <div className="text-sm text-slate-300 space-y-1">
            <p><span className="text-slate-500">You said you would play:</span> {describePlan(p.plan)}.</p>
            <p><span className="text-slate-500">You played:</span> {describePlan(played)}.{' '}
              <strong className="text-white">{planKept(p.plan, played) ? 'Plan kept.' : 'Plan changed.'}</strong></p>
          </div>
          <div className="mt-3">
            <RangeBar label="Your 80% range" low={f.low} high={f.high} mid={f.week} outcome={outcome} tone="bg-emerald-400/70" lo={lo} hi={hi} />
            <RangeBar label={`All ${past.n} past contracts`} low={past.p10} high={past.p90} mid={past.median} outcome={outcome} tone="bg-amber-500/40" lo={lo} hi={hi} />
            <RangeBar label={`${m.n} run like what you played`} low={m.p10} high={m.p90} mid={m.median} outcome={outcome} tone="bg-amber-400/80" lo={lo} hi={hi} />
            <p className="text-[11px] text-slate-500 mt-1">Bars: 80% ranges (past contracts: 10th–90th percentile). White tick: point forecast or median. Gold line: week {outcome}, when it was accepted.</p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Verdict</div>
            <div className="text-2xl font-bold text-white mt-0.5">{vTitle}</div>
            <p className="text-sm text-slate-200 mt-1">{vLine}</p>
            {j.why === 'changed' && (
              <p className="text-xs text-slate-400 mt-1">You played a different plan from the one you stated. The contracts run like what you actually played said weeks {m.p10}–{m.p90}.</p>
            )}
            {j.why === 'off-record' && (
              <p className="text-xs text-slate-400 mt-1">Contracts run like yours said week {m.median} (weeks {m.p10}–{m.p90}); your forecast of week {f.week} (weeks {f.low}–{f.high}) was not built on them.</p>
            )}
            {j.verdict === 'reasoned' && (
              <p className="text-xs text-slate-400 mt-1">You kept your plan, and your forecast sat on the {m.n} contracts run like it: median week {m.median}, weeks {m.p10}–{m.p90}.</p>
            )}
            {j.verdict === 'missed' && (
              <p className="text-xs text-slate-400 mt-1">The {m.n} past contracts run like what you played said week {m.median}, weeks {m.p10}–{m.p90}. They were on your screen before week 1.</p>
            )}
            {j.coaster && (
              <p className="text-sm text-amber-200 mt-3">
                {j.coaster.n} past managers also ran it hands-off.{' '}
                {j.coaster.late === j.coaster.n ? 'All were late' : `${j.coaster.late} of ${j.coaster.n} were late`}; median week {j.coaster.median}.
                {j.coaster.matched && <> Counting managers who added at most one crew: {j.coaster.matched.n}, {j.coaster.matched.late === j.coaster.matched.n ? 'all' : j.coaster.matched.late} late, median week {j.coaster.matched.median}.</>}
              </p>
            )}
            <p className="text-[11px] text-slate-500 mt-3">The verdict is information. It does not change your scores.</p>
          </div>
        </Card>
      )}

      <Card>
        <Row label="Your 80% range" verdict={s.held ? 'Held' : 'Missed'} good={s.held}>
          Weeks {f.low}–{f.high}. Accepted week {outcome}.
        </Row>
        <Row label="The past contracts" verdict={outsideHeld ? 'Held' : 'Missed'} good={outsideHeld}>
          Most landed in weeks {past.p10}–{past.p90} (median {past.median}).
        </Row>
        <Row label={`Your chance of making week ${c.deadline}`} verdict={s.onTime ? 'Made it' : 'Late'} good={s.onTime}>
          You said {f.onTimeChance}%. {Math.round(past.onTimeShare * 100)}% of past contracts made it.
        </Row>
      </Card>

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
            {usedTool ? <>You used the numbers from <strong className="text-white">{usedTool.name}</strong>{p.desk.edited ? ' and then changed them' : ''}.</> : p.desk.edited ? 'You set your own numbers.' : 'You kept the numbers the form started with.'}
          </p>
        )}
        <ul className="divide-y divide-slate-800">
          {tools.map((t) => (
            <li key={t.key} className="flex items-baseline justify-between gap-2 py-1.5 text-sm">
              <span className="text-slate-200 min-w-0">{t.name}</span>
              <span className="font-mono text-xs text-slate-400 whitespace-nowrap">wk {t.week} ({t.low}–{t.high})</span>
              <span className={`text-xs font-semibold w-20 text-right ${t.verdict === 'held' ? 'text-slate-100' : 'text-rose-300'}`}>
                {t.verdict === 'held' ? 'held' : `missed ${t.verdict}`}
              </span>
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
