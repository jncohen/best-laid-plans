/**
 * "Your game in 8 facts": the reveal's numbered card, so the instructor can ask the
 * room "hands up if fact 3 happened to you". Every fact is computed from the finished
 * project and the briefing; nothing here changes a score or an outcome.
 */
import { CONFIG, Project, pastContracts, historyMean } from './engine.js';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const money = (n) => (n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n / 1000)}k`);

/** Draws for the luck replay: fixed, so the same game always gives the same counts. */
export const REPLAY_DRAWS = 100;
const replayLuck = (k) => (Math.imul(k + 1, 2654435761) ^ 0x5bd1e995) >>> 0;

/**
 * The student's own decisions, week by week, replayed under other personal luck in the
 * same shared world (the code's contract, scope change and draws). Weeks past the end of
 * the student's game keep their last inspection and shift, and add no crews.
 */
export function luckReplay(p, draws = REPLAY_DRAWS) {
  const ds = p.decisions || [];
  const last = ds.length ? ds[ds.length - 1] : { hire: 0, shift: false, inspect: 0 };
  let onTime = 0, bankrupt = 0;
  for (let k = 0; k < draws; k++) {
    const q = new Project(p.seedInput ?? p.seed, p.cfg, replayLuck(k));
    let w = 0;
    while (!q.done) { q.play(ds[w] || { hire: 0, shift: last.shift, inspect: last.inspect }); w++; }
    if (q.result === 'DELIVERED' && q.finishWeek <= p.cfg.deadline) onTime++;
    if (q.result === 'BANKRUPT') bankrupt++;
  }
  return { draws, onTime, bankrupt };
}

/** The eight facts, each { n, title, text, key, value } with a machine-readable `value` for tests. */
export function gameFacts(p, { replay = luckReplay(p) } = {}) {
  const c = p.cfg || CONFIG;
  const f = p.forecast;
  const s = p.scores();
  const rows = p.history.filter((r) => !r.bankrupt);
  const opened = new Set([...(p.desk?.order || []), ...p.deskLog.map((d) => d.tab)]);

  // 1. The starting point.
  const paceWeeks = c.scope / historyMean(c), median = pastContracts(c).median;
  const near = [
    Math.abs(f.week - paceWeeks) <= 1 && 'close to the line\'s pace',
    Math.abs(f.week - median) <= 1 && 'close to the past contracts\' median',
    f.week === c.deadline && 'at the deadline',
  ].filter(Boolean);
  const start = near.length ? near : ['your own number'];

  // 3. The 90% moment and the rejections after it.
  const ninety = rows.find((r) => r.reported >= 0.9);
  const rejected = rows.reduce((a, r) => a + r.rejected, 0);

  // 4. The surprise: the scope change, and whether the student moved the forecast after it.
  const shock = rows.find((r) => r.shock > 0);
  const log = p.forecastLog;
  // Only the student's own moves count: the play screen marks them (touched), and without that mark a
  // change counts only beyond what the calendar forced (a week that had passed moved up to the current one).
  const moved = (e, prev) => {
    if (e.touched !== undefined) return !!e.touched;
    if (e.carried) return false;
    const up = (v) => Math.max(v, e.week);
    return e.forecast !== up(prev.forecast) || (e.low ?? e.forecast) !== up(prev.low ?? prev.forecast) || (e.high ?? e.forecast) !== up(prev.high ?? prev.forecast)
      || (e.chance !== undefined && prev.chance !== undefined && e.chance !== prev.chance && !(e.week > c.deadline && e.chance === 0));
  };
  const changedAfter = shock ? log.some((e, i) => i > 0 && e.week > shock.week && moved(e, log[i - 1])) : null;

  // 5. Whose numbers were committed.
  const source = p.desk?.source || '';

  // 7. Money.
  const over = Math.max(0, p.spent - c.budget);

  return [
    { n: 1, key: 'start', title: 'Your starting point', value: { week: f.week, near: start },
      text: `You committed week ${f.week}: ${start.join(' and ')}.` },
    { n: 2, key: 'record', title: 'The record', value: { records: opened.has('records'), last5: opened.has('last5') },
      text: `You opened Records: ${opened.has('records') ? 'yes' : 'no'}. You opened Last 5 Contracts: ${opened.has('last5') ? 'yes' : 'no'}.` },
    { n: 3, key: 'ninety', title: 'The 90% moment', value: { week: ninety ? ninety.week : null, rejected },
      text: ninety
        ? `Your dashboard passed 90% in week ${ninety.week}; ${rejected > 0 ? `the customer then rejected ${plural(rejected, 'unit')}.` : 'the customer rejected no units.'}`
        : `Your dashboard never passed 90%${rejected > 0 ? `; the customer rejected ${plural(rejected, 'unit')}.` : '.'}` },
    { n: 4, key: 'surprise', title: 'The surprise', value: shock ? { units: shock.shock, week: shock.week, changedAfter } : null,
      text: shock
        ? `The customer added ${shock.shock} units in week ${shock.week}. You changed your forecast afterwards: ${changedAfter ? 'yes' : 'no'}.`
        : 'The contract ended before the customer added any units.' },
    { n: 5, key: 'advice', title: 'Advice', value: { source, edited: !!p.desk?.edited },
      text: source ? `You used ${/'s$/.test(source) ? source : `the ${source}`} numbers${p.desk?.edited ? ', then changed them' : ''}.` : 'You used your own numbers.' },
    { n: 6, key: 'range', title: 'Your range', value: { held: s.held, missBy: s.missBy },
      text: `Your 80% range (weeks ${f.low}–${f.high}): ${s.held ? 'held' : `missed by ${plural(Math.abs(s.missBy), 'week')} (${s.missBy > 0 ? 'late' : 'early'})`}${p.result === 'DELIVERED' ? '' : ', against the week it would have taken'}.` },
    { n: 7, key: 'money', title: 'Money', value: { bankruptWeek: p.result === 'BANKRUPT' ? p.week : null, over },
      text: `Bankrupt: ${p.result === 'BANKRUPT' ? `yes, in week ${p.week}` : 'no'}.${over > 0 ? ` Over budget by ${money(over)}.` : ''}` },
    { n: 8, key: 'luck', title: 'Luck', value: replay,
      text: `With exactly your decisions, other luck would have made week ${c.deadline} in ${replay.onTime} of ${replay.draws} games, and gone bankrupt in ${replay.bankrupt}.` },
  ];
}
