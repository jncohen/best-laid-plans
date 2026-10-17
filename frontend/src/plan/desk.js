/**
 * The Decision Desk: the tools a project office uses, each computing a forecast from
 * what the briefing shows and nothing else.
 *
 * Every tool takes `screen` (from screenData(): the line's last six weeks, the last
 * contract's story, the 40 past contracts, the disclosed rules), the stated plan and,
 * during play, `live` (from liveScreen(): the dashboard and each week's decisions and
 * events, copied field by field). Nothing here builds a Project or reads a scenario
 * code, so no tool can know the scenario's hidden draws; tools/test-plan.mjs checks this.
 *
 * The tools compute honestly. The inside-view ones are early because they cannot see
 * defects or the scope change, and each one says so on its face.
 */
import { CONFIG, lastContract, pastContracts, matchContracts, summarizeContracts, normalizePlan, recordWeek } from './engine.js';

// ── What the screen shows ────────────────────────────────────────────────────
const DISCLOSED = ['scope', 'deadline', 'horizon', 'crews', 'budget', 'creditLine', 'maxCrews', 'maxHirePerWeek', 'coordinationLoss', 'crewWeek', 'hireFee',
  'releaseFee', 'shiftPremiumPerCrew', 'onboardingWeeks', 'onboardingFactor', 'onboardingDrag', 'shiftBoost', 'inspectionOptions', 'lateFixMultiplier',
  'crewOutChance', 'crewOutWeeks', 'crewOutWeekRange', 'delayChance', 'delayShare', 'delayWeekRange'];

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
 * What the play screen shows, week by week: the dashboard (reported progress, units
 * left, crews, budget), each week's decisions and its event lines. Copied field by
 * field so nothing else on a project can reach a tool.
 */
const LIVE_ROW = ['week', 'crews', 'shift', 'inspect', 'built', 'found', 'rejected', 'shock', 'cost', 'budget', 'backlog', 'reported', 'events'];
export function liveScreen(p) {
  if (!p || !p.history || p.history.length === 0) return null;
  const rows = p.history.map((h) => Object.freeze(Object.fromEntries(LIVE_ROW.map((k) => [k, k === 'events' ? [...h.events] : h[k]]))));
  return Object.freeze({ week: p.week, crews: p.crews, onboarding: p.onboarding > 0, backlog: p.backlog, totalScope: p.totalScope, budget: p.budget, spent: p.spent, rows });
}
export const LIVE_FIELDS = ['week', 'crews', 'onboarding', 'backlog', 'totalScope', 'budget', 'spent', 'rows'];
export const LIVE_ROW_FIELDS = LIVE_ROW;

/** Units built per crew-week so far, from the dashboard and the stated rules (the briefing's pace before week 1). */
function observedPerCrew(S, L) {
  const R = S.rules;
  if (!L) return pace(S) / R.crews;
  let built = 0, effort = 0;
  L.rows.forEach((r, i) => {
    const prev = i ? L.rows[i - 1].crews : R.crews, prev2 = i > 1 ? L.rows[i - 2].crews : R.crews;
    const onboarding = r.crews > prev || (i > 0 && prev > prev2);
    // A finishing, bankrupt or disturbed week (a crew out, a parts delay) says little about the rate.
    const disturbed = r.events.some((e) => /crew is out|parts delay/.test(e)) || (i > 0 && L.rows[i - 1].events.some((e) => /crew is out/.test(e)));
    if (r.built <= 0 || r.backlog < 0.5 || disturbed) return;
    const added = Math.max(0, r.crews - prev, prev - prev2);
    const crewsAtWork = onboarding && R.onboardingDrag === 'new' ? r.crews - added * (1 - R.onboardingFactor) : r.crews;
    built += r.built;
    effort += crewsAtWork * (1 - R.coordinationLoss * Math.max(0, r.crews - R.crews)) * (1 - r.inspect) * (onboarding && R.onboardingDrag !== 'new' ? R.onboardingFactor : 1) * (r.shift ? R.shiftBoost : 1);
  });
  return effort > 0 ? built / effort : pace(S) / R.crews;
}

const scopeSeen = (L) => !!L && L.rows.some((r) => r.shock > 0);
const rejectedSoFar = (L) => (L ? L.rows.reduce((a, r) => a + r.rejected, 0) : 0);
const foundSoFar = (L) => (L ? L.rows.reduce((a, r) => a + r.found, 0) : 0);

/**
 * The plan run week by week under the stated rules: onboarding drag, coordination
 * loss, the shift boost, the share of the line inspecting. No defects (the briefing
 * gives no rate) and, unless given one, no scope change. With `live`, it re-plans
 * from the current week: the units left, the crews on the line, the rate seen so
 * far, and any crews the plan still has to add.
 */
export function planModel(S, plan, { noise = () => 1, scope = null, trace = false, live = null } = {}) {
  const R = S.rules, p = asPlan(plan), perCrew = observedPerCrew(S, live);
  let left = live ? live.backlog : R.scope, crews = live ? live.crews : R.crews, onboard = live && live.onboarding ? 1 : 0, w = live ? live.week : 0, adding = 0;
  const add = live ? Math.max(0, p.crews - (live.crews - R.crews)) : p.crews;
  const start = w;
  const weeks = [];
  while (left > 0.5 && w < 40) {
    w++;
    if (w === start + 1 && add > 0) { adding = Math.min(add, R.maxHirePerWeek, R.maxCrews - crews); crews += adding; onboard = R.onboardingWeeks; }
    const shift = shiftIn(p, w);
    const atWork = R.onboardingDrag === 'new' && onboard > 0 ? crews - adding * (1 - R.onboardingFactor) : crews;
    const cap = atWork * perCrew * (1 - R.coordinationLoss * Math.max(0, crews - R.crews)) * (R.onboardingDrag !== 'new' && onboard > 0 ? R.onboardingFactor : 1) * (shift ? R.shiftBoost : 1) * noise();
    left -= cap * (1 - p.inspect);
    if (scope && w === scope.week) left += scope.units;
    if (trace) weeks.push({ week: w, crews, onboarding: onboard > 0, shift, built: cap * (1 - p.inspect), left: Math.max(0, left) });
    if (onboard > 0) onboard--;
  }
  return trace ? { week: w, weeks, start } : w;
}

// ── The mind's own frames ────────────────────────────────────────────────────
/**
 * Status Report: an earned-value report. Before week 1 it reports on the line's last
 * six weeks; during play, on this contract to date. Earned value is the share of the
 * work reported complete; the schedule forecast is the EVM estimate at completion,
 * planned duration ÷ SPI, with a range from the SPI of each week to date. It runs
 * early only because "earned" counts units built, not units that will pass.
 */
export function statusReport(S, L = null, plan = null) {
  const R = S.rules;
  const weekly = L
    ? L.rows.map((r) => { const spi = r.reported / (r.week / R.deadline); return { week: r.week, spi, eac: R.deadline / Math.max(0.05, spi) }; })
    : (() => { let cum = 0; return S.history.map((b, i) => { cum += b; const spi = (cum / R.scope) / ((i + 1) / R.deadline); return { week: i + 1, spi, eac: R.deadline / spi }; }); })();
  const last = weekly[weekly.length - 1];
  const wk = last.week;
  const earnedPct = L ? L.rows[L.rows.length - 1].reported : S.history.reduce((a, b) => a + b, 0) / R.scope;
  const plannedPct = Math.min(1, wk / R.deadline);
  // Earned value against the cost baseline: the last contract's crews over the planned 12 weeks, or the student's own plan.
  const bac = L ? costBaseline(S, plan) : R.crews * R.crewWeek * R.deadline;
  const ev = earnedPct * bac, pv = plannedPct * bac, ac = L ? L.spent : wk * R.crews * R.crewWeek;
  const eacs = weekly.map((x) => Math.max(x.eac, L ? wk + 0.5 : 0));
  const eac = Math.max(last.eac, L ? wk + 0.5 : 0);
  return {
    forecast: clampF({ week: Math.round(eac), low: Math.floor(Math.min(...eacs)), high: Math.ceil(Math.max(...eacs)), chance: eac <= R.deadline - 0.5 ? 90 : eac <= R.deadline ? 60 : 20 }),
    live: !!L, pace: +pace(S).toFixed(1), weeksAtPace: +(R.scope / pace(S)).toFixed(1), eacWeeks: +eac.toFixed(1), weekly,
    earnedPct, plannedPct, weeksShown: wk, built: earnedPct * R.scope, planned: plannedPct * R.scope,
    spi: +last.spi.toFixed(2), cpi: +(ev / ac).toFixed(2), bac, light: ev >= pv ? 'green' : ev >= 0.9 * pv ? 'amber' : 'red',
  };
}

/**
 * Cost Management: spend against the budget and the credit line. Before week 1, the
 * stated plan's planned spend; during play, actual spend to date and the burn from
 * here. Earned-value terms: BAC is the budget, EAC the cost at the Schedule's finish,
 * CPI = BAC / EAC. Money only: it cannot see defects, so the schedule it implies is
 * the Schedule's.
 */
/** The plan's cost baseline (BAC): what the stated plan costs if it runs as the Schedule says from week 0. */
export function costBaseline(S, plan) {
  const R = S.rules, p = asPlan(plan), weeks = planModel(S, p), crews = R.crews + p.crews;
  let total = p.crews * R.hireFee;
  for (let w = 1; w <= weeks; w++) total += crews * R.crewWeek + (shiftIn(p, w) ? crews * R.shiftPremiumPerCrew : 0);
  return total;
}

export function costManagement(S, plan, L = null) {
  const R = S.rules, p = asPlan(plan);
  const sc = schedule(S, p, L).forecast;
  const from = L ? L.week : 0;
  const add = L ? Math.max(0, p.crews - (L.crews - R.crews)) : p.crews;
  const crews = Math.min(R.maxCrews, (L ? L.crews : R.crews) + add);
  const weekCost = (w) => crews * R.crewWeek + (shiftIn(p, w) ? crews * R.shiftPremiumPerCrew : 0) + (w === from + 1 ? add * R.hireFee : 0);
  const burn = L ? L.rows.map((r) => ({ week: r.week, spent: R.budget - r.budget, actual: true })) : [];
  let total = L ? L.spent : 0;
  for (let w = from + 1; w <= R.horizon; w++) { total += weekCost(w); burn.push({ week: w, spent: total }); }
  const limit = R.budget + R.creditLine;
  const broke = burn.find((b) => !b.actual && b.spent > limit);
  const toFinish = (burn.find((b) => b.week === Math.min(Math.max(sc.week, from), R.horizon)) || burn[burn.length - 1]).spent;
  const spent = L ? L.spent : 0;
  // Earned value against the plan's cost baseline: CPI = EV / AC, EAC = BAC / CPI (BAC before any spend).
  const bac = costBaseline(S, p);
  const earned = L ? L.rows[L.rows.length - 1].reported : 0;
  const cpi = L && spent > 0 ? (earned * bac) / spent : 1;
  const eac = L ? bac / Math.max(0.05, cpi) : bac;
  const lines = [
    { label: L ? 'Spent to date' : 'Crews', amount: L ? spent : crews * R.crewWeek * sc.week },
    { label: L ? 'Still to spend, to the Schedule\'s finish' : 'Hiring fees', amount: L ? toFinish - spent : p.crews * R.hireFee },
  ];
  if (!L) lines.push({ label: 'Second-shift premium', amount: toFinish - crews * R.crewWeek * sc.week - p.crews * R.hireFee });
  const steady = weekCost(Math.max(from + 2, sc.week));
  return {
    forecast: sc, cost: { eac, bac, vac: bac - eac, cpi: +cpi.toFixed(2), toFinish }, live: !!L, spent, week: from,
    burn, lines, budget: R.budget, creditLine: R.creditLine, limit, onBudget: eac <= R.budget, headroom: R.budget - eac, headroomCredit: limit - eac,
    brokeWeek: broke ? broke.week : null, runwayWeeks: +Math.max(0, (limit - spent) / steady).toFixed(1), perWeek: steady,
  };
}

/** Schedule: the plan, week by week, re-planned from the current week during play. No defects, no scope change. */
export function schedule(S, plan, L = null) {
  const R = S.rules;
  const m = planModel(S, plan, { trace: true, live: L });
  const week = Math.max(m.week, m.start + 1);
  return { forecast: clampF({ week, low: Math.max(m.start + 1, week - 1), high: week + 1, chance: week <= R.deadline - 1 ? 90 : week <= R.deadline ? 70 : 20 }), weeks: m.weeks, from: m.start };
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
        R.onboardingDrag === 'new' ? `Every hire: new crews work at ${Math.round(R.onboardingFactor * 100)}% for their first ${R.onboardingWeeks} weeks.` : `Every hire: the whole line runs at ${Math.round(R.onboardingFactor * 100)}% for ${R.onboardingWeeks} weeks.`, p.crews > 0),
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
 * Off, it is the plan alone: precise and early. During play it starts from the
 * current reported state; a scope change already seen is not drawn again, and once
 * the acceptance test has run, its rework is in the units left and no slip is added.
 */
export function historicalSlips(S, plan) {
  const p = asPlan(plan);
  const like = S.contracts.filter((c) => (c.inspect > 0) === (p.inspect > 0));
  return (like.length >= 5 ? like : S.contracts).map((c) => {
    const own = { crews: c.crewsAdded, inspect: c.inspect, shift: c.shiftWeeks > 0 ? 'late' : 'none' };
    return recordWeek(c) - planModel(S, own, { scope: { week: c.scopeWeek, units: c.scopeUnits } });
  });
}

export function riskSimulator(S, plan, { rework = true, runs = 1000, live = null } = {}) {
  const R = S.rules, r = mulberry32(42), p = asPlan(plan);
  const from = live ? live.week : 0;
  const scopes = scopeSeen(live) ? [] : S.contracts.filter((c) => c.scopeWeek > from).map((c) => ({ week: c.scopeWeek, units: c.scopeUnits }));
  const tested = rejectedSoFar(live) > 0;
  const slips = historicalSlips(S, p);
  const relSd = sd(S.history) / pace(S);
  const sims = Array.from({ length: runs }, () => {
    const w = planModel(S, p, { noise: () => 1 + relSd * (r() + r() + r() - 1.5) * 2, scope: scopes.length ? scopes[Math.floor(r() * scopes.length)] : null, live });
    const slip = rework && !tested ? slips[Math.floor(r() * slips.length)] : 0;
    return Math.max(w, Math.round(w + slip));
  });
  const hist = {};
  for (const w of sims) hist[w] = (hist[w] || 0) + 1;
  return {
    forecast: { week: q(sims, 0.5), low: q(sims, 0.1), high: q(sims, 0.9), chance: Math.round((100 * sims.filter((x) => x <= R.deadline).length) / sims.length) },
    runs, hist, rework, live: !!live, tested, slips: { n: slips.length, median: q(slips, 0.5), low: q(slips, 0.1), high: q(slips, 0.9) }, p: { 10: q(sims, 0.1), 50: q(sims, 0.5), 80: q(sims, 0.8), 90: q(sims, 0.9) },
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
 * from the briefing and, during play, from the dashboard and this week's events.
 * The order puts the record's voice fourth. Confidence is how sure each says they are.
 */
export function teamChat(S, plan, L = null) {
  const R = S.rules, p = asPlan(plan);
  const all = records(S).all, m = records(S, p).matched, sc = schedule(S, p, L).forecast;
  const now = L ? L.week : 0;
  const recent = L ? L.rows.slice(-3).filter((r) => r.built > 0) : [];
  const v = recent.length ? mean(recent.map((r) => r.built)) : pace(S);
  const left = L ? L.backlog : R.scope;
  const atPace = now + Math.max(1, Math.ceil(left / Math.max(1, v)));
  const gap = S.last.deliveredWeek - S.last.dashboardFullWeek;
  const rejected = Math.round(rejectedSoFar(L)), found = Math.round(foundSoFar(L));
  const spread = Math.round((all.high - all.low) / 2);
  const yours = m.week !== all.week ? ` The ones run like yours came in around week ${m.week}.` : '';
  const lastRow = L ? L.rows[L.rows.length - 1] : null;
  const scopeNews = lastRow && lastRow.shock > 0 ? ` The customer just added ${lastRow.shock} units.` : '';

  let priya;
  if (rejected > 0) {
    const fix = Math.max(1, Math.ceil(left / Math.max(1, v)));
    priya = { forecast: clampF({ week: now + fix, low: now + fix, high: now + fix + 2, chance: now + fix <= R.deadline ? 50 : 10 }),
      says: `Acceptance bounced ${rejected} unit${rejected === 1 ? '' : 's'}. Fixing ${rejected === 1 ? 'it' : 'them'} that late is double the work: about ${word(fix)} more week${fix === 1 ? '' : 's'} at this pace.`,
      reasoning: `The ${Math.round(left)} units now left, at the ${v.toFixed(1)} a week built lately.` };
  } else {
    const rw = p.inspect > 0 ? Math.max(1, Math.round(gap / 2)) : gap;
    priya = { forecast: clampF({ week: sc.week + rw, low: sc.week + rw - 1, high: sc.week + rw + 2, chance: sc.week + rw <= R.deadline ? 50 : 15 }),
      says: `${found > 0 ? `${lastRow && lastRow.inspect > 0 ? `Inspection found ${Math.round(lastRow.found)} last week, ${Math.round((100 * lastRow.found) / Math.max(1, lastRow.built))}% of what we built. ` : ''}We've caught ${found} bad unit${found === 1 ? '' : 's'} so far. ` : ''}Last time ${S.last.rejected} units bounced at acceptance, and it took ${word(gap)} more weeks after the dashboard said done. Budget ${gap > 1 ? `${word(gap - 1)} or ${word(gap)}` : word(gap)} weeks for rework${p.inspect > 0 ? ', maybe half that if you keep inspecting' : ''}.`,
      reasoning: `The plan from here (week ${sc.week}) plus the rework the last contract needed after its dashboard read 100% (${gap} weeks${p.inspect > 0 ? ', halved for inspection' : ''}).` };
  }
  return [
    { key: 'supervisor', name: 'Dana', role: 'Line supervisor', frame: 'The pace', confidence: 65, forecast: { week: atPace, low: Math.max(now + 1, atPace - 1), high: atPace + 1, chance: atPace <= R.deadline ? 75 : 30 },
      says: L
        ? `We built ${Math.round(lastRow.built)} last week, about ${observedPerCrew(S, L).toFixed(1)} a crew; the last contract did ${(pace(S) / R.crews).toFixed(1)}.${scopeNews} At this pace that's ${word(atPace - now)} more week${atPace - now === 1 ? '' : 's'}: week ${atPace}, if nothing goes wrong.`
        : `At this pace, ${word(atPace)} weeks, if nothing goes wrong.`,
      reasoning: `${Math.round(left)} units left at ${v.toFixed(1)} a week${L ? ' (the last few weeks built)' : " (the last six weeks' pace)"}.` },
    { key: 'planner', name: 'Sam', role: 'Planner', frame: 'The plan on paper', confidence: 70, forecast: sc,
      says: L ? `Re-planned from here, your plan finishes in week ${sc.week}.` : `On paper your plan finishes in week ${sc.week}. That's before any surprises.`,
      reasoning: `Your plan week by week under the stated rules${L ? ', from the units left and the rate so far' : ''}: onboarding, coordination, shift, inspection. No defects or scope change.` },
    { key: 'sales', name: 'Kim', role: 'Sales lead', frame: 'The promise', confidence: 60, forecast: { week: Math.max(R.deadline, now + 1), low: Math.max(R.deadline - 1, now + 1), high: Math.max(R.deadline + 1, now + 2), chance: now < R.deadline ? 70 : 0 },
      says: now >= R.deadline ? `We're past week ${R.deadline}. The customer calls every day.` : L ? `We promised week ${R.deadline}. The customer asked how it's going.` : `We promised week ${R.deadline}.`,
      reasoning: 'What the customer was told.' },
    { key: 'veteran', name: 'Mabel', role: 'Veteran on the line', frame: 'The record', confidence: 80, forecast: { week: Math.max(m.week, now + 1), low: Math.max(m.low, now + 1), high: Math.max(m.high, now + 1), chance: m.chance },
      says: `Twenty-odd years on this line. These take about ${word(all.week)} weeks, give or take ${spread <= 2 ? 'a couple' : word(spread)}. I've seen maybe ${inWords(all.chance / 100)} make ${word(R.deadline)}.${yours}`,
      reasoning: `The record of ${S.contracts.length} contracts: median week ${all.week}, most between ${all.low} and ${all.high}, ${all.chance}% on time. For your plan, the ${m.n} run like it: week ${m.week} (${m.low}–${m.high}).` },
    { key: 'quality', name: 'Priya', role: 'Quality lead', frame: rejected > 0 ? 'The acceptance test' : 'Rework, from the last contract', confidence: 70, ...priya },
  ];
}

const pct = (x) => `${Math.round(x * 100)}%`;
const k$ = (n) => (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n / 1000)}k`);

/**
 * Ask an AI: a plain-text prompt with everything on screen, for the student to paste
 * into whatever assistant they use. It asks for a forecast and the reasoning, and
 * says nothing about which information matters.
 */
export function aiPrompt(S, plan, L = null, opened = null) {
  const R = S.rules, p = asPlan(plan);
  // The contract and its rules always; then only what the student has looked at (null: everything).
  const has = (id) => opened === null || opened.includes(id);
  const c = S.contracts;
  const planText = `${p.crews ? `add ${p.crews} crew${p.crews > 1 ? 's' : ''} at the start` : 'add no crews'}, ${p.inspect ? `${pct(p.inspect)} of the line on inspection` : 'no inspection'}, ${p.shift === 'none' ? 'no second shift' : p.shift === 'late' ? 'a second shift in the late weeks (9–11)' : 'a second shift every week'}`;
  const row = (r) => [r.id, r.crewsAdded, r.hires.map((h) => h.week).join('/') || '-', Math.round(r.inspect * 100), r.shiftWeeks, r.scopeWeek, r.scopeUnits, r.dashboardFullWeek, r.rejected, r.delivered ? r.accepted : r.bankrupt ? `bankrupt wk${r.endedWeek}` : `terminated wk${r.endedWeek}`].join(',');
  const lines = [
    'I am managing a production contract and need a forecast. Here is what I know.',
    '',
    'CONTRACT',
    `- Build ${R.scope} units. The customer wants them by week ${R.deadline}. I start with ${R.crews} crews and a budget of ${k$(R.budget)}.`,
    `- The contract is done when the customer's acceptance test passes every unit. If it has not passed by the end of week ${R.horizon}, the customer terminates the contract.`,
    '- Customers on this line add to the requirement once, partway through, at a week and by an amount not known in advance.',
    '- Some built units turn out defective. The progress dashboard counts them complete until inspection or the acceptance test finds them.',
    '',
    'RULES',
    `- Each crew costs ${k$(R.crewWeek)} a week. Adding a crew costs ${k$(R.hireFee)} (up to ${R.maxHirePerWeek} a week, ${R.maxCrews} crews at most); releasing one costs ${k$(R.releaseFee)}.`,
    `- ${R.onboardingDrag === 'new' ? `New crews work at ${pct(R.onboardingFactor)} for their first ${R.onboardingWeeks} weeks.` : `A new crew slows the whole line to ${pct(R.onboardingFactor)} for ${R.onboardingWeeks} weeks.`} Each crew beyond ${R.crews} makes every crew ${pct(R.coordinationLoss)} less productive.`,
    ...(R.crewOutChance > 0 || R.delayChance > 0 ? [`- About ${pct(R.crewOutChance)} of contracts lose a crew for ${R.crewOutWeeks} weeks (still paid), starting in weeks ${R.crewOutWeekRange[0]}–${R.crewOutWeekRange[1]}. About ${pct(R.delayChance)} hit a parts delay idling ${pct(R.delayShare)} of the line for a week, in weeks ${R.delayWeekRange[0]}–${R.delayWeekRange[1]}.`] : []),
    '- Contracts differ in how fast the line builds and how many defects it turns out.',
    `- Second shift: +${pct(R.shiftBoost - 1)} output for ${k$(R.shiftPremiumPerCrew)} per crew per week. From the second straight week, tired crews make more defects.`,
    `- Inspection: move 0–30% of the line from building to checking. Defects found early cost one unit to fix; any the acceptance test finds cost ${R.lateFixMultiplier}× to fix.`,
    `- The company can overspend the budget by up to ${k$(R.creditLine)} on credit. If a week's payroll would go past that, it goes bankrupt and the contract ends.`,
  ];
  const header = 'id,crews_added,hire_weeks,inspection_pct,second_shift_weeks,scope_change_week,scope_change_units,dashboard_100pct_week,units_rejected,accepted_week';
  if (has('last5')) {
    lines.push('', `THIS LINE'S LAST CONTRACT (#${c[c.length - 1].id}; same line, same ${R.crews} crews)`,
      `- Units completed each week on its dashboard, weeks 1–${S.history.length}: ${S.history.map((v) => v.toFixed(1)).join(', ')}.`,
      `- Its dashboard read 100% in week ${S.last.dashboardFullWeek}; it was accepted in week ${S.last.deliveredWeek}; ${S.last.rejected} units were rejected at acceptance.`);
    if (!has('records')) lines.push('', 'THE LAST 5 CONTRACTS ON THIS LINE (oldest first)', header, ...c.slice(-5).map(row));
  }
  if (has('records')) lines.push('', `PAST CONTRACTS ON THIS LINE (oldest first; #${c[c.length - 1].id} is the latest)`, header, ...c.map(row));
  if (has('status')) {
    const st = statusReport(S, L, p);
    lines.push('', `STATUS REPORT (earned value${L ? `, week ${st.weeksShown} of this contract` : ", the last contract's first six weeks"})`,
      `- Earned ${pct(st.earnedPct)} vs planned ${pct(st.plannedPct)}; SPI ${st.spi}; CPI ${st.cpi}; status ${st.light}; estimate at completion week ${st.eacWeeks}.`);
  }
  if (has('cost')) {
    const cm = costManagement(S, p, L);
    lines.push('', 'COST MANAGEMENT', `- Plan cost baseline ${k$(cm.cost.bac)}; estimate at completion ${k$(cm.cost.eac)}; CPI ${cm.cost.cpi}; spent ${k$(cm.spent)}; headroom to budget ${k$(cm.headroom)}, with the credit line ${k$(cm.headroomCredit)}; cash runway ${cm.runwayWeeks} weeks.`);
  }
  if (has('schedule')) { const sc = schedule(S, p, L); lines.push('', 'SCHEDULE', `- Planned finish week ${sc.forecast.week}${L ? `, re-planned from week ${sc.from}` : ''}.`); }
  if (has('chat')) lines.push('', 'TEAM CHAT ("When will we be done?")', ...teamChat(S, p, L).map((x) => `- ${x.name} (${x.role.toLowerCase()}): ${x.says}`));
  if (has('scenarios')) lines.push('', 'SCENARIOS', ...scenarios(S, p).rows.map((r) => `- ${r.label}: week ${r.week}. ${r.assumptions}`));
  if (has('risks')) lines.push('', 'RISK REGISTER', ...riskRegister(S, p).risks.filter((x) => x.applies).map((x) => `- ${x.title}: ${x.note}`));
  if (has('analytics')) { const a = analytics(S, p); lines.push('', 'ANALYTICS', `- Regression of week accepted on the plan across the ${a.n} past contracts: predicted week ${a.predicted} for this plan, 80% interval weeks ${a.forecast.low}–${a.forecast.high}.`); }
  if (has('simulator')) { const m = riskSimulator(S, p, { live: L }); lines.push('', 'RISK SIMULATOR (1,000 runs, with historical rework)', `- P10 week ${m.p[10]}, P50 week ${m.p[50]}, P90 week ${m.p[90]}.`); }
  lines.push('', `MY PLAN: ${planText}.`);
  if (L) {
    const lastRow = L.rows[L.rows.length - 1];
    lines.push('', `STATUS AFTER WEEK ${L.week}`,
      `- Dashboard: ${pct(lastRow.reported)} reported complete; ${Math.round(L.backlog)} units left of ${L.totalScope}; ${L.crews} crews${L.onboarding ? ' (new crews still onboarding)' : ''}; spent ${k$(L.spent)}, budget left ${k$(L.budget)}.`,
      'week,units_built,crews,inspection_pct,second_shift,defects_found,units_rejected_at_acceptance,scope_added,crew_out,parts_delay,reported_complete_pct',
      ...L.rows.map((r) => [r.week, Math.round(r.built), r.crews, Math.round(r.inspect * 100), r.shift ? 'yes' : 'no', Math.round(r.found), Math.round(r.rejected), r.shock,
        r.events.some((e) => /crew is out/.test(e)) ? 'yes' : 'no', r.events.some((e) => /parts delay/.test(e)) ? 'yes' : 'no', Math.round(r.reported * 100)].join(',')));
  }
  lines.push('', `Please give a forecast of the week the customer accepts the contract, an 80% range, and the chance of making week ${R.deadline}, with your reasoning.`);
  return lines.join('\n');
}

// ── The desk ─────────────────────────────────────────────────────────────────
/**
 * Every tab, in the briefing's order. `letter` is its one-character id in result
 * codes. `tone`: inside (blue), record (amber), people (violet: people and mixed).
 */
export const TABS = [
  { id: 'commit', letter: '', group: null, name: 'Your Plan and Prediction · Commit Before Week 1', short: 'Your Plan & Prediction', tone: 'front' },
  { id: 'contract', letter: 'b', group: 'The Brief', name: 'The Contract', tone: 'brief', forecasts: false, sees: 'The contract, every rule and both scores', cant: 'How long it will take' },
  { id: 'status', letter: 'a', group: 'Dashboards', name: 'Status Report', tone: 'inside', forecasts: true, sees: 'Earned value: units reported complete against plan', cant: 'Whether those units will pass acceptance' },
  { id: 'cost', letter: 'c', group: 'Dashboards', name: 'Cost Management', tone: 'inside', forecasts: true, sees: 'Money: spend, burn rate, the credit line', cant: 'Defects, so you can watch every dollar and still be late' },
  { id: 'schedule', letter: 'd', group: 'Dashboards', name: 'Schedule', tone: 'inside', forecasts: true, sees: 'Your plan, week by week, under the stated rules', cant: 'Defects or scope changes' },
  { id: 'chat', letter: 'f', group: 'People', name: 'Team Chat', tone: 'people', forecasts: true, sees: 'Five colleagues, each from where they sit', cant: 'Which view to weigh most' },
  { id: 'ai', letter: 'i', group: 'People', name: 'Ask an AI', tone: 'people', forecasts: false, sees: 'Whatever you paste in: this prompt holds everything on screen', cant: 'Anything not on screen' },
  { id: 'last5', letter: 'e', group: 'History', name: 'Last 5 Contracts', tone: 'record', forecasts: true, sees: 'The five newest contracts, and the story of the last one', cant: 'Whether five is enough' },
  { id: 'records', letter: 'j', group: 'History', name: 'Records', tone: 'record', forecasts: true, sees: 'What actually happened, defects and scope changes included', cant: 'Plans no past manager tried' },
  { id: 'scenarios', letter: 'l', group: 'History', name: 'Scenarios', tone: 'people', forecasts: true, sees: 'A wider range, on purpose', cant: 'Anything but your plan as the starting point' },
  { id: 'risks', letter: 'm', group: 'History', name: 'Risk Register', tone: 'people', forecasts: false, sees: 'Each risk, one at a time, and your own premortem', cant: 'Their sum' },
  { id: 'analytics', letter: 'o', group: 'Models', name: 'Analytics', tone: 'record', forecasts: true, sees: "The record's patterns", cant: 'Plans the record does not contain' },
  { id: 'simulator', letter: 'p', group: 'Models', name: 'Risk Simulator', tone: 'people', forecasts: true, sees: 'Variability, scope changes and, if switched on, rework from the record', cant: 'Anything its switches leave out' },
  { id: 'consensus', letter: 'q', group: 'Models', name: 'Consensus', tone: 'people', forecasts: true, sees: 'The tabs you tick', cant: 'Anything you leave out' },
  { id: 'track', letter: 'r', group: 'Your Record', name: 'Your Track Record', tone: 'record', forecasts: false, sees: 'Your past forecasts on this device', cant: "Anything, if you haven't kept score" },
];
export const tabById = (id) => TABS.find((t) => t.id === id);
export const tabByLetter = (l) => TABS.find((t) => t.letter && t.letter === l);

/** The forecasts the Consensus tab can combine, and the sweep checks. Each is a function of (screen, plan). */
export const FORECASTERS = {
  status: (S, p, L) => statusReport(S, L, p).forecast,
  cost: (S, p, L) => costManagement(S, p, L).forecast,
  schedule: (S, p, L) => schedule(S, p, L).forecast,
  last5: (S) => lastFive(S).forecast,
  'records-all': (S) => records(S).all,
  'records-plan': (S, p) => records(S, p).matched,
  scenarios: (S, p) => scenarios(S, p).forecast,
  analytics: (S, p) => analytics(S, p).forecast,
  simulator: (S, p, L) => riskSimulator(S, p, { live: L }).forecast,
  'simulator-blind': (S, p, L) => riskSimulator(S, p, { rework: false, live: L }).forecast,
};
export const FORECASTER_NAMES = {
  status: 'Status Report', cost: 'Cost Management', schedule: 'Schedule', last5: 'Last 5 Contracts',
  'records-all': 'Records, all 40', 'records-plan': 'Records, like my plan', scenarios: 'Scenarios', analytics: 'Analytics',
  simulator: 'Risk Simulator (with rework)', 'simulator-blind': 'Risk Simulator (rework off)',
};

/** Consensus: the average of the ticked forecasters. */
export function consensus(S, plan, keys, L = null) {
  const fs = keys.map((k) => FORECASTERS[k]?.(S, plan, L)).filter(Boolean);
  if (!fs.length) return { forecast: null, used: [] };
  const avg = (k) => Math.round(mean(fs.map((f) => f[k])));
  return { forecast: clampF({ week: avg('week'), low: avg('low'), high: avg('high'), chance: avg('chance') }), used: keys };
}

/** Every forecaster's numbers for a plan, for the reveal's "how each tool would have done". */
export function allForecasts(S, plan, L = null) {
  const out = Object.entries(FORECASTERS).map(([k, f]) => ({ key: k, name: FORECASTER_NAMES[k], ...f(S, plan, L) }));
  for (const c of teamChat(S, plan, L)) out.push({ key: `chat-${c.key}`, name: `Team Chat: ${c.name}, ${c.role.toLowerCase()}`, ...c.forecast });
  return out;
}
