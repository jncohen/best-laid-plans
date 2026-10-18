// Each scenario code draws its own record. How do the record, Mabel, and the payoff to
// best practice vary across codes? For each code: the record's median, range and on-time
// share; the last contract; Mabel's week; and, over 3 plans x 10 luck draws, how often the
// forecast from "Records, like my plan" scores best (or tied) among the desk's forecasts.
import { Project, CONFIG, forecastScore } from '../frontend/src/plan/engine.js';
import { screenData, FORECASTERS, teamChat } from '../frontend/src/plan/desk.js';
const codes = process.argv[2] ? process.argv[2].split(',') : ['', 'ledger', 'compass', ...Array.from({ length: 30 }, (_, i) => `code${i + 1}`)];
const plans = [{ crews: 3, inspect: 0.1, shift: 'none' }, { crews: 0, inspect: 0, shift: 'none' }, { crews: 2, inspect: 0.1, shift: 'late' }];
const DRAWS = 10;
const tot = { games: 0, wins: 0, sum: {} };
console.log('code      median  p10-p90  on-time  failed  last(100%/acc/rej)  +3/10% match   Mabel  best-practice wins  mean: rec-plan / all40 / pace');
for (const code of codes) {
  const S = screenData(CONFIG, code);
  const all = FORECASTERS['records-all'](S), m = FORECASTERS['records-plan'](S, plans[0]);
  const mabel = teamChat(S, plans[0]).find((c) => c.key === 'veteran').forecast;
  const tools = { rec: (p) => FORECASTERS['records-plan'](S, p), all: (p) => FORECASTERS['records-all'](S, p), pace: (p) => FORECASTERS.status(S, p, null), last5: (p) => FORECASTERS.last5(S, p), sam: (p) => teamChat(S, p).find((c) => c.key === 'planner').forecast };
  let games = 0, wins = 0; const sum = {};
  for (const pl of plans) for (let k = 0; k < DRAWS; k++) {
    const q = new Project(code || 'blank', CONFIG, (Math.imul(k + 3, 2654435761) ^ code.length) >>> 0);
    while (!q.done) { const w = q.week + 1; q.play({ hire: w === 1 ? pl.crews : 0, inspect: pl.inspect, shift: pl.shift === 'every' || (pl.shift === 'late' && w >= 9 && w <= 11) }); }
    const delivered = q.result === 'DELIVERED', o = q.outcomeWeek(), onTime = delivered && q.finishWeek <= CONFIG.deadline;
    const sc = {};
    for (const [n, f] of Object.entries(tools)) { const x = f(pl); sc[n] = delivered ? forecastScore({ week: x.week, low: x.low, high: x.high, onTimeChance: x.chance }, o, onTime) : 0; sum[n] = (sum[n] || 0) + sc[n]; tot.sum[n] = (tot.sum[n] || 0) + sc[n]; }
    games++; if (sc.rec >= Math.max(...Object.values(sc))) wins++;
  }
  tot.games += games; tot.wins += wins;
  const L = S.last;
  console.log(`${(code || '(none)').padEnd(9)} wk ${String(all.week).padEnd(4)} ${`${all.low}-${all.high}`.padEnd(8)} ${String(all.chance + '%').padEnd(8)} ${String(all.failed).padEnd(7)} ${`${L.dashboardFullWeek}/${L.deliveredWeek}/${L.rejected}`.padEnd(19)} wk ${m.week} (${m.low}-${m.high}) n=${String(m.n).padEnd(3)} wk ${String(mabel.week).padEnd(4)} ${String(Math.round(100 * wins / games) + '%').padEnd(18)} ${(sum.rec / games).toFixed(0)} / ${(sum.all / games).toFixed(0)} / ${(sum.pace / games).toFixed(0)}`);
}
console.log(`\nAll codes: "Records, like my plan" scored best or tied in ${Math.round(100 * tot.wins / tot.games)}% of ${tot.games} games. Means: ${Object.entries(tot.sum).map(([k, v]) => `${k} ${(v / tot.games).toFixed(1)}`).join(', ')}`);
