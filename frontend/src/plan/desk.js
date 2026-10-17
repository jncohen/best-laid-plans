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
/** Status Report: 200 ÷ the pace, with a range from the pace's own wobble. */
export function statusReport(S) {
  const R = S.rules, v = pace(S), s = sd(S.history);
  const w = R.scope / v;
  const built = S.history.reduce((a, b) => a + b, 0);
  const wk = S.history.length;
  const planned = (R.scope * wk) / R.deadline;
  const ev = (built / R.scope) * R.budget, pv = (planned / R.scope) * R.budget, ac = wk * R.crews * R.crewWeek;
  return {
    forecast: { week: Math.round(w), low: Math.floor(R.scope / (v + 1.28 * s)), high: Math.ceil(R.scope / (v - 1.28 * s)), chance: w <= R.deadline ? 95 : 5 },
    pace: +v.toFixed(1), weeksAtPace: +w.toFixed(1), built, planned, weeksShown: wk,
    spi: +(ev / pv).toFixed(2), cpi: +(ev / ac).toFixed(2), light: ev >= pv ? 'green' : ev >= 0.9 * pv ? 'amber' : 'red',
  };
}

/** Sprint Burndown: the same velocity, in sprints. Done in the sprint the work runs out. */
export function sprintBurndown(S) {
  const R = S.rules, v = pace(S);
  const fast = Math.max(...S.history), slow = Math.min(...S.history);
  return {
    forecast: { week: Math.ceil(R.scope / v), low: Math.floor(R.scope / fast), high: Math.ceil(R.scope / slow), chance: Math.ceil(R.scope / v) <= R.deadline ? 90 : 10 },
    velocity: +v.toFixed(1), fast, slow,
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

/** Lessons Learned: the last contract, as the forecast. */
export function lessonsLearned(S) {
  const L = S.last, R = S.rules;
  return { forecast: { week: L.deliveredWeek, low: L.deliveredWeek - 1, high: L.deliveredWeek + 1, chance: L.deliveredWeek <= R.deadline ? 80 : 10 }, ...L, pace: +pace(S).toFixed(1) };
}

// ── Records and structured judgment ──────────────────────────────────────────
const fromSummary = (s) => ({ week: s.median, low: s.p10, high: s.p90, chance: Math.round(100 * s.onTimeShare) });

/** Records: all 40, or the contracts run like the plan. */
export function records(S, plan = null) {
  const all = summarizeContracts(S.contracts);
  const m = plan ? matchContracts(plan) : null;
  return { forecast: fromSummary(m || all), all: fromSummary(all), matched: m ? { ...fromSummary(m), n: m.n, rule: m.rule } : null };
}

/**
 * Industry Benchmark: a survey of a different population. The figures are invented
 * for the game and labelled as such on screen: all sectors, all sizes, not this line.
 */
export const BENCHMARK = { projects: 1200, onTimeShare: 0.31, medianRatio: 1.1, p10Ratio: 0.95, p90Ratio: 1.35, overrunShare: 0.69 };
export function industryBenchmark(S) {
  const d = S.rules.deadline, B = BENCHMARK;
  return { forecast: { week: Math.round(d * B.medianRatio), low: Math.round(d * B.p10Ratio), high: Math.round(d * B.p90Ratio), chance: Math.round(100 * B.onTimeShare) }, ...B };
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

/** Risk Simulator: the Schedule 1,000 times, with the pace's wobble and a scope change drawn from the record. Still no defects. */
export function riskSimulator(S, plan, runs = 1000) {
  const R = S.rules, r = mulberry32(42);
  const scopes = S.contracts.map((c) => ({ week: c.scopeWeek, units: c.scopeUnits }));
  const relSd = sd(S.history) / pace(S);
  const sims = Array.from({ length: runs }, () => planModel(S, plan, { noise: () => 1 + relSd * (r() + r() + r() - 1.5) * 2, scope: scopes[Math.floor(r() * scopes.length)] }));
  const hist = {};
  for (const w of sims) hist[w] = (hist[w] || 0) + 1;
  return {
    forecast: { week: q(sims, 0.5), low: q(sims, 0.1), high: q(sims, 0.9), chance: Math.round((100 * sims.filter((x) => x <= R.deadline).length) / sims.length) },
    runs, hist, p: { 10: q(sims, 0.1), 50: q(sims, 0.5), 80: q(sims, 0.8), 90: q(sims, 0.9) },
  };
}

// ── Other people ─────────────────────────────────────────────────────────────
/**
 * Team Chat: five colleagues, each reasoning from one frame on this desk and saying
 * which. None of them knows the scenario. Confidence is how sure each one says they
 * are of their own range.
 */
export function teamChat(S, plan) {
  const R = S.rules, p = asPlan(plan);
  const st = statusReport(S).forecast, sc = schedule(S, p).forecast, rec = records(S, p), scen = scenarios(S, p);
  const rw = scen.rows.find((r) => r.key === 'rework').week;
  const m = rec.matched;
  return [
    { key: 'supervisor', name: 'Dana', role: 'Line supervisor', frame: 'Status Report', confidence: 95,
      forecast: st, says: `We're doing ${pace(S).toFixed(1)} a week. ${R.scope} units is week ${st.week}, maybe ${st.high}. I'd bet on it.`,
      reasoning: `Divides ${R.scope} units by the last six weeks' pace (${pace(S).toFixed(1)} a week). Counts units built, the way the dashboard does.` },
    { key: 'planner', name: 'Sam', role: 'Planner', frame: 'Schedule', confidence: 90,
      forecast: sc, says: `I've laid your plan out week by week. It finishes in week ${sc.week}.`,
      reasoning: 'Runs your plan through the stated rules: onboarding drag, coordination loss, the shift, inspection. Leaves out defects and the scope change.' },
    { key: 'veteran', name: 'Rui', role: 'Veteran project manager', frame: 'Records', confidence: 80,
      forecast: m, says: `Contracts run like yours landed around week ${m.week}, anywhere from ${m.low} to ${m.high}. That's what I'd say.`,
      reasoning: `Looks up the ${m.n} past contracts run like your plan (matched on ${m.rule}) and quotes their median and 10th–90th percentile.` },
    { key: 'quality', name: 'Priya', role: 'Quality lead', frame: 'Scenarios (rework)', confidence: 70,
      forecast: clampF({ week: rw, low: rw - 1, high: rw + 2, chance: rw <= R.deadline ? 50 : 15 }),
      says: `Last time the acceptance test bounced ${S.last.rejected} units. Allow for that and it's week ${rw}, could slip to ${rw + 2}.`,
      reasoning: `The Schedule plus a typical scope change, then rework like the last contract (${S.last.rejected} of ${R.scope} units rejected, double the work to fix late).` },
    { key: 'sales', name: 'Kim', role: 'Sales lead', frame: 'The deadline', confidence: 85,
      forecast: { week: R.deadline, low: R.deadline - 1, high: R.deadline + 1, chance: 70 }, says: `The customer needs it by week ${R.deadline}, and we told them we'd make it. Week ${R.deadline}.`,
      reasoning: 'Starts from the date the customer wants and what was promised. No model of the work at all.' },
  ];
}

/** Expert Panel: the same five, round 2, after seeing the round-1 median. Each moves halfway toward it. */
export function expertPanel(S, plan) {
  const r1 = teamChat(S, plan);
  const med = (xs) => q(xs, 0.5);
  const m = med(r1.map((x) => x.forecast.week));
  const r2 = r1.map((x) => {
    const shift = Math.round((m - x.forecast.week) / 2);
    const f = x.forecast;
    return { ...x, round2: clampF({ week: f.week + shift, low: f.low + shift, high: f.high + shift, chance: f.chance }) };
  });
  const forecast = clampF({ week: med(r2.map((x) => x.round2.week)), low: med(r2.map((x) => x.round2.low)), high: med(r2.map((x) => x.round2.high)), chance: med(r2.map((x) => x.round2.chance)) });
  return { forecast, round1Median: m, panel: r2 };
}

/**
 * Prediction Market: 200 simulated traders, each forecasting from one frame in the
 * mix the room forecast assumes (pace 45%, deadline 25%, a blend 20%, the record 10%).
 * A trader buys "delivered by week 12" if their own forecast is week 12 or earlier.
 * The price is the share who buy. Not computed from the scenario.
 */
export const MARKET_MIX = [['pace', 0.45], ['deadline', 0.25], ['blend', 0.2], ['record', 0.1]];
export function predictionMarket(S, traders = 200) {
  const R = S.rules, r = mulberry32(790);
  const ri = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const st = statusReport(S).forecast, all = records(S).all;
  const draw = {
    pace: () => ri(st.week, st.high + 1),
    deadline: () => R.deadline,
    blend: () => ri(R.deadline, R.deadline + 1),
    record: () => ri(all.week, all.week + 1),
  };
  const pool = MARKET_MIX.flatMap(([k, w]) => Array(Math.round(w * traders)).fill(k));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const points = pool.map((k) => ({ frame: k, week: draw[k]() }));
  let buys = 0;
  const chart = points.map((t, i) => { if (t.week <= R.deadline) buys++; return +(buys / (i + 1)).toFixed(3); });
  const price = buys / points.length;
  const weeks = points.map((t) => t.week);
  return {
    forecast: { week: q(weeks, 0.5), low: q(weeks, 0.1), high: q(weeks, 0.9), chance: Math.round(price * 100) },
    price: +price.toFixed(2), traders: points.length, volume: points.length, chart,
    byFrame: MARKET_MIX.map(([k]) => ({ frame: k, n: points.filter((t) => t.frame === k).length, buy: points.filter((t) => t.frame === k && t.week <= R.deadline).length })),
  };
}

/**
 * AI Assistant: given the Status Report and the stated plan as its context, and
 * nothing else. Its numbers are the Status Report's; the plan only colours the prose.
 */
export function aiAssistant(S, plan) {
  const R = S.rules, p = asPlan(plan), st = statusReport(S);
  const f = st.forecast;
  const planNote = p.crews > 0 ? ` Your plan adds ${p.crews} crew${p.crews > 1 ? 's' : ''}, which only adds capacity, so if anything there is room to spare.`
    : p.shift !== 'none' ? ' Your plan adds a second shift, which only adds output.' : ' Your plan keeps the line as it is, which keeps the risk low.';
  return {
    forecast: f,
    context: [`Status Report: ${st.pace} units a week, ${st.weeksAtPace} weeks to ${R.scope} units, status ${st.light}, SPI ${st.spi}`, `Stated plan: crews +${p.crews}, inspection ${Math.round(p.inspect * 100)}%, second shift ${p.shift}`],
    answer: `Based on the current status, the contract should be accepted in **week ${f.week}**, comfortably ahead of the week-${R.deadline} deadline. The line is producing ${st.pace} units a week against a plan of ${(R.scope / R.deadline).toFixed(1)}, a schedule performance index of ${st.spi}, so the project is green.${planNote} A reasonable range is weeks ${f.low}–${f.high}, and I'd put the chance of making week ${R.deadline} at about ${f.chance}%.`,
    basis: `I'm basing that on the two things in my context: the Status Report (${st.pace} units a week, so ${st.weeksAtPace} weeks of work) and your stated plan. I haven't seen the past contracts, the last contract's acceptance test, or anything about defects or scope changes. If those matter, I can't account for them.`,
  };
}

// ── The desk ─────────────────────────────────────────────────────────────────
/**
 * Every tab, in the briefing's order. `letter` is its one-character id in result
 * codes. `tone`: inside (blue), record (amber), people (violet: people and mixed).
 */
export const TABS = [
  { id: 'commit', letter: '', group: null, name: 'Your Plan and Prediction · Commit Before Week 1', short: 'Your Plan & Prediction', tone: 'front' },
  { id: 'status', letter: 'a', group: "The mind's own frames", name: 'Status Report', tone: 'inside', forecasts: true, sees: 'Units built each week', cant: 'Defects or scope changes' },
  { id: 'burndown', letter: 'b', group: "The mind's own frames", name: 'Sprint Burndown', tone: 'inside', forecasts: true, sees: 'Velocity over the last six weeks', cant: 'The same blind spots, in agile clothes' },
  { id: 'cost', letter: 'c', group: "The mind's own frames", name: 'Cost Management', tone: 'inside', forecasts: true, sees: 'Money: spend, burn rate, the credit line', cant: 'Defects, so you can watch every dollar and still be late' },
  { id: 'schedule', letter: 'd', group: "The mind's own frames", name: 'Schedule', tone: 'inside', forecasts: true, sees: 'Your plan, week by week, under the stated rules', cant: 'Defects or scope changes' },
  { id: 'lessons', letter: 'e', group: "The mind's own frames", name: 'Lessons Learned', tone: 'record', forecasts: true, sees: 'One real outcome', cant: "Whether you'll play like it" },
  { id: 'chat', letter: 'f', group: 'Other people', name: 'Team Chat', tone: 'people', forecasts: true, sees: 'Five colleagues, each from one frame', cant: 'Which one to believe' },
  { id: 'panel', letter: 'g', group: 'Other people', name: 'Expert Panel', tone: 'people', forecasts: true, sees: 'The same five after a second round', cant: 'Whether the group shares a bias' },
  { id: 'market', letter: 'h', group: 'Other people', name: 'Prediction Market', tone: 'people', forecasts: true, sees: "200 simulated traders' average", cant: "What the crowd doesn't know" },
  { id: 'ai', letter: 'i', group: 'Other people', name: 'AI Assistant', tone: 'people', forecasts: true, sees: 'What it was given: the Status Report and your plan', cant: "What it wasn't given" },
  { id: 'records', letter: 'j', group: 'Records and structured judgment', name: 'Records', tone: 'record', forecasts: true, sees: 'What actually happened, defects and scope changes included', cant: 'Plans no past manager tried' },
  { id: 'benchmark', letter: 'k', group: 'Records and structured judgment', name: 'Industry Benchmark', tone: 'record', forecasts: true, sees: 'A big sample', cant: 'This line: it is a different population' },
  { id: 'scenarios', letter: 'l', group: 'Records and structured judgment', name: 'Scenarios', tone: 'people', forecasts: true, sees: 'A wider range, on purpose', cant: 'Anything but your plan as the starting point' },
  { id: 'risks', letter: 'm', group: 'Records and structured judgment', name: 'Risk Register', tone: 'people', forecasts: false, sees: 'Each risk, one at a time', cant: 'Their sum' },
  { id: 'premortem', letter: 'n', group: 'Records and structured judgment', name: 'Premortem', tone: 'people', forecasts: false, sees: 'Your imagination', cant: 'Anything else' },
  { id: 'analytics', letter: 'o', group: 'Models', name: 'Analytics', tone: 'record', forecasts: true, sees: "The record's patterns", cant: 'Plans the record does not contain' },
  { id: 'simulator', letter: 'p', group: 'Models', name: 'Risk Simulator', tone: 'inside', forecasts: true, sees: 'Variability and scope changes', cant: 'Defects, so it is precise and early' },
  { id: 'consensus', letter: 'q', group: 'Models', name: 'Consensus', tone: 'people', forecasts: true, sees: 'The tabs you tick', cant: 'Anything you leave out' },
  { id: 'track', letter: 'r', group: 'Your own record', name: 'Your Track Record', tone: 'record', forecasts: false, sees: 'Your past forecasts on this device', cant: "Anything, if you haven't kept score" },
];
export const tabById = (id) => TABS.find((t) => t.id === id);
export const tabByLetter = (l) => TABS.find((t) => t.letter && t.letter === l);

/** The forecasts the Consensus tab can combine, and the sweep checks. Each is a function of (screen, plan). */
export const FORECASTERS = {
  status: (S) => statusReport(S).forecast,
  burndown: (S) => sprintBurndown(S).forecast,
  cost: (S, p) => costManagement(S, p).forecast,
  schedule: (S, p) => schedule(S, p).forecast,
  lessons: (S) => lessonsLearned(S).forecast,
  panel: (S, p) => expertPanel(S, p).forecast,
  market: (S) => predictionMarket(S).forecast,
  ai: (S, p) => aiAssistant(S, p).forecast,
  'records-all': (S) => records(S).all,
  'records-plan': (S, p) => records(S, p).matched,
  benchmark: (S) => industryBenchmark(S).forecast,
  scenarios: (S, p) => scenarios(S, p).forecast,
  analytics: (S, p) => analytics(S, p).forecast,
  simulator: (S, p) => riskSimulator(S, p).forecast,
};
export const FORECASTER_NAMES = {
  status: 'Status Report', burndown: 'Sprint Burndown', cost: 'Cost Management', schedule: 'Schedule', lessons: 'Lessons Learned', panel: 'Expert Panel', market: 'Prediction Market',
  ai: 'AI Assistant', 'records-all': 'Records, all 40', 'records-plan': 'Records, like my plan', benchmark: 'Industry Benchmark', scenarios: 'Scenarios',
  analytics: 'Analytics', simulator: 'Risk Simulator',
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
