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
import { CONFIG, lastContract, pastContracts, matchContracts, summarizeContracts, normalizePlan, failuresLine } from './engine.js';

// ── What the screen shows ────────────────────────────────────────────────────
const DISCLOSED = ['scope', 'deadline', 'horizon', 'crews', 'budget', 'creditLine', 'maxCrews', 'maxHirePerWeek', 'coordinationLoss', 'crewWeek', 'hireFee',
  'releaseFee', 'shiftPremiumPerCrew', 'onboardingWeeks', 'onboardingFactor', 'onboardingDrag', 'shiftBoost', 'inspectionOptions', 'lateFixMultiplier'];

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
    // A finishing or bankrupt week says little about the rate.
    if (r.built <= 0 || r.backlog < 0.5) return;
    const added = Math.max(0, r.crews - prev, prev - prev2);
    const crewsAtWork = onboarding && R.onboardingDrag === 'new' ? r.crews - added * (1 - R.onboardingFactor) : r.crews;
    built += r.built;
    effort += crewsAtWork * (1 - R.coordinationLoss * Math.max(0, r.crews - R.crews)) * (1 - r.inspect) * (onboarding && R.onboardingDrag !== 'new' ? R.onboardingFactor : 1) * (r.shift ? R.shiftBoost : 1);
  });
  return effort > 0 ? built / effort : pace(S) / R.crews;
}

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
  const ev = earnedPct * bac, ac = L ? L.spent : wk * R.crews * R.crewWeek;
  const eacs = weekly.map((x) => Math.max(x.eac, L ? wk + 0.5 : 0));
  const eac = Math.max(last.eac, L ? wk + 0.5 : 0);
  // Money, from Cost Management: spend, what is left of the budget and the credit line, and when it would run out.
  const cm = costManagement(S, plan, L);
  const spi = +last.spi.toFixed(2), cpi = +(ev / ac).toFixed(2);
  // The light flags the worse of schedule and cost: green on both, amber if either is a little off, red if either is well off.
  const level = (x) => (x >= 1 ? 0 : x >= 0.9 ? 1 : 2);
  const worst = Math.max(level(spi), level(cpi));
  const scope = L ? L.totalScope : R.scope;
  return {
    money: { spent: cm.spent, budgetLeft: R.budget - cm.spent, creditLeft: R.budget + R.creditLine - cm.spent, plannedCost: cm.cost.bac, brokeWeek: cm.brokeWeek, budget: R.budget, creditLine: R.creditLine },
    scope, scopeAdded: scope - R.scope, scopeWeek: L ? (L.rows.find((r) => r.shock > 0) || {}).week ?? null : null,
    behind: { schedule: level(spi) > 0, cost: level(cpi) > 0 },
    forecast: clampF({ week: Math.round(eac), low: Math.floor(Math.min(...eacs)), high: Math.ceil(Math.max(...eacs)), chance: eac <= R.deadline - 0.5 ? 90 : eac <= R.deadline ? 60 : 20 }),
    live: !!L, pace: +pace(S).toFixed(1), weeksAtPace: +(R.scope / pace(S)).toFixed(1), eacWeeks: +eac.toFixed(1), weekly,
    earnedPct, plannedPct, weeksShown: wk, built: earnedPct * scope, planned: plannedPct * scope,
    found: foundSoFar(L), rejectedLast: S.last.rejected,
    spi, cpi, bac, light: ['green', 'amber', 'red'][worst],
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
    forecast: { week: sum.median, low: sum.min, high: sum.max, chance: Math.round(100 * sum.onTimeShare), fail: failuresLine(sum), rangeLabel: 'Range of the delivered ones' },
    rows, summary: sum, newest: { ...rows[rows.length - 1], ...S.last, pace: +pace(S).toFixed(1) }, n: rows.length, deadline: R.deadline,
  };
}

// ── Records and structured judgment ──────────────────────────────────────────
// A range from the record carries its failures: the count beside it, and in the chance (a failure is not on time).
const fromSummary = (s, what = '') => ({ week: s.median, low: s.p10, high: s.p90, chance: Math.round(100 * s.onTimeShare), fail: failuresLine(s, what), failed: s.failed.total, n: s.n });

/** Records: all 40, or the contracts run like the plan. */
export function records(S, plan = null) {
  const all = summarizeContracts(S.contracts);
  const m = plan ? matchContracts(plan) : null;
  const matched = m ? { ...fromSummary(m, 'run like yours'), rule: m.rule } : null;
  return { forecast: matched || fromSummary(all), all: fromSummary(all), matched };
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
  const yours = (m.week !== all.week ? ` The ones run like yours came in around week ${m.week}.` : '')
    + (m.failed ? ` And ${word(m.failed)} of the ${word(m.n)} run like yours never got delivered.` : '');
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
      says: `${found > 0 ? `We've caught ${found} bad unit${found === 1 ? '' : 's'} so far. ` : ''}Last time ${S.last.rejected} units bounced at acceptance, and it took ${word(gap)} more weeks after the dashboard said done. Budget ${gap > 1 ? `${word(gap - 1)} or ${word(gap)}` : word(gap)} weeks for rework${p.inspect > 0 ? ', maybe half that if you keep inspecting' : ''}.`,
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
    { key: 'veteran', name: 'Mabel', role: 'Veteran on the line', frame: 'The record', confidence: 80, forecast: { week: Math.max(m.week, now + 1), low: Math.max(m.low, now + 1), high: Math.max(m.high, now + 1), chance: m.chance, fail: m.fail },
      says: `Twenty-odd years on this line. These take about ${word(all.week)} weeks, give or take ${spread <= 2 ? 'a couple' : word(spread)}. I've seen maybe ${inWords(all.chance / 100)} make ${word(R.deadline)}.${yours}`,
      reasoning: `The record of ${S.contracts.length} contracts: median week ${all.week}, most between ${all.low} and ${all.high} among those delivered, ${all.chance}% on time${all.fail ? `; ${all.fail}` : ''}. For your plan, the ${m.n} run like it: delivered week ${m.week} (${m.low}–${m.high})${m.fail ? `; ${m.fail}` : ''}.` },
    { key: 'quality', name: 'Priya', role: 'Quality lead', frame: rejected > 0 ? 'The acceptance test' : 'Rework, from the last contract', confidence: 70, ...priya },
  ];
}


// ── The desk ─────────────────────────────────────────────────────────────────
/**
 * Every tab, in the briefing's order. `letter` is its one-character id in result
 * codes. `tone`: inside (blue), record (amber), people (violet: people and mixed).
 */
export const TABS = [
  { id: 'commit', letter: '', group: null, name: 'Your Plan and Prediction · Commit Before Week 1', short: 'Your Plan & Prediction', tone: 'front' },
  { id: 'contract', letter: 'b', group: 'The Brief', name: 'The Contract', tone: 'brief', forecasts: false, sees: 'The contract, every rule and how you are scored', cant: 'How long it will take' },
  { id: 'status', letter: 'a', group: 'Dashboards', name: 'Status Report', tone: 'inside', forecasts: true, sees: 'Progress and money: units reported complete against plan, spend, the credit line', cant: 'Whether those units will pass acceptance' },
  { id: 'chat', letter: 'f', group: 'People', name: 'Team Chat', tone: 'people', forecasts: true, sees: 'Five colleagues, each from where they sit', cant: 'Which view to weigh most' },
  { id: 'last5', letter: 'e', group: 'History', name: 'Last 5 Contracts', tone: 'record', forecasts: true, sees: 'The five newest contracts, and the story of the last one', cant: 'Whether five is enough' },
  { id: 'records', letter: 'j', group: 'History', name: 'Records', tone: 'record', forecasts: true, sees: 'What actually happened, defects and scope changes included', cant: 'Plans no past manager tried' },
];
export const tabById = (id) => TABS.find((t) => t.id === id);
export const tabByLetter = (l) => TABS.find((t) => t.letter && t.letter === l);

/** The desk's forecasts, for the reveal and the sweep. Each is a function of (screen, plan, live). */
export const FORECASTERS = {
  status: (S, p, L) => statusReport(S, L, p).forecast,
  last5: (S) => lastFive(S).forecast,
  'records-all': (S) => records(S).all,
  'records-plan': (S, p) => records(S, p).matched,
};
export const FORECASTER_NAMES = {
  status: 'Status Report', last5: 'Last 5 Contracts',
  'records-all': 'Records, all 40', 'records-plan': 'Records, like my plan',
};

/** Every forecaster's numbers for a plan, for the reveal's "how each tool would have done". */
export function allForecasts(S, plan, L = null) {
  const out = Object.entries(FORECASTERS).map(([k, f]) => ({ key: k, name: FORECASTER_NAMES[k], ...f(S, plan, L) }));
  for (const c of teamChat(S, plan, L)) out.push({ key: `chat-${c.key}`, name: `Team Chat: ${c.name}, ${c.role.toLowerCase()}`, ...c.forecast });
  return out;
}
