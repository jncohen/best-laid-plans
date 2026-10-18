// Is the game rigged? Four checks, across many scenario codes, luck draws and plans.
//
//   node tools/fairness-audit.mjs [codes=40] [draws=10]
//
// 1. Nothing the student says or looks at changes an outcome: two games with the same code,
//    luck and decisions, one committing wild forecasts, moving them every week, opening every
//    tab, copying the AI prompt and tapping every Keep/Change card, the other doing none of
//    it, must play out identically, unit for unit.
// 2. The world on a code is shared and fixed before play: the scope change and the line's
//    traits are the same whatever anyone plans.
// 3. The record is honest about this contract: for each plan, the range the record gives
//    for contracts run like it (10th to 90th percentile of the delivered) should contain
//    the outcome about 8 times in 10, and its median should not lean early or late.
// 4. The briefing's pace is what the last contract's dashboard actually showed.
import { Project, CONFIG, matchContracts, lastContract, normalizePlan } from '../frontend/src/plan/engine.js';

const CODES = +(process.argv[2] || 40), DRAWS = +(process.argv[3] || 10);
const codes = ['ledger', 'compass', ...Array.from({ length: CODES - 2 }, (_, i) => `audit${i + 1}`)];
const luck = (c, d) => (Math.imul(d + 11, 2654435761) ^ (c * 7919)) >>> 0;
const PLANS = [
  { crews: 0, inspect: 0, shift: 'none' }, { crews: 1, inspect: 0, shift: 'none' }, { crews: 2, inspect: 0.1, shift: 'none' },
  { crews: 3, inspect: 0.1, shift: 'none' }, { crews: 3, inspect: 0, shift: 'none' }, { crews: 0, inspect: 0.2, shift: 'none' },
  { crews: 2, inspect: 0, shift: 'late' }, { crews: 3, inspect: 0.1, shift: 'late' },
];
const decide = (pl, w) => ({ hire: w === 1 ? pl.crews : 0, inspect: pl.inspect, shift: pl.shift === 'every' || (pl.shift === 'late' && w >= 9 && w <= 11) });
const label = (p) => `+${p.crews} crews, ${p.inspect * 100}% inspection${p.shift === 'none' ? '' : `, ${p.shift} shift`}`;
let ok = true;
const report = (name, pass, detail) => { if (!pass) ok = false; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };

// 1. Saying and looking change nothing.
let games = 0, diffs = 0;
for (const [ci, code] of codes.entries()) for (const pl of PLANS) for (let d = 0; d < 3; d++) {
  const quiet = new Project(code, CONFIG, luck(ci, d)), loud = new Project(code, CONFIG, luck(ci, d));
  quiet.commit({ week: 14, low: 13, high: 16, onTimeChance: 30, plan: pl });
  loud.commit({ week: 8, low: 6, high: 22, onTimeChance: 100, plan: { crews: 0, inspect: 0.3, shift: 'every' }, desk: { tool: 'j', source: 'Records', tabs: 9, checks: 40, ai: true, copied: true, csv: true, order: ['records', 'ai'] } });
  while (!quiet.done) {
    const w = quiet.week + 1;
    for (const tab of ['status', 'controls', 'whatif', 'chat', 'ai', 'ai-copy', 'last5', 'records', 'records-csv', 'use:records']) loud.noteDesk(w, tab);
    for (const e of ['scope', 'ninety', 'reject', 'runway']) loud.noteCheckpoint(w, e, w % 2 ? 'change' : 'keep');
    quiet.play(decide(pl, w));
    loud.play({ ...decide(pl, w), forecast: 8 + (w % 14), range: { low: 6, high: 22, chance: (w * 37) % 100, touched: true } });
  }
  games++;
  if (JSON.stringify(quiet.history) !== JSON.stringify(loud.history) || quiet.result !== loud.result || quiet.finishWeek !== loud.finishWeek) diffs++;
}
report('1. Forecasts, tabs, AI use and Keep/Change taps never change an outcome', diffs === 0, `${games} paired games, ${diffs} differed`);

// 2. The world on a code is shared.
let worldDiffs = 0;
for (const code of codes) {
  const a = new Project(code), b = new Project(code, CONFIG, 12345);
  playPlan(a, PLANS[0]); playPlan(b, PLANS[3]);
  for (const k of ['shockWeek', 'shockSize', 'productivity', 'defectProne']) if (a[k] !== b[k]) worldDiffs++;
}
function playPlan(p, pl) { while (!p.done) p.play(decide(pl, p.week + 1)); }
report('2. The scope change and the line are the same for every player on a code', worldDiffs === 0, `${codes.length} codes`);

// 3. The record is honest about this contract.
console.log('\n3. The record against what happened (each plan played on every code, under several luck draws):');
console.log('   plan                                  games  record range held  outcome vs record median (weeks)');
let allHeld = 0, allN = 0, biasSum = 0;
for (const pl of PLANS) {
  let held = 0, n = 0, bias = 0;
  for (const [ci, code] of codes.entries()) {
    const m = matchContracts(normalizePlan(pl), { code });
    for (let d = 0; d < DRAWS; d++) {
      const p = new Project(code, CONFIG, luck(ci, d + 100));
      playPlan(p, pl);
      n++;
      if (p.result === 'DELIVERED' && p.finishWeek >= m.p10 && p.finishWeek <= m.p90) held++;
      bias += p.outcomeWeek() - m.median;
    }
  }
  allHeld += held; allN += n; biasSum += bias;
  console.log(`   ${label(pl).padEnd(38)} ${String(n).padStart(5)}  ${String(Math.round(100 * held / n) + '%').padStart(17)}  ${(bias / n >= 0 ? '+' : '') + (bias / n).toFixed(1)}`);
}
const rate = allHeld / allN, lean = biasSum / allN;
report('3a. The record for plans like yours holds about 8 times in 10 overall (70–90%)', rate >= 0.7 && rate <= 0.9, `${Math.round(100 * rate)}% of ${allN} games`);
report('3b. The record does not lean early or late on average (within ±1 week)', Math.abs(lean) <= 1, `${lean >= 0 ? '+' : ''}${lean.toFixed(2)} weeks`);

// 4. The pace is real.
let paceDiffs = 0;
for (const code of codes) {
  const L = lastContract(CONFIG, code), q = new Project(`${code}|last-contract`);
  while (!q.done) q.play({});
  if (JSON.stringify(L.history) !== JSON.stringify(q.history.slice(0, CONFIG.historyWeeks).map((h) => h.built))) paceDiffs++;
}
report("4. The briefing's six weeks are the last contract's own dashboard, played by the same engine", paceDiffs === 0, `${codes.length} codes`);

console.log(ok ? '\nNo sign of rigging.' : '\nSee the failures above.');
process.exit(ok ? 0 : 1);
