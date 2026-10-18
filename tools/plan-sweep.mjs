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
 *   3. Naive play fails: building flat out with the opening crew is almost never on time
 *      (<= 1% of runs). Not "never": contracts differ, and a contract drawn both fast and
 *      clean can make week 12 hands-off. Narrowing the draws to rule it out would blunt
 *      the week-by-week evidence of how this contract differs.
 *   4. Set-and-forget loses: the screen-only adaptive reference is on time at least as
 *      often as the best static plan, and every static plan on time >= 30% goes bankrupt
 *      >= 20% of the time while the adaptive reference stays <= 5%.
 *   5. No dominant recipe: at least three strategies within 6 points of the best
 *      mean delivery score.
 *   6. Inspection matters both ways: some inspection beats none for the same
 *      staffing, and the most inspection is not the best.
 *   7. Reference-class matching works, judged the way a student reads it: "contracts run
 *      like yours: delivered weeks a-b; k of n never delivered". For each common plan,
 *      (a) the matched delivered range holds the outcome in >= 80% of the runs that
 *      deliver (inspection-only >= 70%: its match pools any crews with inspection), and
 *      (b) k of n is consistent with how often the plan actually fails (two-sided
 *      binomial test, p >= 0.05).
 *   8. Matching is as reliable as the whole record and sharper where the plan is far
 *      from typical: for hands-off and +3 crews with 10% inspection, the matched
 *      delivered range holds within 3 points as often as all 40's, and is narrower.
 *   9-11. The Decision Desk (frontend/src/plan/desk.js), as it stands before week 1:
 *      the tools that use the record (Records, Analytics, Mabel) hold >= 80%; the plan and
 *      the pace on paper (Status Report, Schedule, Cost Management, Sam, the
 *      Risk Simulator with rework off) hold <= 10%; the Risk Simulator with its
 *      historical rework on holds >= 80%. Every tool and colleague is reported, with
 *      the share of the desk that is calibrated (holds >= 75%). Ask an AI gives no
 *      forecast of its own (it builds a prompt), so it is not swept.
 *   12. Bankruptcy (past the credit line) never hits a plan that wins: no strategy
 *      on time >= 40% of the time goes bankrupt in more than 5% of runs.
 */
import { Project, CONFIG, seedFromString, COMMON_PLANS, pastContracts, historyMean, lastContract, matchContracts, planFromProject, playedPlan } from '../frontend/src/plan/engine.js';
import { screenData, liveScreen, allForecasts, statusReport, records } from '../frontend/src/plan/desk.js';
import { adaptive as adaptivePolicy, screenForecast } from './adaptive-policy.mjs';
// SWEEP_CFG='{"budget":4600000,...}' tries candidate CONFIG values (exploration only; the game uses CONFIG as committed).
if (process.env.SWEEP_CFG) Object.assign(CONFIG, JSON.parse(process.env.SWEEP_CFG));

const N = Number(process.env.N || 1000);
// Every run plays with a student's own luck draw, as the game does (NOLUCK=1 plays the shared world alone).
const luckOf = (seed) => (process.env.NOLUCK ? null : seedFromString(`luck-${seed}`));
const play = (seed) => new Project(seed, CONFIG, luckOf(seed));
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
  const p = play(seed);
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
    // Among the runs that deliver: does the matched (and the all-40) delivered range hold?
    condMatch: mean(ps.filter((p) => p.result === 'DELIVERED').map((p) => { const m = matchContracts(planFromProject(p)); return +(p.finishWeek >= m.p10 && p.finishWeek <= m.p90); })),
    condAll: mean(ps.filter((p) => p.result === 'DELIVERED').map((p) => +(p.finishWeek >= past.p10 && p.finishWeek <= past.p90))),
    failRate: mean(ps.map((p) => +(p.result !== 'DELIVERED'))),
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
const ho = byPlan('hands-off'), c3i = byPlan('crews3-inspect');
const matchOf = (k) => matchContracts(COMMON_PLANS.find((cp) => cp.key === k));
const width = (s) => s.p90 - s.p10;
// Two-sided exact binomial test: the chance of a count at least as unlikely as k of n, at rate r.
const choose = (n, k) => { let c = 1; for (let i = 1; i <= k; i++) c = (c * (n - i + 1)) / i; return c; };
const binomP = (k, n, r) => { const pk = (j) => choose(n, j) * r ** j * (1 - r) ** (n - j); const at = pk(k); let s = 0; for (let j = 0; j <= n; j++) if (pk(j) <= at * (1 + 1e-9)) s += pk(j); return Math.min(1, s); };
const failFit = (r) => { const m = matchContracts(COMMON_PLANS.find((cp) => cp.key === r.plan)); return { k: m.failed.total, n: m.n, p: binomP(m.failed.total, m.n, Math.min(0.999, Math.max(0.001, r.failRate))) }; };
// The screen-only adaptive reference (tools/adaptive-policy.mjs), on the same codes as the strategies.
const ADAPT = (() => {
  const ps = Array.from({ length: N }, (_, i) => { const p = play(20000 + i); p.commit({ week: 13, low: 11, high: 15, onTimeChance: 40 }); while (!p.done) p.play(adaptivePolicy(p, p.week + 1)); return p; });
  const sc = ps.map((p) => p.scores());
  return { onTime: mean(sc.map((x) => +x.onTime)), deliv: mean(sc.map((x) => x.delivery)), broke: mean(ps.map((p) => +(p.result === 'BANKRUPT'))), spent: mean(ps.map((p) => p.spent)) / 1e6 };
})();
const statics = Object.entries(rows).filter(([k]) => k !== 'Adaptive');
const [bestStaticName, bestStaticRow] = statics.sort((a, b) => b[1].onTime - a[1].onTime)[0];
const bestStaticOnTime = bestStaticRow.onTime;
console.log(`
Adaptive reference (screen-only, tools/adaptive-policy.mjs): on time ${pct(ADAPT.onTime)}, delivery ${ADAPT.deliv.toFixed(1)}, bankrupt ${pct(ADAPT.broke)}, spent $${ADAPT.spent.toFixed(2)}M`);
const checks = [
  ['1. Dashboard projection runs late for every strategy (100% of runs)', Math.min(...vals.map((r) => r.dashLate)) === 1, `min ${pct(Math.min(...vals.map((r) => r.dashLate)))}`],
  ['2. Outside view contains the outcome (>= 70% overall)', mean(vals.map((r) => r.ovHit)) >= 0.7, pct(mean(vals.map((r) => r.ovHit)))],
  ['3. Hands-off is almost never on time (<= 1%)', ho.onTime <= 0.01, `on time ${(100 * ho.onTime).toFixed(1)}%`],
  // 4. Set-and-forget loses (Joe, Oct 17, option a): adaptation keeps up on time and stays solvent; every static plan that wins often goes broke often.
  ['4a. The adaptive reference is on time at least as often as the best static plan', ADAPT.onTime >= bestStaticOnTime, `adaptive ${pct(ADAPT.onTime)}, best static ${pct(bestStaticOnTime)} (${bestStaticName})`],
  ['4b. Every static plan on time >= 30% goes bankrupt >= 20%; adaptive <= 5%', statics.filter(([, r]) => r.onTime >= 0.3).every(([, r]) => r.broke >= 0.2) && ADAPT.broke <= 0.05,
    statics.filter(([, r]) => r.onTime >= 0.3).map(([k, r]) => `${k.trim()} ${pct(r.onTime)} on time, ${pct(r.broke)} bankrupt`).join('; ') + ` · adaptive ${pct(ADAPT.broke)} bankrupt`],
  ['5. No dominant recipe (>= 3 within 6 pts of best)', vals.filter((r) => r.deliv >= best - 6).length >= 3, `${vals.filter((r) => r.deliv >= best - 6).length} within 6 of ${best.toFixed(1)}`],
  ['6. Some inspection beats none; most is not best', Math.max(rows['+2 crews, inspect 10%'].deliv, rows['+2 crews, inspect 20%'].deliv) > Math.max(rows['+2 crews'].deliv, rows['+2 crews, inspect 30%'].deliv),
    `0%: ${rows['+2 crews'].deliv.toFixed(1)}  10%: ${rows['+2 crews, inspect 10%'].deliv.toFixed(1)}  20%: ${rows['+2 crews, inspect 20%'].deliv.toFixed(1)}  30%: ${rows['+2 crews, inspect 30%'].deliv.toFixed(1)}`],
  // Inspection-only is held to 70%, not 80% (Joe, Oct 17): with record #40 the line's hands-off last contract,
  // its match widens to any crews with inspection, pooling differently staffed contracts.
  // Judged as a student reads it (Joe, Oct 17): the delivered range for the runs that deliver, and the failure count.
  ['7. Matched delivered range holds >= 80% of delivered runs (inspection-only >= 70%); its failure count fits (p >= 0.05)', common.length === COMMON_PLANS.length
    && common.every((r) => r.condMatch >= (r.plan === 'inspect' ? 0.7 : 0.8) && failFit(r).p >= 0.05),
    common.map((r) => { const f = failFit(r); return `${r.plan} ${pct(r.condMatch)}, ${f.k} of ${f.n} failed vs ${pct(r.failRate)} (p ${f.p.toFixed(2)})`; }).join(';  ')],
  ['8. Matched delivered range holds within 3 points of all 40, and is narrower (hands-off; +3 crews, 10%)',
    [[ho, 'hands-off'], [c3i, 'crews3-inspect']].every(([r, k]) => r.condMatch >= r.condAll - 0.03 && width(matchOf(k)) < width(past)),
    [[ho, 'hands-off'], [c3i, 'crews3-inspect']].map(([r, k]) => `${k} matched ${pct(r.condMatch)} (${matchOf(k).p10}-${matchOf(k).p90}) vs all 40 ${pct(r.condAll)} (${past.p10}-${past.p90})`).join(';  ')],
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
  const outs = Array.from({ length: N }, (_, i) => { const p = play(70000 + i); while (!p.done) { const w = p.week + 1; p.play({ hire: w === 1 ? pol.hire || 0 : 0, inspect: pol.insp || 0, shift: w >= (pol.shiftFrom ?? 99) && w <= (pol.shiftTo ?? 99) }); } return p; });
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
const RECORD_TOOLS = ['Records, all 40', 'Records, like my plan', 'Analytics', 'Team Chat: Mabel, veteran on the line'];
const INSIDE_TOOLS = ['Status Report', 'Schedule', 'Cost Management', 'Risk Simulator (rework off)', 'Team Chat: Sam, planner'];
const deskNames = Object.keys(deskMean).filter((k) => k !== 'Risk Simulator (rework off)');
const calibrated = deskNames.filter((k) => deskMean[k] >= 0.75);
console.log(`
Calibrated (holds >= 75%): ${calibrated.length} of ${deskNames.length} desk forecasts (simulator counted as shipped, rework on): ${calibrated.join(', ')}`);
const winners = vals.filter((r) => r.onTime >= 0.4);
checks.push(
  ['9. Desk: tools that use the record hold >= 80%', RECORD_TOOLS.every((k) => deskMean[k] >= 0.8), RECORD_TOOLS.map((k) => `${k} ${pct(deskMean[k])}`).join('  ')],
  ['10. Desk: the pace and the plan on paper hold <= 10%', INSIDE_TOOLS.every((k) => deskMean[k] <= 0.1), INSIDE_TOOLS.map((k) => `${k} ${pct(deskMean[k])}`).join('  ')],
  ['11. Desk: the Risk Simulator with historical rework holds >= 80%', deskMean['Risk Simulator (with rework)'] >= 0.8,
    `with rework ${pct(deskMean['Risk Simulator (with rework)'])}, off ${pct(deskMean['Risk Simulator (rework off)'])}`],
  ['12. No plan on time >= 40% goes bankrupt more than 5% of the time', winners.every((r) => r.broke <= 0.05),
    Object.entries(rows).filter(([, r]) => r.onTime >= 0.4).map(([k, r]) => `${k.trim()} ${pct(r.broke)}`).join('  ') + ` · most: ${Object.entries(rows).sort((a, b) => b[1].broke - a[1].broke)[0][0].trim()} ${pct(Math.max(...vals.map((r) => r.broke)))}`],
);

// ── Balance: scripted student types, played through the engine (targets 13-16) ──
// Each states +3 crews / 10% inspection. The coasting types play that plan unchanged and never move their forecast.
const STUDENT_N = Number(process.env.STUDENT_N || Math.min(N, 400));
const PLAN = { crews: 3, inspect: 0.1, shift: 'none' };
const ALL_TOOLS = ['status', 'cost', 'schedule', 'chat', 'last5', 'records', 'scenarios', 'analytics', 'simulator'];
const asForecast = (f) => ({ week: f.week, low: f.low, high: f.high, onTimeChance: f.chance });
// Every tab is open, but a coaster opens only a few before asking the AI: 2 to 6 of them, varying by code.
const pickTabs = (i) => { const r = ((i * 2654435761) >>> 0) / 4294967296; const n = 2 + Math.floor(r * 5); const s = [...ALL_TOOLS].sort((a, b) => ((a.charCodeAt(0) * 31 + i) % 7) - ((b.charCodeAt(0) * 31 + i) % 7) || a.localeCompare(b)); return s.slice(0, n); };
function playStudent(type, seed, i) {
  const p = play(seed);
  const opened = type === 'ai-coast' ? pickTabs(i) : type === 'anchor' ? ['status'] : ['records', 'last5', 'status'];
  const f0 = type === 'anchor' ? statusReport(SCREEN).forecast
    : type === 'ai-coast' ? (opened.includes('records') || opened.includes('last5') ? records(SCREEN, PLAN).matched : statusReport(SCREEN).forecast)
      : records(SCREEN, PLAN).matched;
  p.commit({ ...asForecast(f0), plan: PLAN, desk: { tool: '', tabs: opened.length, minutes: 5, edited: false, order: opened } });
  let f = { week: f0.week, low: f0.low, high: f0.high, chance: f0.chance };
  while (!p.done) {
    const w = p.week + 1;
    if (type === 'adaptive') {
      // Two tabs a week (Records and the Status Report). The forecast is the careful reading of
      // that screen (tools/adaptive-policy.mjs screenForecast): this contract's rate, its sampled
      // defect rate and hidden defects, played forward through the acceptance test.
      p.noteDesk(w, 'records'); p.noteDesk(w, 'status');
      const d = adaptivePolicy(p, w), L = liveScreen(p);
      if (L) f = screenForecast(SCREEN, L, d);
      p.play({ ...d, forecast: Math.max(w, f.week), range: { low: Math.max(w, f.low), high: Math.max(w, f.high), chance: w > CONFIG.deadline ? 0 : f.chance, touched: true } });
    } else {
      p.play({ hire: w === 1 ? 3 : 0, inspect: 0.1, forecast: Math.max(w, f.week), range: { low: Math.max(w, f.low), high: Math.max(w, f.high), chance: f.chance, carried: f.week < w } });
    }
  }
  return p;
}
const STUDENTS = { anchor: 'Anchor (pace, plays the plan)', 'record-coast': 'Record and coast', 'ai-coast': 'AI and coast (2-6 tabs)', adaptive: 'Adaptive (2 tabs a week)' };
const studentRows = {};
for (const type of Object.keys(STUDENTS)) {
  const ps = Array.from({ length: STUDENT_N }, (_, i) => playStudent(type, 50000 + i, i));
  const sc = ps.map((p) => p.scores());
  const heldFrom = (p, w0) => { const o = p.outcomeWeek(), es = p.forecastLog.filter((e) => e.week >= w0); return es.length ? mean(es.map((e) => +(o >= (e.low ?? e.forecast) && o <= (e.high ?? e.forecast)))) : null; };
  const weeklyHeld = mean(ps.map((p) => heldFrom(p, 0)));
  // From week 2 on, after the first update.
  const heldWeek2 = mean(ps.map((p) => heldFrom(p, 2)).filter((x) => x !== null));
  studentRows[type] = { forecast: mean(sc.map((x) => x.forecast)), updating: mean(sc.map((x) => x.updating)), delivery: mean(sc.map((x) => x.delivery)),
    held: mean(sc.map((x) => +x.held)), weeklyHeld, heldWeek2, onTime: mean(sc.map((x) => +x.onTime)), broke: mean(ps.map((p) => +(p.result === 'BANKRUPT'))) };
}
console.log(`\nStudent types (${STUDENT_N} codes): Forecast = week-1 score, Updating = weekly forecasts, Delivery counts bankruptcy as 0`);
console.log('Type'.padEnd(30) + 'Forecast'.padStart(9) + 'Updating'.padStart(9) + 'Delivery'.padStart(9) + 'Held'.padStart(6) + 'Wk held'.padStart(8) + 'OnTime'.padStart(7) + 'Broke'.padStart(6));
for (const [k, r] of Object.entries(studentRows)) console.log(STUDENTS[k].padEnd(30) + r.forecast.toFixed(1).padStart(9) + r.updating.toFixed(1).padStart(9) + r.delivery.toFixed(1).padStart(9) + pct(r.held).padStart(6) + pct(r.weeklyHeld).padStart(8) + pct(r.onTime).padStart(7) + pct(r.broke).padStart(6));
const A = studentRows.adaptive, RC = studentRows['record-coast'], AC = studentRows['ai-coast'];
const bestOn = (m) => Object.entries(studentRows).sort((a, b) => b[1][m] - a[1][m])[0][0];
checks.push(
  ['13. Updating pays: adaptive beats record-and-coast by >= 8 points (0-100 scale); AI-and-coast is below both', A.updating >= RC.updating + 8 && AC.updating < Math.min(A.updating, RC.updating),
    `adaptive ${A.updating.toFixed(1)}, record-coast ${RC.updating.toFixed(1)}, AI-coast ${AC.updating.toFixed(1)}`],
  ['14. Adaptive beats both coasting types on Delivery (bankruptcy counts 0)', A.delivery > RC.delivery && A.delivery > AC.delivery,
    `adaptive ${A.delivery.toFixed(1)}, record-coast ${RC.delivery.toFixed(1)}, AI-coast ${AC.delivery.toFixed(1)}`],
  ['15. Neither coasting type is best on both Updating and Delivery', !['record-coast', 'ai-coast'].some((k) => bestOn('updating') === k && bestOn('delivery') === k),
    `best Updating: ${STUDENTS[bestOn('updating')]}; best Delivery: ${STUDENTS[bestOn('delivery')]}`],
  ['16. A careful player is calibrated reading two tabs a week (adaptive weekly ranges hold >= 70%)', A.weeklyHeld >= 0.7, `adaptive weekly ranges held ${pct(A.weeklyHeld)} (from week 2: ${pct(A.heldWeek2)}); week-1 range held ${pct(A.held)}`],
);

// ── Luck: one code (ledger), many students, each with their own luck (targets 17-19) ──
// Judge the decision, not the outcome: on one code, good plans sometimes fail and reckless ones sometimes win.
const LUCK_N = Number(process.env.LUCK_N || 400);
const bestStatic = S[bestStaticName];
const LUCKY = {
  'Build flat out (4 crews)': () => ({}),
  'Inspect 30%, no crews (careless)': () => ({ inspect: 0.3 }),
  '+3 crews, no inspection (reckless)': (p, w) => ({ hire: w === 1 ? 3 : 0 }),
  '+3 crews, shift every week (deadline-chaser)': (p, w) => ({ hire: w === 1 ? 3 : 0, shift: true }),
  [`${bestStaticName.trim()} (best static)`]: (p, w) => ({ hire: w === 1 ? bestStatic.hire : 0, inspect: bestStatic.insp, shift: w >= (bestStatic.shiftFrom ?? 99) && w <= (bestStatic.shiftTo ?? 99) }),
  'Adaptive reference': (p, w) => adaptivePolicy(p, w),
};
const luckRows = {};
for (const [name, pol] of Object.entries(LUCKY)) {
  const ps = Array.from({ length: LUCK_N }, (_, i) => { const p = new Project('ledger', CONFIG, i + 1); p.commit({ week: 13, low: 11, high: 15, onTimeChance: 40 }); while (!p.done) p.play(pol(p, p.week + 1)); return p; });
  const sc = ps.map((p) => p.scores()), q = quantiles(sc.map((x) => x.outcome));
  luckRows[name] = { onTime: mean(sc.map((x) => +x.onTime)), broke: mean(ps.map((p) => +(p.result === 'BANKRUPT'))), deliv: mean(sc.map((x) => x.delivery)), p10: q(0.1), med: q(0.5), p90: q(0.9) };
}
console.log(`\nOne code ("ledger"), ${LUCK_N} students with their own luck`);
console.log('Strategy'.padEnd(46) + 'OnTime'.padStart(7) + 'Late/broke'.padStart(11) + 'Broke'.padStart(7) + 'Deliv'.padStart(7) + '  weeks p10-med-p90');
for (const [k, r] of Object.entries(luckRows)) console.log(k.padEnd(46) + pct(r.onTime).padStart(7) + pct(1 - r.onTime).padStart(11) + pct(r.broke).padStart(7) + r.deliv.toFixed(1).padStart(7) + `  ${r.p10}-${r.med}-${r.p90}`);
const LA = luckRows['Adaptive reference'], LB = luckRows[`${bestStaticName.trim()} (best static)`], LF = luckRows['Build flat out (4 crews)'], LR = luckRows['+3 crews, no inspection (reckless)'];
checks.push(
  ['17. On one code, good strategies sometimes fail: adaptive and the best static plan are late or bankrupt >= 30%', 1 - LA.onTime >= 0.3 && 1 - LB.onTime >= 0.3,
    `adaptive ${pct(1 - LA.onTime)} late or bankrupt (${pct(LA.broke)} bankrupt); best static ${pct(1 - LB.onTime)} (${pct(LB.broke)} bankrupt)`],
  // Flat out and careless are reported, not gated: on ledger they run 6 and 9 weeks late, which no small luck closes.
  ['18. On one code, a reckless plan sometimes wins: +3 crews with no inspection on time >= 5%', LR.onTime >= 0.05,
    `reckless ${pct(LR.onTime)} on time, ${pct(LR.broke)} bankrupt; flat out ${pct(LF.onTime)} (weeks ${LF.p10}-${LF.p90}); careless ${pct(luckRows['Inspect 30%, no crews (careless)'].onTime)}`],
  ['19. Strategy still matters: adaptive beats flat out on mean Delivery by >= 20 points', LA.deliv - LF.deliv >= 20, `adaptive ${LA.deliv.toFixed(1)}, flat out ${LF.deliv.toFixed(1)}: +${(LA.deliv - LF.deliv).toFixed(1)}`],
);

console.log('\n=== TARGETS ===');
let fails = 0;
for (const [label, ok, detail] of checks) { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}\n          ${detail}`); }
console.log(`\n  ${checks.length - fails}/${checks.length} targets met.`);
process.exit(fails ? 1 : 0);
