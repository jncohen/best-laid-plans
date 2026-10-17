/**
 * The Decision Desk: the tools a project office uses, each computing a forecast from
 * what the briefing shows and nothing else.
 *
 * Every tool takes `screen` (from screenData(): the line's last six weeks, the last
 * contract's story, the 40 past contracts, the disclosed rules) and the stated plan.
 * Nothing here builds a Project or reads a scenario code, so no tool can know the
 * scenario's hidden draws; tools/test-plan.mjs checks this.
 *
 * The tools compute honestly. The inside-view ones are early because they cannot see
 * defects or the scope change, and each one says so on its face.
 */
import { CONFIG, lastContract, pastContracts, matchContracts, summarizeContracts, normalizePlan, recordWeek } from './engine.js';

// ── What the screen shows ────────────────────────────────────────────────────
const DISCLOSED = ['scope', 'deadline', 'horizon', 'crews', 'budget', 'creditLine', 'maxCrews', 'maxHirePerWeek', 'coordinationLoss', 'crewWeek', 'hireFee',
  'releaseFee', 'shiftPremiumPerCrew', 'onboardingWeeks', 'onboardingFactor', 'shiftBoost', 'inspectionOptions', 'lateFixMultiplier'];

/** Everything the desk may use. The rules are only those the briefing states. */
export function screenData(cfg = CONFIG) {
  const last = lastContract(cfg);
  const past = pastContracts(cfg);
  const rules = Object.fromEntries(DISCLOSED.map((k) => [k, cfg[k]]));
  return Object.freeze({
    history: [...last.history],
    last: { dashboardFullWeek: last.dashboardFullWeek, deliveredWeek: last.deliveredWeek, rejected: last.rejected },
    contracts: past.contracts,
    rules,
  });
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => Math.sqrt((mean(xs.map((x) => (x - mean(xs)) ** 2)) * xs.length) / (xs.length - 1));
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.max(0, Math.ceil(p * s.length) - 1)]; };
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clampF = (f) => ({ ...f, low: Math.min(f.low, f.week), high: Math.max(f.high, f.week), chance: Math.max(0, Math.min(100, Math.round(f.chance))) });

const pace = (S) => mean(S.history);
const shiftIn = (plan, w) => plan.shift === 'every' || (plan.shift === 'late' && w >= 9 && w <= 11);
const HANDS_OFF = { crews: 0, inspect: 0, shift: 'none' };
const asPlan = (plan) => normalizePlan(plan || HANDS_OFF);

/**
 * The plan run week by week under the stated rules: onboarding drag, coordination
 * loss, the shift boost, the share of the line inspecting. No defects (the briefing
 * gives no rate) and, unless given one, no scope change.
 */
export function planModel(S, plan, { noise = () => 1, scope = null, trace = false } = {}) {
  const R = S.rules, p = asPlan(plan), perCrew = pace(S) / R.crews;
  let left = R.scope, crews = R.crews, onboard = 0, w = 0;
  const weeks = [];
  while (left > 0.5 && w < 40) {
    w++;
    if (w === 1 && p.crews > 0) { crews += p.crews; onboard = R.onboardingWeeks; }
    const shift = shiftIn(p, w);
    const cap = crews * perCrew * (1 - R.coordinationLoss * Math.max(0, crews - R.crews)) * (onboard > 0 ? R.onboardingFactor : 1) * (shift ? R.shiftBoost : 1) * noise();
    left -= cap * (1 - p.inspect);
    if (scope && w === scope.week) left += scope.units;
    if (trace) weeks.push({ week: w, crews, onboarding: onboard > 0, shift, built: cap * (1 - p.inspect), left: Math.max(0, left) });
    if (onboard > 0) onboard--;
  }
  return trace ? { week: w, weeks } : w;
}

// ── The mind's own frames ────────────────────────────────────────────────────
/**
 * Status Report: an earned-value report on the line's last six weeks. Earned value is
 * units reported complete; the schedule forecast is the EVM estimate at completion,
 * planned duration ÷ SPI, with a range from the SPI of each week to date. It runs
 * early only because "earned" counts units built, not units that will pass.
 */
export function statusReport(S) {
  const R = S.rules, v = pace(S);
  let cum = 0;
  const weekly = S.history.map((b, i) => {
    cum += b;
    const spi = (cum / R.scope) / ((i + 1) / R.deadline);
    return { week: i + 1, spi, eac: R.deadline / spi };
  });
  const last = weekly[weekly.length - 1];
  const built = cum, wk = S.history.length, planned = (R.scope * wk) / R.deadline;
  const ev = (built / R.scope) * R.budget, pv = (planned / R.scope) * R.budget, ac = wk * R.crews * R.crewWeek;
  const eacs = weekly.map((x) => x.eac);
  return {
    forecast: clampF({ week: Math.round(last.eac), low: Math.floor(Math.min(...eacs)), high: Math.ceil(Math.max(...eacs)), chance: last.eac <= R.deadline - 0.5 ? 90 : last.eac <= R.deadline ? 60 : 20 }),
    pace: +v.toFixed(1), weeksAtPace: +(R.scope / v).toFixed(1), eacWeeks: +last.eac.toFixed(1), weekly, built, planned, weeksShown: wk,
    spi: +last.spi.toFixed(2), cpi: +(ev / ac).toFixed(2), light: ev >= pv ? 'green' : ev >= 0.9 * pv ? 'amber' : 'red',
  };
}

/**
 * Cost Management: the stated plan's spend, week by week, against the budget and the
 * credit line. Earned-value terms: BAC is the budget, EAC the plan's cost at the
 * Schedule's finish, CPI = BAC / EAC. Money only: it cannot see defects, so the
 * schedule it implies is the Schedule's.
 */
export function costManagement(S, plan) {
  const R = S.rules, p = asPlan(plan);
  const sc = schedule(S, p).forecast;
  const crews = R.crews + p.crews;
  const weekCost = (w) => crews * R.crewWeek + (shiftIn(p, w) ? crews * R.shiftPremiumPerCrew : 0) + (w === 1 ? p.crews * R.hireFee : 0);
  const burn = [];
  let total = 0;
  for (let w = 1; w <= R.horizon; w++) { total += weekCost(w); burn.push({ week: w, spent: total }); }
  const limit = R.budget + R.creditLine;
  const broke = burn.find((b) => b.spent > limit);
  const eac = burn[Math.min(sc.week, R.horizon) - 1].spent;
  const lines = [
    { label: 'Crews', amount: crews * R.crewWeek * sc.week },
    { label: 'Hiring fees', amount: p.crews * R.hireFee },
    { label: 'Second-shift premium', amount: eac - crews * R.crewWeek * sc.week - p.crews * R.hireFee },
  ];
  const steady = weekCost(Math.max(2, sc.week));
  return {
    forecast: sc, cost: { eac, bac: R.budget, vac: R.budget - eac, cpi: +(R.budget / eac).toFixed(2) },
    burn, lines, budget: R.budget, creditLine: R.creditLine, limit, onBudget: eac <= R.budget,
    brokeWeek: broke ? broke.week : null, runwayWeeks: +((limit - weekCost(1)) / steady + 1).toFixed(1), perWeek: steady,
  };
}

/** Schedule: the plan, week by week. No defects, no scope change. */
export function schedule(S, plan) {
  const R = S.rules;
  const m = planModel(S, plan, { trace: true });
  return { forecast: { week: m.week, low: m.week - 1, high: m.week + 1, chance: m.week <= R.deadline - 1 ? 90 : m.week <= R.deadline ? 70 : 20 }, weeks: m.weeks };
}

/**
 * Last 5 Contracts: the newest five rows of the record (it is chronological), with
 * the newest, the line's last contract, told as an after-action review.
 */
export function lastFive(S) {
  const R = S.rules, rows = S.contracts.slice(-5);
  const sum = summarizeContracts(rows);
  return {
    forecast: { week: sum.median, low: sum.min, high: sum.max, chance: Math.round(100 * sum.onTimeShare) },
    rows, newest: { ...rows[rows.length - 1], ...S.last, pace: +pace(S).toFixed(1) }, n: rows.length, deadline: R.deadline,
  };
}

// ── Records and structured judgment ──────────────────────────────────────────
const fromSummary = (s) => ({ week: s.median, low: s.p10, high: s.p90, chance: Math.round(100 * s.onTimeShare) });

/** Records: all 40, or the contracts run like the plan. */
export function records(S, plan = null) {
  const all = summarizeContracts(S.contracts);
  const m = plan ? matchContracts(plan) : null;
  return { forecast: fromSummary(m || all), all: fromSummary(all), matched: m ? { ...fromSummary(m), n: m.n, rule: m.rule } : null };
}

/** Scenarios: the plan model under four named futures, with rework like the last contract. */
export function scenarios(S, plan) {
  const R = S.rules, p = asPlan(plan), perCrew = pace(S) / R.crews;
  const units = S.contracts.map((c) => c.scopeUnits), weeks = S.contracts.map((c) => c.scopeWeek);
  const scopeWeek = q(weeks, 0.5), reworkShare = S.last.rejected / R.scope;
  const finish = (scopeUnits, rework) => {
    let left = R.scope, crews = R.crews, onboard = 0, w = 0, built = 0, reworkAdded = false;
    while (w < 40) {
      w++;
      if (w === 1 && p.crews > 0) { crews += p.crews; onboard = R.onboardingWeeks; }
      const cap = crews * perCrew * (1 - R.coordinationLoss * Math.max(0, crews - R.crews)) * (onboard > 0 ? R.onboardingFactor : 1) * (shiftIn(p, w) ? R.shiftBoost : 1);
      const b = Math.min(left, cap * (1 - p.inspect)); left -= b; built += b;
      if (w === scopeWeek) left += scopeUnits;
      if (onboard > 0) onboard--;
      // Inspected work is fixed as you go; the rest surfaces at the acceptance test, at double the work.
      if (left < 0.5) {
        if (rework && !reworkAdded) { reworkAdded = true; left = built * reworkShare * (p.inspect > 0 ? 0.5 : R.lateFixMultiplier); if (left > 0.5) continue; }
        return w;
      }
    }
    return w;
  };
  const typical = q(units, 0.5), largest = Math.max(...units);
  const rows = [
    { key: 'best', label: 'Best case', assumptions: 'No scope change. No rework.', week: finish(0, false) },
    { key: 'base', label: 'Base case', assumptions: `Typical scope change (+${typical} units in week ${scopeWeek}). No rework.`, week: finish(typical, false) },
    { key: 'rework', label: 'Base + rework', assumptions: `Typical scope change, and rework like the last contract (${S.last.rejected} of ${R.scope} units rejected).`, week: finish(typical, true) },
    { key: 'worst', label: 'Worst seen', assumptions: `The largest scope change in the record (+${largest} units), and rework like last time.`, week: finish(largest, true) },
  ];
  const [best, , rw, worst] = rows.map((r) => r.week);
  return { forecast: clampF({ week: rw, low: best, high: worst, chance: rw <= R.deadline ? 60 : best <= R.deadline ? 25 : 5 }), rows, reworkShare };
}

/** Risk Register: each disclosed risk, with its frequency and size from the record. No forecast. */
export function riskRegister(S, plan) {
  const R = S.rules, p = asPlan(plan), c = S.contracts, v = pace(S);
  const units = c.map((r) => r.scopeUnits);
  const rej = c.filter((r) => r.rejected > 0);
  const late = c.filter((r) => !r.onTime).length;
  const term = c.filter((r) => r.delivered === false).length;
  const level = (x, cuts) => (x < cuts[0] ? 0 : x < cuts[1] ? 1 : 2);
  const risk = (key, title, freq, weeks, note, applies = true) => ({ key, title, freq, weeks: +weeks.toFixed(1), note, applies, prob: level(freq, [0.2, 0.6]), impact: level(weeks, [1, 2]) });
  return {
    forecast: null,
    risks: [
      risk('scope', 'Customer adds scope', c.length ? c.filter((r) => r.scopeUnits > 0).length / c.length : 0, q(units, 0.5) / v,
        `${c.filter((r) => r.scopeUnits > 0).length} of ${c.length} past contracts. Median +${q(units, 0.5)} units, largest +${Math.max(...units)}, in weeks ${Math.min(...c.map((r) => r.scopeWeek))}–${Math.max(...c.map((r) => r.scopeWeek))}.`),
      risk('defects', 'Acceptance test rejects units', rej.length / c.length, (q(rej.map((r) => r.rejected), 0.5) * R.lateFixMultiplier) / v,
        `${rej.length} of ${c.length} past contracts had units rejected (median ${q(rej.map((r) => r.rejected), 0.5)}). Each costs ${R.lateFixMultiplier}× to fix that late. The last contract: ${S.last.rejected} rejected.`),
      risk('onboarding', 'New crews slow the line', p.crews > 0 ? 1 : 0, p.crews > 0 ? (R.onboardingWeeks * (1 - R.onboardingFactor) * (R.crews + p.crews)) / R.crews : 0,
        `Every hire: the whole line runs at ${Math.round(R.onboardingFactor * 100)}% for ${R.onboardingWeeks} weeks.`, p.crews > 0),
      risk('coordination', 'Coordination loss', R.crews + p.crews > R.crews ? 1 : 0, 0.3 * Math.max(0, p.crews),
        `Each crew beyond ${R.crews} costs every crew ${Math.round(R.coordinationLoss * 100)}%.`, p.crews > 0),
      risk('fatigue', 'Tired crews make more defects', p.shift === 'none' ? 0 : 1, p.shift === 'every' ? 3 : p.shift === 'late' ? 1 : 0,
        'From the second straight week of a second shift, more defects.', p.shift !== 'none'),
      risk('late', 'Finishing after week 12', late / c.length, Math.max(0, q(c.map((r) => recordWeek(r)), 0.5) - R.deadline),
        `${late} of ${c.length} past contracts missed week ${R.deadline}.`),
      risk('termination', 'Contract terminated', term / c.length, R.horizon - R.deadline,
        `After week ${R.horizon}. ${term} of ${c.length} past contracts were terminated.`),
    ],
  };
}

// ── Models ───────────────────────────────────────────────────────────────────
function invert(M) {
  const n = M.length;
  const m = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => +(i === j))]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(m[r][i]) > Math.abs(m[p][i])) p = r;
    [m[i], m[p]] = [m[p], m[i]];
    const d = m[i][i] || 1e-12;
    m[i] = m[i].map((v) => v / d);
    for (let r = 0; r < n; r++) if (r !== i) { const f = m[r][i]; m[r] = m[r].map((v, c) => v - f * m[i][c]); }
  }
  return m.map((r) => r.slice(n));
}

/** Analytics: OLS of week accepted on the plan's terms across the 40, with an 80% prediction interval. */
export function analytics(S, plan) {
  const R = S.rules, p = asPlan(plan), rows = S.contracts;
  const xOf = (crews, insp, shift) => [1, crews, insp > 0 ? 1 : 0, insp, shift ? 1 : 0];
  const X = rows.map((r) => xOf(r.crewsAdded, r.inspect, r.shiftWeeks > 0));
  const y = rows.map((r) => recordWeek(r));
  const k = X[0].length, n = X.length;
  const XtXi = invert(Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => X.reduce((a, r) => a + r[i] * r[j], 0))));
  const Xty = Array.from({ length: k }, (_, i) => X.reduce((a, r, m) => a + r[i] * y[m], 0));
  const b = XtXi.map((r) => r.reduce((a, v, j) => a + v * Xty[j], 0));
  const fit = (x) => x.reduce((a, v, j) => a + v * b[j], 0);
  const res = y.map((v, m) => v - fit(X[m]));
  const s2 = res.reduce((a, r) => a + r * r, 0) / (n - k);
  const x0 = xOf(p.crews, p.inspect, p.shift !== 'none');
  const yhat = fit(x0);
  const lev = x0.reduce((a, xi, i) => a + xi * x0.reduce((s, xj, j) => s + XtXi[i][j] * xj, 0), 0);
  const se = Math.sqrt(s2 * (1 + lev));
  const t = 1.306; // t(0.90, 35 df)
  const Phi = (z) => 0.5 * (1 + Math.tanh(0.7978845608 * (z + 0.044715 * z ** 3)));
  const r2 = 1 - res.reduce((a, r) => a + r * r, 0) / y.reduce((a, v) => a + (v - mean(y)) ** 2, 0);
  return {
    forecast: { week: Math.round(yhat), low: Math.round(yhat - t * se), high: Math.round(yhat + t * se), chance: Math.round(100 * Phi((R.deadline + 0.5 - yhat) / se)) },
    coef: { intercept: b[0], crews: b[1], inspectAny: b[2], inspectShare: b[3], shift: b[4] }, predicted: +yhat.toFixed(1), se: +se.toFixed(2), r2: +r2.toFixed(2), n,
    points: rows.map((r) => ({ crews: r.crewsAdded, accepted: recordWeek(r), inspect: r.inspect, shift: r.shiftWeeks > 0, fitted: fit(xOf(r.crewsAdded, r.inspect, r.shiftWeeks > 0)) })),
    line: [0, 1, 2, 3].map((c) => ({ crews: c, week: fit(xOf(c, p.inspect, p.shift !== 'none')) })),
  };
}

/**
 * Risk Simulator: the Schedule 1,000 times, with the pace's wobble and a scope change
 * drawn from the record. With `rework` on (the default: real schedule-risk tools carry
 * historical risk factors), each run also adds a slip drawn from past contracts
 * inspected the way the plan is: how much later each was accepted than the same
 * model predicted for its own plan and scope change. That slip is mostly rework.
 * Off, it is the plan alone: precise and early.
 */
export function historicalSlips(S, plan) {
  const p = asPlan(plan);
  const like = S.contracts.filter((c) => (c.inspect > 0) === (p.inspect > 0));
  return (like.length >= 5 ? like : S.contracts).map((c) => {
    const own = { crews: c.crewsAdded, inspect: c.inspect, shift: c.shiftWeeks > 0 ? 'late' : 'none' };
    return recordWeek(c) - planModel(S, own, { scope: { week: c.scopeWeek, units: c.scopeUnits } });
  });
}

export function riskSimulator(S, plan, { rework = true, runs = 1000 } = {}) {
  const R = S.rules, r = mulberry32(42), p = asPlan(plan);
  const scopes = S.contracts.map((c) => ({ week: c.scopeWeek, units: c.scopeUnits }));
  const slips = historicalSlips(S, p);
  const relSd = sd(S.history) / pace(S);
  const sims = Array.from({ length: runs }, () => {
    const w = planModel(S, p, { noise: () => 1 + relSd * (r() + r() + r() - 1.5) * 2, scope: scopes[Math.floor(r() * scopes.length)] });
    return rework ? Math.max(w, Math.round(w + slips[Math.floor(r() * slips.length)])) : w;
  });
  const hist = {};
  for (const w of sims) hist[w] = (hist[w] || 0) + 1;
  return {
    forecast: { week: q(sims, 0.5), low: q(sims, 0.1), high: q(sims, 0.9), chance: Math.round((100 * sims.filter((x) => x <= R.deadline).length) / sims.length) },
    runs, hist, rework, slips: { n: slips.length, median: q(slips, 0.5), low: q(slips, 0.1), high: q(slips, 0.9) }, p: { 10: q(sims, 0.1), 50: q(sims, 0.5), 80: q(sims, 0.8), 90: q(sims, 0.9) },
  };
}

// ── Other people ─────────────────────────────────────────────────────────────
const ONE_IN = ['', 'every one', 'one in two', 'one in three', 'one in four', 'one in five', 'one in six', 'one in seven', 'one in eight', 'one in nine', 'one in ten'];
const inWords = (share) => (share <= 0 ? 'none' : share < 0.08 ? 'hardly any' : ONE_IN[Math.min(10, Math.max(1, Math.round(1 / share)))]);
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const word = (n) => NUM[n] ?? String(n);

/**
 * Team Chat: five colleagues answering "When will we be done?" the way people in
 * these jobs talk. Each speaks from what they would see; every number is computed
 * from the briefing. Confidence is how sure each says they are.
 */
export function teamChat(S, plan) {
  const R = S.rules, p = asPlan(plan);
  const all = records(S).all, m = records(S, p).matched, sc = schedule(S, p).forecast;
  const v = pace(S), atPace = Math.ceil(R.scope / v);
  const gap = S.last.deliveredWeek - S.last.dashboardFullWeek;
  const rw = p.inspect > 0 ? Math.max(1, Math.round(gap / 2)) : gap;
  const spread = Math.round((all.high - all.low) / 2);
  const yours = m.week !== all.week ? ` The ones run like yours came in around week ${m.week}.` : '';
  return [
    { key: 'veteran', name: 'Mabel', role: 'Veteran on the line', frame: 'The record', confidence: 80, forecast: { week: m.week, low: m.low, high: m.high, chance: m.chance },
      says: `Twenty-odd years on this line. These take about ${word(all.week)} weeks, give or take ${spread <= 2 ? 'a couple' : word(spread)}. I've seen maybe ${inWords(all.chance / 100)} make ${word(R.deadline)}.${yours}`,
      reasoning: `The record of ${S.contracts.length} contracts: median week ${all.week}, most between ${all.low} and ${all.high}, ${all.chance}% on time. For your plan, the ${m.n} run like it: week ${m.week} (${m.low}–${m.high}).` },
    { key: 'quality', name: 'Priya', role: 'Quality lead', frame: 'Rework, from the last contract', confidence: 70,
      forecast: clampF({ week: sc.week + rw, low: sc.week + rw - 1, high: sc.week + rw + 2, chance: sc.week + rw <= R.deadline ? 50 : 15 }),
      says: `Last time ${S.last.rejected} units bounced at acceptance, and it took ${word(gap)} more weeks after the dashboard said done. Budget ${gap > 1 ? `${word(gap - 1)} or ${word(gap)}` : word(gap)} weeks for rework${p.inspect > 0 ? ', maybe half that if you keep inspecting' : ''}.`,
      reasoning: `The plan on paper (week ${sc.week}) plus the rework the last contract needed after its dashboard read 100% (${gap} weeks${p.inspect > 0 ? ', halved for inspection' : ''}).` },
    { key: 'supervisor', name: 'Dana', role: 'Line supervisor', frame: 'The pace', confidence: 65, forecast: { week: atPace, low: atPace - 1, high: atPace + 1, chance: atPace <= R.deadline ? 75 : 30 },
      says: `At this pace, ${word(atPace)} weeks, if nothing goes wrong.`,
      reasoning: `${R.scope} units at the last six weeks' ${v.toFixed(1)} a week is ${(R.scope / v).toFixed(1)} weeks of building.` },
    { key: 'planner', name: 'Sam', role: 'Planner', frame: 'The plan on paper', confidence: 70, forecast: sc,
      says: `On paper your plan finishes in week ${sc.week}. That's before any surprises.`,
      reasoning: 'Your plan week by week under the stated rules: onboarding, coordination, shift, inspection. No defects or scope change.' },
    { key: 'sales', name: 'Kim', role: 'Sales lead', frame: 'The promise', confidence: 60, forecast: { week: R.deadline, low: R.deadline - 1, high: R.deadline + 1, chance: 70 },
      says: `We promised week ${R.deadline}.`, reasoning: 'What the customer was told.' },
  ];
}

/**
 * AI Assistant: given the whole briefing, as it would be if the student pasted it in.
 * It answers as a careful assistant would: the pace is optimistic, the record is the
 * base rate, rework and the scope change explain the gap, and it plans on the
 * contracts run like the stated plan.
 */
export function aiAssistant(S, plan) {
  const R = S.rules, p = asPlan(plan), all = records(S).all, m = records(S, p).matched, v = pace(S);
  const f = { week: m.week, low: m.low, high: m.high, chance: m.chance };
  const parts = [p.crews ? `+${p.crews} crews` : '', p.inspect ? `${Math.round(p.inspect * 100)}% inspection` : '', p.shift !== 'none' ? `a ${p.shift === 'every' ? 'full-time' : 'late'} second shift` : ''].filter(Boolean);
  const planText = parts.length ? `For your plan (${parts.join(', ')}), the ${m.n} past contracts run most like it` : `For a hands-off plan, the ${m.n} past contracts run most like it`;
  return {
    forecast: f,
    context: [
      "The whole briefing: the contract, every stated rule, the last six weeks of output, the last contract's story, and all 40 past contracts with what each manager did",
      `Your stated plan: crews +${p.crews}, inspection ${Math.round(p.inspect * 100)}%, second shift ${p.shift}`,
    ],
    answer: `The dashboard pace (${v.toFixed(1)} units a week) implies about ${(R.scope / v).toFixed(1)} weeks, but that counts units built, not units accepted. Your line's own history says otherwise: the last contract's dashboard read 100% in week ${S.last.dashboardFullWeek}, and it was accepted in week ${S.last.deliveredWeek} after ${S.last.rejected} units failed acceptance. Across all ${S.contracts.length} past contracts the median is **week ${all.week}**, most between weeks ${all.low} and ${all.high}, and only ${all.chance}% made week ${R.deadline}. Every one of them also absorbed a mid-contract scope change. ${planText} came in around **week ${m.week}** (${m.low}–${m.high}), ${m.chance}% on time. I'd plan on that range rather than the pace, and treat week ${R.deadline} as a stretch.`,
    basis: `I used everything in the briefing you pasted: the rules, the last six weeks, the last contract's outcome, and the 40 past contracts, especially the ${m.n} run like your plan (matched on ${m.rule}). I can't see this contract's own defect rate or its scope change, so the record is my best guide.`,
  };
}

// ── The desk ─────────────────────────────────────────────────────────────────
/**
 * Every tab, in the briefing's order. `letter` is its one-character id in result
 * codes. `tone`: inside (blue), record (amber), people (violet: people and mixed).
 */
export const TABS = [
  { id: 'commit', letter: '', group: null, name: 'Your Plan and Prediction · Commit Before Week 1', short: 'Your Plan & Prediction', tone: 'front' },
  { id: 'status', letter: 'a', group: "The mind's own frames", name: 'Status Report', tone: 'inside', forecasts: true, sees: 'Earned value: units reported complete against plan', cant: 'Whether those units will pass acceptance' },
  { id: 'cost', letter: 'c', group: "The mind's own frames", name: 'Cost Management', tone: 'inside', forecasts: true, sees: 'Money: spend, burn rate, the credit line', cant: 'Defects, so you can watch every dollar and still be late' },
  { id: 'schedule', letter: 'd', group: "The mind's own frames", name: 'Schedule', tone: 'inside', forecasts: true, sees: 'Your plan, week by week, under the stated rules', cant: 'Defects or scope changes' },
  { id: 'chat', letter: 'f', group: 'Other people', name: 'Team Chat', tone: 'people', forecasts: true, sees: 'Five colleagues, each from where they sit', cant: 'Which view to weigh most' },
  { id: 'ai', letter: 'i', group: 'Other people', name: 'AI Assistant', tone: 'people', forecasts: true, sees: 'The whole briefing, pasted in', cant: "This contract's own defects and scope change" },
  { id: 'last5', letter: 'e', group: 'Records and structured judgment', name: 'Last 5 Contracts', tone: 'record', forecasts: true, sees: 'The five newest contracts, and the story of the last one', cant: 'Whether five is enough' },
  { id: 'records', letter: 'j', group: 'Records and structured judgment', name: 'Records', tone: 'record', forecasts: true, sees: 'What actually happened, defects and scope changes included', cant: 'Plans no past manager tried' },
  { id: 'scenarios', letter: 'l', group: 'Records and structured judgment', name: 'Scenarios', tone: 'people', forecasts: true, sees: 'A wider range, on purpose', cant: 'Anything but your plan as the starting point' },
  { id: 'risks', letter: 'm', group: 'Records and structured judgment', name: 'Risk Register', tone: 'people', forecasts: false, sees: 'Each risk, one at a time, and your own premortem', cant: 'Their sum' },
  { id: 'analytics', letter: 'o', group: 'Models', name: 'Analytics', tone: 'record', forecasts: true, sees: "The record's patterns", cant: 'Plans the record does not contain' },
  { id: 'simulator', letter: 'p', group: 'Models', name: 'Risk Simulator', tone: 'people', forecasts: true, sees: 'Variability, scope changes and, if switched on, rework from the record', cant: 'Anything its switches leave out' },
  { id: 'consensus', letter: 'q', group: 'Models', name: 'Consensus', tone: 'people', forecasts: true, sees: 'The tabs you tick', cant: 'Anything you leave out' },
  { id: 'track', letter: 'r', group: 'Your own record', name: 'Your Track Record', tone: 'record', forecasts: false, sees: 'Your past forecasts on this device', cant: "Anything, if you haven't kept score" },
];
export const tabById = (id) => TABS.find((t) => t.id === id);
export const tabByLetter = (l) => TABS.find((t) => t.letter && t.letter === l);

/** The forecasts the Consensus tab can combine, and the sweep checks. Each is a function of (screen, plan). */
export const FORECASTERS = {
  status: (S) => statusReport(S).forecast,
  cost: (S, p) => costManagement(S, p).forecast,
  schedule: (S, p) => schedule(S, p).forecast,
  ai: (S, p) => aiAssistant(S, p).forecast,
  last5: (S) => lastFive(S).forecast,
  'records-all': (S) => records(S).all,
  'records-plan': (S, p) => records(S, p).matched,
  scenarios: (S, p) => scenarios(S, p).forecast,
  analytics: (S, p) => analytics(S, p).forecast,
  simulator: (S, p) => riskSimulator(S, p).forecast,
  'simulator-blind': (S, p) => riskSimulator(S, p, { rework: false }).forecast,
};
export const FORECASTER_NAMES = {
  status: 'Status Report', cost: 'Cost Management', schedule: 'Schedule', ai: 'AI Assistant', last5: 'Last 5 Contracts',
  'records-all': 'Records, all 40', 'records-plan': 'Records, like my plan', scenarios: 'Scenarios', analytics: 'Analytics',
  simulator: 'Risk Simulator (with rework)', 'simulator-blind': 'Risk Simulator (rework off)',
};

/** Consensus: the average of the ticked forecasters. */
export function consensus(S, plan, keys) {
  const fs = keys.map((k) => FORECASTERS[k]?.(S, plan)).filter(Boolean);
  if (!fs.length) return { forecast: null, used: [] };
  const avg = (k) => Math.round(mean(fs.map((f) => f[k])));
  return { forecast: clampF({ week: avg('week'), low: avg('low'), high: avg('high'), chance: avg('chance') }), used: keys };
}

/** Every forecaster's numbers for a plan, for the reveal's "how each tool would have done". */
export function allForecasts(S, plan) {
  const out = Object.entries(FORECASTERS).map(([k, f]) => ({ key: k, name: FORECASTER_NAMES[k], ...f(S, plan) }));
  for (const c of teamChat(S, plan)) out.push({ key: `chat-${c.key}`, name: `Team Chat: ${c.name}, ${c.role.toLowerCase()}`, ...c.forecast });
  return out;
}
