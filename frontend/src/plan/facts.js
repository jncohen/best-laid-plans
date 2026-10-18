/**
 * "Your game in 9 facts": the reveal's numbered card, so the instructor can ask the
 * room "hands up if fact 3 happened to you". Every fact is computed from the finished
 * project and the briefing; nothing here changes an outcome.
 */
import { CONFIG, Project, pastContracts, historyMean, dashboardPeak, describePlan, playSummary, matchContracts, isCheck } from './engine.js';
import { screenData, allForecasts, tabById } from './desk.js';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const money = (n) => (n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n / 1000)}k`);
const wk = (w) => (Number.isInteger(w) ? w : Math.ceil(w));

/** Draws for the luck replay: fixed, so the same game always gives the same counts. */
export const REPLAY_DRAWS = 100;
const replayLuck = (k) => (Math.imul(k + 1, 2654435761) ^ 0x5bd1e995) >>> 0;

/**
 * The student's own decisions, week by week, replayed under other personal luck in the
 * same shared world (the code's contract, scope change and draws). Weeks past the end of
 * the student's game keep their last inspection and shift, and add no crews. Returns the
 * counts and each replay's outcome week (projected, for a game never delivered).
 */
export function luckReplay(p, draws = REPLAY_DRAWS) {
  const ds = p.decisions || [];
  const last = ds.length ? ds[ds.length - 1] : { hire: 0, shift: false, inspect: 0 };
  const f = p.forecast;
  let onTime = 0, bankrupt = 0, held = 0;
  const weeks = [];
  for (let k = 0; k < draws; k++) {
    const q = new Project(p.seedInput ?? p.seed, p.cfg, replayLuck(k));
    let w = 0;
    while (!q.done) { q.play(ds[w] || { hire: 0, shift: last.shift, inspect: last.inspect }); w++; }
    const o = q.outcomeWeek(), delivered = q.result === 'DELIVERED';
    weeks.push(o);
    if (delivered && q.finishWeek <= p.cfg.deadline) onTime++;
    if (q.result === 'BANKRUPT') bankrupt++;
    if (f && delivered && o >= f.low && o <= f.high) held++;
  }
  const sorted = [...weeks].sort((a, b) => a - b), at = (x) => sorted[Math.max(0, Math.ceil(x * sorted.length) - 1)];
  return { draws, onTime, bankrupt, held, weeks, median: at(0.5), p10: at(0.1), p90: at(0.9) };
}

/** Whether the student moved the running forecast in the week a log entry was played (not the calendar). */
function moved(e, prev, c) {
  if (e.touched !== undefined) return !!e.touched;
  if (e.carried) return false;
  const up = (v) => Math.max(v, e.week);
  return e.forecast !== up(prev.forecast) || (e.low ?? e.forecast) !== up(prev.low ?? prev.forecast) || (e.high ?? e.forecast) !== up(prev.high ?? prev.forecast)
    || (e.chance !== undefined && prev.chance !== undefined && e.chance !== prev.chance && !(e.week > c.deadline && e.chance === 0));
}

/** Who a desk forecast belongs to, in the facts' words: "Mabel's", "the Records". */
const sourceName = (key, name) => (key.startsWith('chat-') ? `${name.replace(/^Team Chat: /, '').split(',')[0]}'s` : `the ${name}`);

/** The eight facts, each { n, title, text, key, value } with a machine-readable `value` for tests. */
export function gameFacts(p, { replay = luckReplay(p) } = {}) {
  const c = p.cfg || CONFIG;
  const f = p.forecast;
  const s = p.scores();
  const rows = p.history.filter((r) => !r.bankrupt);
  // What was opened before week 1: fact 3's parenthetical. Openings during play are counted in checkingSummary.
  const openedBefore = new Set(p.desk?.order || []);
  const log = p.forecastLog;
  // Did the student move the forecast in weeks a+1..a+2, the two weeks after something happened in week a?
  const movedWithin = (a) => log.some((e, i) => i > 0 && e.week > a && e.week <= a + 2 && moved(e, log[i - 1], c));

  // How much the student looked: every opening of an information tab, before week 1 and week by week;
  // the AI steps; and the week after which they stopped looking ("checked out"), if they did.
  const checking = checkingSummary(p);

  // Keep/Change checkpoint taps, by event: what the student did when the game showed it to them.
  const tapped = (event) => (p.checkpoints || []).find((k) => k.event === event) || null;
  const saw = (k) => `You saw it, and you ${k.choice === 'change' ? 'changed' : 'kept'} your forecast.`;

  // 1. The starting point: the gut forecast, then the final one after the tour.
  const paceWeeks = c.scope / historyMean(c, p.seedInput), past = pastContracts(c, p.seedInput);
  const near = [
    Math.abs(f.week - paceWeeks) <= 1 && 'close to the line\'s pace',
    Math.abs(f.week - past.median) <= 1 && 'close to the past contracts\' median',
    f.week === c.deadline && 'at the deadline',
  ].filter(Boolean);
  const start = near.length ? near : ['your own number'];

  // 3. The 90% moment, from the dashboard's peak reading each week, and the rejections after it.
  const ninety = rows.find((r) => dashboardPeak(r) >= 0.9);
  const firstReject = rows.find((r) => r.rejected > 0);
  const rejected = rows.reduce((a, r) => a + r.rejected, 0);
  const afterReject = firstReject ? movedWithin(firstReject.week) : null;

  // 4. The surprise: the scope change against the record's spread, and a move within 2 weeks of it.
  const shock = rows.find((r) => r.shock > 0);
  const units = past.contracts.map((r) => r.scopeUnits);
  const spread = [Math.min(...units), Math.max(...units)];
  const changedWithin = shock ? movedWithin(shock.week) : null;

  // 5. Whose numbers: the commitment's source, any used during play, or the desk forecast closest to a hand-set one.
  const committed = p.desk?.source || '';
  const midGame = p.deskLog.filter((d) => d.tab.startsWith('use:')).map((d) => {
    const [, id, who] = d.tab.split(':');
    return { week: d.week, name: who ? `${who}'s` : `the ${tabById(id)?.name || id}` };
  });
  let closest = null;
  if (!committed) {
    const fs = allForecasts(screenData(c, p.seedInput), p.plan || { crews: 0, inspect: 0, shift: 'none' });
    closest = fs.map((x) => ({ x, d: Math.abs(x.week - f.week) + Math.abs(x.low - f.low) + Math.abs(x.high - f.high) })).sort((a, b) => a.d - b.d)[0].x;
  }
  const committedText = committed ? `You committed ${/'s$/.test(committed) ? committed : `the ${committed}`} numbers${p.desk?.edited ? ', then changed them' : ''}.`
    : `You set your own numbers, closest to ${sourceName(closest.key, closest.name)} (week ${closest.week}, ${closest.low}–${closest.high}).`;
  const midText = midGame.length ? ` During play you used ${midGame.map((m) => `${m.name} in week ${m.week}`).join(', ')}.` : '';

  // 7. Money.
  const broke = p.history.find((r) => r.bankrupt);
  const over = Math.max(0, p.spent - c.budget);

  // 8. Luck: the replay against the student's own game.
  const outcome = s.outcome;
  const luckier = replay.weeks.filter((w) => w > outcome).length;

  // 0. The plan: what was stated, whether week 1 ran as stated, and how much changed after.
  const w1 = rows[0];
  const ranAsStated = p.plan && w1 ? w1.crews === Math.min(c.maxCrews, c.crews + Math.min(c.maxHirePerWeek, p.plan.crews)) && w1.inspect === p.plan.inspect && w1.shift === (p.plan.shift === 'every') : null;
  const changed = playSummary(p).weeks.filter((w) => w.week > 1 && w.decided).length;
  const end = rows[rows.length - 1];
  const planText = p.plan
    ? `You planned ${describePlan(p.plan)}. ${ranAsStated ? 'Week 1 ran as planned' : 'You changed it before playing week 1'}; ${changed ? `you changed your decisions in ${plural(changed, 'later week')}` : 'you changed nothing after that'}${end ? `, and finished with ${plural(end.crews, 'crew')} and ${Math.round(end.inspect * 100)}% inspection` : ''}.`
    : 'You stated no plan.';

  const facts = [
    { n: 0, key: 'plan', title: 'Your plan', value: { plan: p.plan, ranAsStated, changed },
      text: planText },
    { n: 1, key: 'start', title: 'Your starting point', value: { week: f.week, near: start, gut: p.gutForecast ? p.gutForecast.week : null },
      text: p.gutForecast
        ? `Gut: week ${p.gutForecast.week}. Final: week ${f.week}${p.gutForecast.week === f.week && p.gutForecast.low === f.low && p.gutForecast.high === f.high ? ', kept after the tour' : ' (after the tour)'}: ${start.join(' and ')}.`
        : `You committed week ${f.week}: ${start.join(' and ')}.` },
    { n: 2, key: 'record', title: 'What you checked', value: { records: openedBefore.has('records'), last5: openedBefore.has('last5'), ...checking },
      text: `Before week 1 you checked information sources ${plural(checking.before, 'time')} (Records: ${openedBefore.has('records') ? 'yes' : 'no'}; Last 5 Contracts: ${openedBefore.has('last5') ? 'yes' : 'no'}). `
        + (checking.during ? `During play, ${plural(checking.during, 'more check')} in ${checking.weeksChecked} of ${plural(checking.weeks, 'week')}; ` : 'During play you checked nothing; ')
        + (checking.during ? (checking.stoppedAfter !== null ? `your last look was before week ${checking.stoppedAfter} (${plural(checking.weeks - checking.stoppedAfter, 'week')} played without one). ` : 'you kept checking to the end. ') : '')
        + (checking.aiUsed ? `AI: ${[checking.aiOpened && 'you opened Ask an AI', checking.aiCopied && 'copied its prompt', checking.csv && 'downloaded the records'].filter(Boolean).join(', ')}.` : 'You did not use AI.') },
    { n: 3, key: 'ninety', title: 'The 90% moment', value: { week: ninety ? ninety.week : null, peak: ninety ? dashboardPeak(ninety) : null, rejected, afterReject },
      text: (ninety
        ? `Your dashboard passed 90% in week ${ninety.week} (it read ${Math.round(dashboardPeak(ninety) * 100)}%); ${rejected > 0 ? `the customer then rejected ${plural(rejected, 'unit')}.` : 'the customer rejected no units.'}`
        : `Your dashboard never passed 90%${rejected > 0 ? `; the customer rejected ${plural(rejected, 'unit')}.` : '.'}`)
        + (tapped('ninety') ? ` At 90%: ${saw(tapped('ninety'))}` : '')
        + (firstReject ? (tapped('reject') ? ` At the rejection: ${saw(tapped('reject'))}` : ` You changed your forecast within 2 weeks of the rejection: ${afterReject ? 'yes' : 'no'}.`) : '') },
    { n: 4, key: 'surprise', title: 'The surprise', value: shock ? { units: shock.shock, week: shock.week, spread, changedWithin } : null,
      text: shock
        ? `The customer added ${shock.shock} units in week ${shock.week} (past contracts: +${spread[0]} to +${spread[1]}). ${tapped('scope') ? saw(tapped('scope')) : `You changed your forecast within 2 weeks: ${changedWithin ? 'yes' : 'no'}.`}`
        : 'The contract ended before the customer added any units.' },
    { n: 5, key: 'advice', title: 'Advice', value: { committed, edited: !!p.desk?.edited, midGame, closest: closest ? closest.key : null },
      text: committedText + midText },
    { n: 6, key: 'range', title: 'Your range', value: { held: s.held, missBy: s.missBy, failed: s.failed },
      text: s.failed
        ? `Your 80% range (weeks ${f.low}–${f.high}): missed. The contract was never delivered.`
        : `Your 80% range (weeks ${f.low}–${f.high}): ${s.held ? 'held' : `missed by ${plural(Math.abs(s.missBy), 'week')} (${s.missBy > 0 ? 'late' : 'early'})`}.` },
    { n: 7, key: 'money', title: 'Money', value: { bankruptWeek: broke ? broke.week : null, shortfall: broke ? broke.shortfall : null, over },
      text: (broke
        ? `Bankrupt: yes, in week ${broke.week}. Its payroll (${money(broke.payroll)}) would have gone ${money(broke.shortfall)} past the ${money(c.creditLine)} credit line.`
        : `Bankrupt: no.${over > 0 ? ` Over budget by ${money(over)} (the credit line is ${money(c.creditLine)}).` : ''}`)
        + (tapped('runway') ? ` In week ${tapped('runway').week - 1} the money was due to run out before your forecast: ${saw(tapped('runway')).replace('You saw it, and you', 'you')}` : '') },
    { n: 8, key: 'luck', title: 'Luck', value: { ...replay, weeks: undefined, luckier },
      text: `With exactly your decisions, other luck gave week ${wk(replay.median)} typically (${wk(replay.p10)}–${wk(replay.p90)}); you were luckier than ${luckier} of ${replay.draws}. `
        + `With your decisions and other luck, your 80% range held in ${replay.held} of ${replay.draws}; week ${c.deadline} was made in ${replay.onTime}, and the company went bankrupt in ${replay.bankrupt}.` },
  ];
  return facts.map((x, i) => ({ ...x, n: i + 1 }));
}

/** Information checks: before week 1, during play by week, the AI steps, and when the looking stopped. */
export function checkingSummary(p) {
  const weeks = p.history.filter((r) => !r.bankrupt).length;
  const log = p.deskLog.filter((d) => isCheck(d.tab));
  const byWeek = {};
  for (const d of log) byWeek[d.week] = (byWeek[d.week] || 0) + 1;
  const checked = Object.keys(byWeek).map(Number).filter((w) => w >= 1 && w <= weeks);
  const last = checked.length ? Math.max(...checked) : null;
  // Checked out: at least two weeks at the end without a look (deskLog weeks are the week about to be played).
  const stoppedAfter = last !== null && weeks - last >= 2 ? last : null;
  const tabs = p.deskLog.map((d) => d.tab);
  const aiOpened = !!p.desk?.ai || tabs.includes('ai'), aiCopied = !!p.desk?.copied || tabs.includes('ai-copy'), csv = !!p.desk?.csv || tabs.includes('records-csv');
  return {
    before: p.desk ? Math.max(p.desk.checks || 0, p.desk.tabs || 0) : 0, during: log.length, weeksChecked: checked.length, weeks, byWeek,
    lastWeekChecked: last, stoppedAfter, neverDuring: log.length === 0, aiOpened, aiCopied, csv, aiUsed: aiOpened || aiCopied || csv,
  };
}

/**
 * The forecast committed before week 1, judged in plain terms instead of a score: how far
 * off the week was, whether the 80% range held and how wide it was beside the record's,
 * and the week-12 chance against what happened. One game can't score a forecaster; the
 * room's hit rate is the score that means something.
 */
export function forecastVerdict(p) {
  const c = p.cfg || CONFIG, s = p.scores(), f = p.forecast;
  const width = (lo, hi) => hi - lo + 1;
  const off = s.failed ? null : Math.round(s.outcome - f.week);
  const m = p.plan ? matchContracts(p.plan, { cfg: c, code: p.seedInput }) : null;
  const rec = m && !m.crewsDropped ? { low: m.p10, high: m.p90, label: 'the record for plans like yours' } : (() => { const all = pastContracts(c, p.seedInput); return { low: all.p10, high: all.p90, label: 'the record of all 40' }; })();
  return {
    point: { week: f.week, off, text: s.failed ? `week ${f.week}; never delivered` : off === 0 ? `week ${f.week}: exactly right` : `week ${f.week}: off by ${plural(Math.abs(off), 'week')} (${off > 0 ? 'late' : 'early'})` },
    range: { low: f.low, high: f.high, width: width(f.low, f.high), held: s.held, missBy: s.missBy, failed: s.failed,
      text: `${f.low}–${f.high} (${plural(width(f.low, f.high), 'week')} wide): ${s.held ? 'held' : s.failed ? 'missed, never delivered' : `missed by ${plural(Math.abs(s.missBy), 'week')} (${s.missBy > 0 ? 'late' : 'early'})`}` },
    record: { ...rec, width: width(rec.low, rec.high), text: `${rec.label}: ${rec.low}–${rec.high} (${plural(width(rec.low, rec.high), 'week')} wide)` },
    chance: { given: f.onTimeChance, made: s.onTime, text: `you gave week ${c.deadline} ${f.onTimeChance}%; it ${s.onTime ? 'was' : "wasn't"} made` },
  };
}

/** The promise (week 12), kept or broken: what the customer was told, against what happened. */
export function promiseVerdict(p) {
  const c = p.cfg || CONFIG, s = p.scores();
  const kept = s.onTime;
  const text = p.result === 'BANKRUPT' ? `You promised week ${c.deadline}. The company went bankrupt in week ${p.week}: the promise was broken, and never kept.`
    : p.result === 'TERMINATED' ? `You promised week ${c.deadline}. The customer terminated the contract after week ${c.horizon}.`
    : kept ? `You promised week ${c.deadline}, and kept it: accepted in week ${p.finishWeek}.`
    : `You promised week ${c.deadline}. Accepted in week ${p.finishWeek}: ${plural(p.finishWeek - c.deadline, 'week')} late.`;
  return { kept, text };
}

/**
 * The run as a plain text file, for the student to keep (so a replay doesn't lose the first game):
 * the plan, the forecast and how it did, the facts, and the game week by week.
 */
export function resultsText(p, facts, { run = 1, date = new Date() } = {}) {
  const c = p.cfg || CONFIG, s = p.scores(), f = p.forecast, v = forecastVerdict(p);
  const lines = [
    'Best Laid Plans: my results',
    `Scenario code: ${p.seedInput ?? p.seed}   Run: ${run}   Date: ${date.toISOString().slice(0, 10)}`,
    '',
    `Plan: ${p.plan ? describePlan(p.plan) : 'none stated'}`,
    `Forecast committed before week 1: week ${f.week}, 80% range ${f.low}–${f.high}, ${f.onTimeChance}% chance of week ${c.deadline}`,
    `Outcome: ${p.result === 'DELIVERED' ? `accepted in week ${p.finishWeek}` : p.result === 'BANKRUPT' ? `bankrupt in week ${p.week}, never delivered` : `terminated after week ${c.horizon}, never delivered`}`,
    `Your week: ${v.point.text}`,
    `Your 80% range: ${v.range.text}; ${v.record.text}`,
    `Your chance: ${v.chance.text}`,
    `The promise: ${promiseVerdict(p).text}`,
    `How the company did (Delivery): ${s.delivery}`,
    '',
    'Your game in facts:',
    ...facts.map((x) => `${x.n}. ${x.title}. ${x.text}`),
    '',
    'What you checked:',
    ...(() => {
      const k = checkingSummary(p);
      return [`- Before week 1: ${k.before} checks of information sources.`, `- During play: ${plural(k.during, 'check')}, in ${k.weeksChecked} of ${k.weeks} weeks${k.during ? ` (by week: ${Object.entries(k.byWeek).map(([w, n]) => `${w}:${n}`).join(' ')})` : ''}.`,
        `- Stopped checking: ${k.neverDuring ? 'never checked during play' : k.stoppedAfter !== null ? `after week ${k.stoppedAfter}` : 'no, checked to the end'}.`,
        `- AI: opened Ask an AI ${k.aiOpened ? 'yes' : 'no'}; copied the prompt ${k.aiCopied ? 'yes' : 'no'}; downloaded the records CSV ${k.csv ? 'yes' : 'no'}.`];
    })(),
    '',
    'Week by week:',
    'week,crews,inspection_pct,second_shift,units_built,defects_found,units_rejected,scope_added,dashboard_pct,forecast_week,range',
    ...p.history.filter((r) => !r.bankrupt).map((r) => {
      const e = p.forecastLog.find((x) => x.week === r.week);
      return [r.week, r.crews, Math.round(r.inspect * 100), r.shift ? 'yes' : 'no', Math.round(r.built), Math.round(r.found), r.rejected, r.shock, Math.round(r.reported * 100),
        e ? e.forecast : '', e && e.low !== undefined ? `${e.low}-${e.high}` : ''].join(',');
    }),
  ];
  return lines.join('\n');
}
