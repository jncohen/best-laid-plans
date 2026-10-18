/**
 * "Your game in 8 facts": the reveal's numbered card, so the instructor can ask the
 * room "hands up if fact 3 happened to you". Every fact is computed from the finished
 * project and the briefing; nothing here changes a score or an outcome.
 */
import { CONFIG, Project, pastContracts, historyMean, dashboardPeak } from './engine.js';
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
  const opened = new Set([...(p.desk?.order || []), ...p.deskLog.map((d) => d.tab)]);
  const log = p.forecastLog;
  // Did the student move the forecast in weeks a+1..a+2, the two weeks after something happened in week a?
  const movedWithin = (a) => log.some((e, i) => i > 0 && e.week > a && e.week <= a + 2 && moved(e, log[i - 1], c));

  // 1. The starting point.
  const paceWeeks = c.scope / historyMean(c), past = pastContracts(c);
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
    const fs = allForecasts(screenData(c), p.plan || { crews: 0, inspect: 0, shift: 'none' });
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

  return [
    { n: 1, key: 'start', title: 'Your starting point', value: { week: f.week, near: start },
      text: `You committed week ${f.week}: ${start.join(' and ')}.` },
    { n: 2, key: 'record', title: 'The record', value: { records: opened.has('records'), last5: opened.has('last5') },
      text: `You opened Records: ${opened.has('records') ? 'yes' : 'no'}. You opened Last 5 Contracts: ${opened.has('last5') ? 'yes' : 'no'}.` },
    { n: 3, key: 'ninety', title: 'The 90% moment', value: { week: ninety ? ninety.week : null, peak: ninety ? dashboardPeak(ninety) : null, rejected, afterReject },
      text: (ninety
        ? `Your dashboard passed 90% in week ${ninety.week} (it read ${Math.round(dashboardPeak(ninety) * 100)}%); ${rejected > 0 ? `the customer then rejected ${plural(rejected, 'unit')}.` : 'the customer rejected no units.'}`
        : `Your dashboard never passed 90%${rejected > 0 ? `; the customer rejected ${plural(rejected, 'unit')}.` : '.'}`)
        + (firstReject ? ` You changed your forecast within 2 weeks of the rejection: ${afterReject ? 'yes' : 'no'}.` : '') },
    { n: 4, key: 'surprise', title: 'The surprise', value: shock ? { units: shock.shock, week: shock.week, spread, changedWithin } : null,
      text: shock
        ? `The customer added ${shock.shock} units in week ${shock.week} (past contracts: +${spread[0]} to +${spread[1]}). You changed your forecast within 2 weeks: ${changedWithin ? 'yes' : 'no'}.`
        : 'The contract ended before the customer added any units.' },
    { n: 5, key: 'advice', title: 'Advice', value: { committed, edited: !!p.desk?.edited, midGame, closest: closest ? closest.key : null },
      text: committedText + midText },
    { n: 6, key: 'range', title: 'Your range', value: { held: s.held, missBy: s.missBy, failed: s.failed },
      text: s.failed
        ? `Your 80% range (weeks ${f.low}–${f.high}): missed. The contract was never delivered.`
        : `Your 80% range (weeks ${f.low}–${f.high}): ${s.held ? 'held' : `missed by ${plural(Math.abs(s.missBy), 'week')} (${s.missBy > 0 ? 'late' : 'early'})`}.` },
    { n: 7, key: 'money', title: 'Money', value: { bankruptWeek: broke ? broke.week : null, shortfall: broke ? broke.shortfall : null, over },
      text: broke
        ? `Bankrupt: yes, in week ${broke.week}. Its payroll (${money(broke.payroll)}) would have gone ${money(broke.shortfall)} past the ${money(c.creditLine)} credit line.`
        : `Bankrupt: no.${over > 0 ? ` Over budget by ${money(over)} (the credit line is ${money(c.creditLine)}).` : ''}` },
    { n: 8, key: 'luck', title: 'Luck', value: { ...replay, weeks: undefined, luckier },
      text: `With exactly your decisions, other luck gave week ${wk(replay.median)} typically (${wk(replay.p10)}–${wk(replay.p90)}); you were luckier than ${luckier} of ${replay.draws}. `
        + `Week ${c.deadline} was made in ${replay.onTime} of ${replay.draws}, bankruptcy in ${replay.bankrupt}, and your range held in ${replay.held}.` },
  ];
}
