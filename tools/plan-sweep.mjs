/**
 * Strategy sweep for the game engine (frontend/src/plan/engine.js).
 *   node tools/plan-sweep.mjs            prints the tables and checks the targets
 * Exits non-zero if a target fails, so it can gate a commit.
 *
 * Targets:
 *   1. The dashboard projection (reported pace, planned crew) runs late: the
 *      outcome is later than it in 100% of runs under EVERY strategy.
 *   2. The outside view works: the past contracts' p10-p90 contains the outcome
 *      in >= 70% of runs across strategies.
 *   3. Naive play fails: building flat out with the opening crew is never on time.
 *   4. The game is hard but winnable: the best strategy is on time 40-60%.
 *   5. No dominant recipe: at least three strategies within 6 points of the best
 *      mean delivery score.
 *   6. Inspection matters both ways: some inspection beats none for the same
 *      staffing, and the most inspection is not the best.
 *   7. Reference-class matching works: for each common plan, the p10-p90 of the
 *      past contracts run like what was actually played holds the outcome >= 80%.
 *   8. Matching beats the whole record where the plan is far from typical: for
 *      hands-off and +3 crews with 10% inspection, all 40 hold less often than
 *      the matched contracts.
 *   9-11. The Decision Desk (frontend/src/plan/desk.js): record-based tools hold
 *      >= 80%, inside-view tools <= 10%, and the AI Assistant exactly as often as
 *      the Status Report it is given. Every tool, colleague included, is reported.
 *   12. Bankruptcy (past the credit line) never hits a plan that wins: no strategy
 *      on time >= 40% of the time goes bankrupt in more than 5% of runs.
 */
import { Project, CONFIG, COMMON_PLANS, pastContracts, historyMean, lastContract, matchContracts, planFromProject } from '../frontend/src/plan/engine.js';
import { screenData, allForecasts } from '../frontend/src/plan/desk.js';

const N = Number(process.env.N || 1000);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const pct = (x) => `${(100 * x).toFixed(0)}%`;
const rng = (a, b) => `${a}-${b}`;
// Nearest-rank quantiles, as the engine reports them.
const quantiles = (xs) => { const s = [...xs].sort((a, b) => a - b); return (q) => s[Math.max(0, Math.ceil(q * s.length) - 1)]; };

// Strategies that play one of the engine's COMMON_PLANS name it in `plan`.
const S = {
  'Build flat out (4 crews)':        { hire: 0, insp: 0, plan: 'hands-off' },
  'Inspect 10% only':                { hire: 0, insp: 0.1, plan: 'inspect' },
  'Second shift wks 9-11':           { hire: 0, insp: 0, shiftFrom: 9, shiftTo: 11, plan: 'shift' },
  '+1 crew':                         { hire: 1, insp: 0 },
  '+2 crews':                        { hire: 2, insp: 0, plan: 'crews2' },
  '+3 crews':                        { hire: 3, insp: 0, plan: 'crews3' },
  '+2 crews, inspect 10%':           { hire: 2, insp: 0.1 },
  '+2 crews, inspect 20%':           { hire: 2, insp: 0.2 },
  '+2 crews, inspect 30%':           { hire: 2, insp: 0.3 },
  '+3 crews, inspect 10%':           { hire: 3, insp: 0.1, plan: 'crews3-inspect' },
  '+3 crews, inspect 20%':           { hire: 3, insp: 0.2 },
  '+1 crew, inspect 10%, shift 8-11':{ hire: 1, insp: 0.1, shiftFrom: 8, shiftTo: 11 },
  '+2 crews, shift every week':      { hire: 2, insp: 0, shiftFrom: 1 },
  '+2, inspect 10%, shift wks 9-11': { hire: 2, insp: 0.1, shiftFrom: 9, shiftTo: 11 },
  '+3, inspect 10%, shift wks 10-11':{ hire: 3, insp: 0.1, shiftFrom: 10, shiftTo: 11 },
  'Adaptive':                        'adaptive',
};

function adaptive(p, w) {
  // Inspect early, switch to building once the hidden stock is likely small, add a
  // shift only when the reported finish slips past the deadline.
  const insp = w <= 9 ? 0.1 : 0;
  const cap = p.crews * CONFIG.unitsPerCrew * (1 - insp);
  const wksToReportedDone = p.backlog / Math.max(1, cap);
  const behind = w + wksToReportedDone > CONFIG.deadline - 1;
  return { hire: w === 1 ? 2 : (w === 3 && behind ? 1 : 0), inspect: insp, shift: w >= 9 && w <= 11 && behind };
}

const plannedCrew = (s) => CONFIG.crews + (s === 'adaptive' ? 2 : s.hire);
// The dashboard projection: last contract's reported pace, scaled to the planned crew.
const dashboardWeeks = (s) => CONFIG.scope / ((historyMean() / CONFIG.crews) * plannedCrew(s));
// The inside-view forecast built on it: a week allowed for onboarding, and an
// interval that feels generous.
function insideView(s) {
  const wks = dashboardWeeks(s) + (plannedCrew(s) > CONFIG.crews ? 0.6 : 0);
  return { week: Math.round(wks), low: Math.round(wks) - 1, high: Math.round(wks) + 2 };
}

function run(s, seed) {
  const p = new Project(seed);
  const iv = insideView(s);
  p.commit({ ...iv, onTimeChance: 70 });
  while (!p.done) {
    const w = p.week + 1;
    const d = s === 'adaptive' ? adaptive(p, w) : { hire: w === 1 ? s.hire : 0, inspect: s.insp, shift: w >= (s.shiftFrom ?? 99) && w <= (s.shiftTo ?? 99) };
    p.play(d);
  }
  return p;
}

const past = pastContracts();
console.log(`Reported pace in briefing: ${historyMean()}/wk  →  dashboard projection for 4 crews: ${(CONFIG.scope / historyMean()).toFixed(1)} wks`);
const lc = lastContract();
console.log(`Last contract (4 crews, no inspection): reported pace ${lc.history.join(', ')}; dashboard 100% wk ${lc.dashboardFullWeek}; delivered wk ${lc.deliveredWeek}; ${lc.rejected} units rejected at acceptance`);
console.log(`Past contracts (n=${past.n}): median ${past.median}, p10-p90 ${rng(past.p10, past.p90)}, full range ${rng(past.min, past.max)}, on time ${past.contracts.filter((r) => r.onTime).length} of ${past.n} (${pct(past.onTimeShare)})\n`);

console.log('Past contracts by plan (as matchContracts finds them)');
const ph = 'Plan'.padEnd(28) + 'n'.padStart(3) + 'Median'.padStart(8) + 'p10-p90'.padStart(9) + 'OnTime'.padStart(8) + '  Rule';
console.log(ph); console.log('-'.repeat(ph.length + 28));
const claimed = new Set();
for (const cp of COMMON_PLANS) {
  const m = matchContracts(cp);
  m.contracts.forEach((r) => claimed.add(r.id));
  console.log(cp.label.padEnd(28) + String(m.n).padStart(3) + String(m.median).padStart(8) + rng(m.p10, m.p90).padStart(9) + pct(m.onTimeShare).padStart(8) + '  ' + m.rule);
}
const others = past.contracts.filter((r) => !claimed.has(r.id));
console.log(`${'Other'.padEnd(28)}${String(others.length).padStart(3)}\n`);

console.log('Dash, All40, Match: share of runs whose outcome falls inside that forecast\'s range.');
console.log('DashLate: share of runs whose outcome is later than the dashboard projection.');
const hdr = 'Strategy'.padEnd(34) + 'Deliv'.padStart(6) + 'sd'.padStart(5) + 'OnTime'.padStart(7) + 'Med'.padStart(5) + 'p10-90'.padStart(8)
  + 'Dash'.padStart(6) + 'DashLate'.padStart(9) + 'All40'.padStart(6) + 'Match'.padStart(6) + '90→done'.padStart(8) + 'Spent$M'.padStart(8) + 'Term'.padStart(6) + 'Broke'.padStart(6);
console.log(hdr); console.log('-'.repeat(hdr.length));
const rows = {};
for (const [name, s] of Object.entries(S)) {
  const ps = Array.from({ length: N }, (_, i) => run(s, 20000 + i));
  const sc = ps.map((p) => p.scores());
  const del = sc.map((x) => x.delivery);
  const out = sc.map((x) => x.outcome);
  const iv = insideView(s);
  const dash = dashboardWeeks(s);
  const q = quantiles(out);
  const r = {
    deliv: mean(del), sd: Math.sqrt(mean(del.map((v) => (v - mean(del)) ** 2))),
    onTime: mean(sc.map((x) => (x.onTime ? 1 : 0))),
    med: q(0.5), p10: q(0.1), p90: q(0.9),
    ivHold: mean(out.map((o) => (o >= iv.low && o <= iv.high ? 1 : 0))),
    dashLate: mean(out.map((o) => (o > dash ? 1 : 0))),
    ovHit: mean(out.map((o) => (o >= past.p10 && o <= past.p90 ? 1 : 0))),
    matchHit: mean(ps.map((p, i) => { const m = matchContracts(planFromProject(p)); return out[i] >= m.p10 && out[i] <= m.p90 ? 1 : 0; })),
    ninety: mean(ps.map((p) => (p.ninetyWeek() ? p.outcomeWeek() - p.ninetyWeek() : 0))),
    spent: mean(ps.map((p) => p.spent)) / 1e6,
    term: mean(ps.map((p) => (p.result === 'TERMINATED' ? 1 : 0))),
    broke: mean(ps.map((p) => (p.result === 'BANKRUPT' ? 1 : 0))),
    plan: s.plan,
  };
  rows[name] = r;
  console.log(name.padEnd(34) + r.deliv.toFixed(1).padStart(6) + r.sd.toFixed(1).padStart(5) + pct(r.onTime).padStart(7)
    + String(Math.round(r.med)).padStart(5) + rng(Math.round(r.p10), Math.round(r.p90)).padStart(8) + pct(r.ivHold).padStart(6) + pct(r.dashLate).padStart(9)
    + pct(r.ovHit).padStart(6) + pct(r.matchHit).padStart(6)
    + r.ninety.toFixed(1).padStart(8) + r.spent.toFixed(2).padStart(8) + pct(r.term).padStart(6) + pct(r.broke).padStart(6));
}

const vals = Object.values(rows);
const common = vals.filter((r) => r.plan);
const byPlan = (k) => vals.find((r) => r.plan === k);
const best = Math.max(...vals.map((r) => r.deliv));
const bestOnTime = Math.max(...vals.map((r) => r.onTime));
const ho = byPlan('hands-off'), c3i = byPlan('crews3-inspect');
const checks = [
  ['1. Dashboard projection runs late for every strategy (100% of runs)', Math.min(...vals.map((r) => r.dashLate)) === 1, `min ${pct(Math.min(...vals.map((r) => r.dashLate)))}`],
  ['2. Outside view contains the outcome (>= 70% overall)', mean(vals.map((r) => r.ovHit)) >= 0.7, pct(mean(vals.map((r) => r.ovHit)))],
  ['3. Hands-off is never on time', ho.onTime === 0, `on time ${pct(ho.onTime)}`],
  ['4. Best on-time rate between 40% and 60%', bestOnTime >= 0.4 && bestOnTime <= 0.6, pct(bestOnTime)],
  ['5. No dominant recipe (>= 3 within 6 pts of best)', vals.filter((r) => r.deliv >= best - 6).length >= 3, `${vals.filter((r) => r.deliv >= best - 6).length} within 6 of ${best.toFixed(1)}`],
  ['6. Some inspection beats none; most is not best', Math.max(rows['+2 crews, inspect 10%'].deliv, rows['+2 crews, inspect 20%'].deliv) > Math.max(rows['+2 crews'].deliv, rows['+2 crews, inspect 30%'].deliv),
    `0%: ${rows['+2 crews'].deliv.toFixed(1)}  10%: ${rows['+2 crews, inspect 10%'].deliv.toFixed(1)}  20%: ${rows['+2 crews, inspect 20%'].deliv.toFixed(1)}  30%: ${rows['+2 crews, inspect 30%'].deliv.toFixed(1)}`],
  ['7. Matched p10-p90 holds >= 80% for each common plan', common.length === COMMON_PLANS.length && Math.min(...common.map((r) => r.matchHit)) >= 0.8,
    common.map((r) => `${r.plan} ${pct(r.matchHit)}`).join('  ')],
  ['8. All 40 hold less often than matched (hands-off; +3 crews, 10%)', ho.ovHit < ho.matchHit && c3i.ovHit < c3i.matchHit,
    `hands-off ${pct(ho.ovHit)} < ${pct(ho.matchHit)};  +3/10% ${pct(c3i.ovHit)} < ${pct(c3i.matchHit)}`],
];
// ── The Decision Desk: each tool's 80% range, playing the stated plan ───────────
// The tools read only the screen, which is the same on every code, so each tool's
// forecast is computed once per plan and only the outcome varies.
const SCREEN = screenData();
const PLAYS = { 'hands-off': {}, inspect: { insp: 0.1 }, crews2: { hire: 2 }, crews3: { hire: 3 }, 'crews3-inspect': { hire: 3, insp: 0.1 }, shift: { shiftFrom: 9, shiftTo: 11 } };
const deskHold = {};
const deskBrier = {};
for (const cp of COMMON_PLANS) {
  const pol = PLAYS[cp.key];
  const outs = Array.from({ length: N }, (_, i) => { const p = new Project(70000 + i); while (!p.done) { const w = p.week + 1; p.play({ hire: w === 1 ? pol.hire || 0 : 0, inspect: pol.insp || 0, shift: w >= (pol.shiftFrom ?? 99) && w <= (pol.shiftTo ?? 99) }); } return p; });
  for (const f of allForecasts(SCREEN, cp)) {
    (deskHold[f.name] ||= {})[cp.key] = mean(outs.map((p) => { const o = p.outcomeWeek(); return o >= f.low && o <= f.high ? 1 : 0; }));
    (deskBrier[f.name] ||= []).push(mean(outs.map((p) => (f.chance / 100 - (p.result === 'DELIVERED' && p.outcomeWeek() <= CONFIG.deadline ? 1 : 0)) ** 2)));
  }
}
console.log(`\nDecision Desk: share of each tool's 80% ranges that held, across ${N} codes, playing the stated plan`);
const dh = 'Tool'.padEnd(42) + COMMON_PLANS.map((cp) => cp.key.slice(0, 9).padStart(10)).join('') + 'Mean'.padStart(7) + 'Brier'.padStart(7);
console.log(dh); console.log('-'.repeat(dh.length));
const deskMean = {};
for (const [name, h] of Object.entries(deskHold)) {
  deskMean[name] = mean(Object.values(h));
  console.log(name.padEnd(42) + COMMON_PLANS.map((cp) => pct(h[cp.key]).padStart(10)).join('') + pct(deskMean[name]).padStart(7) + mean(deskBrier[name]).toFixed(2).padStart(7));
}
const RECORD_TOOLS = ['Records, all 40', 'Records, like my plan', 'Analytics'];
const INSIDE_TOOLS = ['Status Report', 'Sprint Burndown', 'Schedule', 'Risk Simulator'];
const winners = vals.filter((r) => r.onTime >= 0.4);
checks.push(
  ['9. Desk: record-based tools hold >= 80%', RECORD_TOOLS.every((k) => deskMean[k] >= 0.8), RECORD_TOOLS.map((k) => `${k} ${pct(deskMean[k])}`).join('  ')],
  ['10. Desk: inside-view tools hold <= 10%', INSIDE_TOOLS.every((k) => deskMean[k] <= 0.1), INSIDE_TOOLS.map((k) => `${k} ${pct(deskMean[k])}`).join('  ')],
  ['11. Desk: the AI Assistant holds exactly as often as the Status Report', JSON.stringify(deskHold['AI Assistant']) === JSON.stringify(deskHold['Status Report']),
    `AI ${pct(deskMean['AI Assistant'])}, Status Report ${pct(deskMean['Status Report'])}`],
  ['12. No plan on time >= 40% goes bankrupt more than 5% of the time', winners.every((r) => r.broke <= 0.05),
    Object.entries(rows).filter(([, r]) => r.onTime >= 0.4).map(([k, r]) => `${k.trim()} ${pct(r.broke)}`).join('  ') + ` · most: ${Object.entries(rows).sort((a, b) => b[1].broke - a[1].broke)[0][0].trim()} ${pct(Math.max(...vals.map((r) => r.broke)))}`],
);

console.log('\n=== TARGETS ===');
let fails = 0;
for (const [label, ok, detail] of checks) { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}\n          ${detail}`); }
console.log(`\n  ${checks.length - fails}/${checks.length} targets met.`);
process.exit(fails ? 1 : 0);
