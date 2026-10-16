import { useState } from 'react';
import { CONFIG, pastContracts } from './engine';
import { Card } from './ui';
import { money } from './format';
import { RevealChart, ForecastChart } from './charts';

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

export default function Reveal({ project, name, onReplay }) {
  const c = CONFIG;
  const p = project;
  const past = pastContracts();
  const s = p.scores();
  const f = p.forecast;
  const outcome = s.outcome;
  const ninety = p.ninetyWeek();
  const outsideHeld = outcome >= past.p10 && outcome <= past.p90;
  const code = p.resultCode(name);
  const [copied, setCopied] = useState(false);
  const delivered = p.result === 'DELIVERED';

  const end = Math.ceil(Math.max(outcome, c.deadline, past.p90)) + 1;
  const missText = s.held ? 'inside your 80% range' : s.missBy > 0 ? `${s.missBy} weeks past your 80% range` : `${-s.missBy} weeks before your 80% range`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <header>
        <p className="text-xs uppercase tracking-wider text-slate-500">Your prediction</p>
        <h1 className="text-3xl font-bold text-white mt-1 leading-tight">
          You said <span className="text-emerald-300">week {f.week}</span>.{' '}
          {delivered ? 'It was accepted in' : 'It would have taken until'} <span className="text-amber-300">week {outcome}</span>.
        </h1>
        <p className="text-sm text-slate-400 mt-2">
          That is {missText}.
          {ninety && <> Your dashboard said 90% done in week {ninety}.</>}
        </p>
      </header>

      <Card>
        <ForecastChart
          log={p.forecastLog} interval={f} band={[past.p10, past.p90]} deadline={c.deadline}
          outcome={outcome} ninetyWeek={ninety} xEnd={Math.max(p.week, c.deadline)}
        />
        <p className="text-xs text-slate-500 mt-2">
          Green: the week you predicted, each week (the bar at week 0 is your 80% range). Gold: when it was actually
          accepted. Amber band: where most past contracts landed — on your screen before week 1.
        </p>
      </Card>

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

      <Card title="Your result code" tone="emerald">
        <p className="text-xs text-slate-400 mb-2">Send this to your instructor for the room chart.</p>
        <div className="font-mono text-xs bg-slate-950 border border-slate-800 rounded-lg p-3 break-all text-slate-200 select-all">{code}</div>
        <div className="flex gap-2 mt-3">
          <button type="button" onClick={copy} className="flex-1 py-2 rounded-lg bg-slate-800 text-white text-sm">{copied ? 'Copied' : 'Copy code'}</button>
          <button type="button" onClick={onReplay} className="flex-1 py-2 rounded-lg bg-slate-800 text-white text-sm">Play again</button>
        </div>
      </Card>
    </div>
  );
}
