/**
 * Best Laid Plans — one insight.
 *
 *   Your dashboard said you were almost done. The past contracts knew better,
 *   and they were on your screen from the start.
 *
 * The mechanism is a hidden stock. Work counts as "complete" the week it is built,
 * but a share of it is defective and nobody knows until it is inspected — or until
 * the customer's acceptance test finds it all at once. The dashboard is therefore a
 * flattering model of the project, and a forecast built on it (the inside view)
 * runs early for every player whatever they do. The record of past contracts (the
 * outside view) already contains the defects, so it does not.
 *
 * Every tunable number is in CONFIG.
 */

export const CONFIG = {
  scope: 200,
  deadline: 12,
  horizon: 22,               // the customer terminates the contract after this week
  crews: 4,
  budget: 5_000_000,

  // Production
  unitsPerCrew: 4.6,         // units BUILT per crew-week; what the dashboard counts
  noise: 0.05,
  // Each contract differs: how hard its build is, and how defect-prone its parts are.
  // Drawn per seed and never shown, so it is part of what the past contracts' spread reflects.
  productivityRange: [0.92, 1.08],
  defectProneRange: [0.75, 1.3],
  maxCrews: 9,
  coordinationLoss: 0.04,    // each crew above the opening four costs every crew 4% (Brooks)
  maxHirePerWeek: 3,

  // Money
  crewWeek: 50_000,
  hireFee: 100_000,
  releaseFee: 50_000,
  shiftPremiumPerCrew: 20_000,

  // Hiring drag: while a new crew is onboarded, the whole line runs slower
  onboardingWeeks: 2,
  onboardingFactor: 0.7,

  // Second shift
  shiftBoost: 1.3,
  shiftDefectPerStreak: 0.04, // fatigue: from the SECOND straight shift week, +4 points of defect rate per week
  shiftDefectCap: 0.15,

  // Defects
  baseDefectRate: 0.10,
  // Inspection: share of capacity moved from building to checking. Each week it finds
  // this share of the hidden defects outstanding (plus a trickle found anyway).
  inspectionOptions: [0, 0.1, 0.2, 0.3],
  discoveryBase: 0.05,
  discoveryPerShare: 3.0,
  discoveryCap: 0.85,
  // The customer's acceptance test, run when the dashboard reaches 100%, finds every
  // remaining defect. Found that late, each one takes more than a unit to put right.
  lateFixMultiplier: 2.0,

  // The shock: scope growth in an unannounced week, of unannounced size.
  shockWeeks: [4, 8],
  shockUnits: [10, 25],
  shockTailChance: 0.1,
  shockTailUnits: [40, 55],

  // Delivery score
  latePenaltyPerWeek: 12,
  overspendPenaltyPer50k: 1,

  // The briefing's history is not typed in. It is the engine's own record of the line's
  // last contract, run with the opening crew and no inspection (see lastContract()).
  historyWeeks: 6,

  pastContracts: 40,
};

// ── Seeded randomness ────────────────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromString(str) {
  if (str === null || str === undefined || String(str).trim() === '') {
    return (Math.random() * 4294967296) >>> 0;
  }
  const s = String(str).trim().toLowerCase();
  if (/^\d+$/.test(s)) return Number(s) >>> 0;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const between = (r, [lo, hi]) => lo + r() * (hi - lo);

// ── The project ──────────────────────────────────────────────────────────────
export class Project {
  constructor(seedInput = null, cfg = CONFIG) {
    this.cfg = cfg;
    this.seedInput = seedInput;
    this.seed = seedFromString(seedInput);
    const r = mulberry32(this.seed);
    this._r = r;

    // Drawn up front so the shock is identical for everyone on a seed, whatever they do.
    this.shockWeek = cfg.shockWeeks[0] + Math.floor(r() * (cfg.shockWeeks[1] - cfg.shockWeeks[0] + 1));
    this.shockTail = r() < cfg.shockTailChance;
    this.shockSize = Math.round(between(r, this.shockTail ? cfg.shockTailUnits : cfg.shockUnits));
    this.productivity = between(r, cfg.productivityRange);
    this.defectProne = between(r, cfg.defectProneRange);
    // Production noise is drawn per week from a separate stream, so one player's
    // choices cannot shift another player's luck on the same seed.
    this._noise = Array.from({ length: cfg.horizon + 1 }, () => 1 + cfg.noise * (r() + r() + r() - 1.5) * 1.15);

    this.week = 0;
    this.crews = cfg.crews;
    this.onboarding = 0;
    this.shiftStreak = 0;
    this.budget = cfg.budget;
    this.totalScope = cfg.scope;
    this.backlog = cfg.scope;  // known work left to build, including known rework
    this.hidden = 0;           // built, counted complete, actually defective — not shown
    this.done = false;
    this.result = 'PLAYING';   // PLAYING | DELIVERED | TERMINATED
    this.finishWeek = null;
    this.forecast = null;      // committed before week 1
    this.plan = null;          // the plan stated before week 1
    this.desk = null;          // how the Decision Desk was used before week 1
    this.forecastLog = [];
    this.history = [];
    this.spent = 0;
  }

  /** Reported % complete: what the dashboard shows. */
  reportedPct() {
    return Math.max(0, Math.min(1, (this.totalScope - this.backlog) / this.totalScope));
  }

  /** True % complete: built and actually good. */
  truePct() {
    return Math.max(0, Math.min(1, (this.totalScope - this.backlog - this.hidden) / this.totalScope));
  }

  defectRate(shift) {
    const c = this.cfg;
    const streak = shift ? this.shiftStreak + 1 : 0;
    return c.baseDefectRate * this.defectProne + Math.min(c.shiftDefectCap, Math.max(0, streak - 1) * c.shiftDefectPerStreak);
  }

  /**
   * The forecast and the plan the student says they will play. Neither is read by
   * play(): they are recorded, never acted on.
   */
  commit({ week, low, high, onTimeChance, plan = null, desk = null }) {
    this.forecast = { week: +week, low: +low, high: +high, onTimeChance: +onTimeChance };
    this.forecastLog = [{ week: 0, forecast: +week }];
    this.plan = plan ? normalizePlan(plan) : null;
    this.desk = desk ? normalizeDesk(desk) : null;
  }

  /** What the coming week will cost, before it is played. */
  weekCost({ hire = 0, shift = false } = {}) {
    const c = this.cfg;
    const crews = Math.max(1, this.crews + hire);
    return crews * c.crewWeek
      + (shift ? crews * c.shiftPremiumPerCrew : 0)
      + (hire > 0 ? hire * c.hireFee : 0)
      + (hire < 0 ? Math.min(-hire, this.crews - 1) * c.releaseFee : 0);
  }

  /**
   * Play one week.
   * @param {{hire?: number, shift?: boolean, inspect?: number, forecast?: number}} d
   */
  play({ hire = 0, shift = false, inspect = 0, forecast = null } = {}) {
    if (this.done) return null;
    const c = this.cfg;
    this.week++;
    const events = [];

    // Staffing
    hire = Math.max(-(this.crews - 1), Math.min(c.maxHirePerWeek, Math.round(hire), c.maxCrews - this.crews));
    const cost = this.weekCost({ hire, shift });
    if (hire > 0) {
      this.crews += hire;
      this.onboarding = c.onboardingWeeks;
      events.push(`${hire} new crew${hire > 1 ? 's' : ''} joined. The line runs slower while ${hire > 1 ? 'they are' : 'it is'} brought up to speed.`);
    } else if (hire < 0) {
      this.crews += hire;
      events.push(`Released ${-hire} crew${hire < -1 ? 's' : ''}.`);
    }
    this.budget -= cost;
    this.spent += cost;

    // Capacity, split between building and inspecting
    inspect = c.inspectionOptions.includes(+inspect) ? +inspect : 0;
    const capacity = this.crews * c.unitsPerCrew * this.productivity
      * (1 - c.coordinationLoss * Math.max(0, this.crews - c.crews))
      * (this.onboarding > 0 ? c.onboardingFactor : 1)
      * (shift ? c.shiftBoost : 1)
      * this._noise[this.week];
    const built = Math.min(this.backlog, capacity * (1 - inspect));
    const rate = this.defectRate(shift);
    const bad = built * rate;
    this.backlog -= built;
    this.hidden += bad;
    this.shiftStreak = shift ? this.shiftStreak + 1 : Math.max(0, this.shiftStreak - 1);

    // The shock
    let shock = 0;
    if (this.week === this.shockWeek) {
      shock = this.shockSize;
      this.totalScope += shock;
      this.backlog += shock;
      events.push(`The customer changed the requirement: ${shock} more units.${this.shockTail ? ' A large change.' : ''}`);
    }

    let found = 0;
    let rejected = 0;
    let accepted = false;
    if (this.backlog < 0.5) {
      // The dashboard reads 100%, so the customer runs the acceptance test on everything.
      this.backlog = 0;
      if (this.hidden >= 0.5) {
        rejected = this.hidden;
        this.backlog = this.hidden * c.lateFixMultiplier;
        this.hidden = 0;
        events.push(`Customer acceptance test: ${Math.round(rejected)} units rejected. Fixing them this late takes ${Math.round(rejected * c.lateFixMultiplier)} units of work.`);
      } else {
        this.hidden = 0;
        accepted = true;
      }
    } else {
      // Inspection finds a share of what is hidden. Found early, a defect is one unit of rework.
      const discovery = Math.min(c.discoveryCap, c.discoveryBase + c.discoveryPerShare * inspect);
      found = this.hidden * discovery;
      this.hidden -= found;
      this.backlog += found;
      if (found >= 0.5) events.push(`Inspection found ${Math.round(found)} defective unit${Math.round(found) === 1 ? '' : 's'}; back in the queue.`);
    }

    if (forecast !== null && forecast !== undefined && Number.isFinite(+forecast)) {
      this.forecastLog.push({ week: this.week, forecast: +forecast });
    }

    if (accepted) {
      this.done = true;
      this.result = 'DELIVERED';
      this.finishWeek = this.week;
      events.push(`Accepted in full. Contract delivered in week ${this.week}.`);
    } else if (this.week >= c.horizon) {
      this.done = true;
      this.result = 'TERMINATED';
      events.push('The customer terminated the contract.');
    }

    const row = {
      week: this.week,
      crews: this.crews,
      shift,
      inspect,
      built: +built.toFixed(1),
      found: +found.toFixed(1),
      rejected: +rejected.toFixed(1),
      shock,
      cost,
      budget: this.budget,
      backlog: +this.backlog.toFixed(1),
      reported: +this.reportedPct().toFixed(4),
      true: +this.truePct().toFixed(4),
      defectRate: +rate.toFixed(3),
      events,
    };
    if (this.onboarding > 0) this.onboarding--;
    this.history.push(row);
    return row;
  }

  /** The week the project would have finished. Terminated runs project the work left. */
  outcomeWeek() {
    if (this.result === 'DELIVERED') return this.finishWeek;
    const pace = Math.max(1, this.crews * this.cfg.unitsPerCrew * (1 - this.cfg.baseDefectRate));
    return +(this.week + (this.backlog + this.hidden * this.cfg.lateFixMultiplier) / pace).toFixed(1);
  }

  /** The week the dashboard first read 90% or more. */
  ninetyWeek() {
    const h = this.history.find((x) => x.reported >= 0.9);
    return h ? h.week : null;
  }

  scores() {
    const c = this.cfg;
    const outcome = this.outcomeWeek();
    const late = Math.max(0, outcome - c.deadline);
    const over = Math.max(0, this.spent - c.budget);
    const delivery = this.result === 'TERMINATED'
      ? 0
      : Math.max(0, Math.round(100 - late * c.latePenaltyPerWeek - (over / 50_000) * c.overspendPenaltyPer50k));

    const f = this.forecast || { week: c.deadline, low: c.deadline, high: c.deadline, onTimeChance: 50 };
    const held = outcome >= f.low && outcome <= f.high;
    const missBy = held ? 0 : +(outcome > f.high ? outcome - f.high : outcome - f.low).toFixed(1);
    const onTime = this.result === 'DELIVERED' && this.finishWeek <= c.deadline;
    const p = Math.max(0, Math.min(1, f.onTimeChance / 100));
    const brier = (p - (onTime ? 1 : 0)) ** 2;
    const forecastScore = Math.max(0, Math.round(100 - 8 * Math.abs(outcome - f.week) - (held ? 0 : 20) - 40 * brier));

    return { delivery, forecast: forecastScore, outcome, held, missBy, onTime, brier: +brier.toFixed(3), late: +late.toFixed(1), overspend: Math.round(over) };
  }

  /**
   * Compact code a student reads out or pastes for the Room page.
   *   BLP3|seed|week|low|high|chance|outcome|D/T|ninety|spentK|plan|desk|name
   * `plan` is the stated plan in three characters (crews added, inspection in tens of
   * percent, shift n/l/e: "31n" is +3 crews, 10%, no shift), followed by the plan
   * actually played only if that differs: "01n31n". `desk` is how the briefing's tabs
   * were used (see encodeDesk): "o7m6e".
   */
  resultCode(name = '') {
    const f = this.forecast || {};
    const s = this.scores();
    const stated = this.plan ? encodePlan(this.plan) : '';
    const played = encodePlan(playedPlan(this));
    const fields = [
      'BLP3',
      this.seed.toString(36),
      f.week, f.low, f.high, f.onTimeChance,
      s.outcome,
      this.result === 'DELIVERED' ? 'D' : 'T',
      this.ninetyWeek() ?? '',
      Math.round(this.spent / 1000),
      stated === played ? stated : stated + played,
      this.desk ? encodeDesk(this.desk) : '',
      String(name).replace(/[^A-Za-z0-9 .'-]/g, '').slice(0, 24),
    ];
    return fields.join('|');
  }
}

/** Reads BLP3 codes and the older BLP2 (no desk) and BLP1 (no plan) codes. */
export function parseResultCode(code) {
  const parts = String(code).trim().split('|');
  const version = { BLP1: 1, BLP2: 2, BLP3: 3 }[parts[0]?.toUpperCase()];
  if (parts.length < 10 || !version) return null;
  const [, seed36, week, low, high, conf, outcome, res, ninety, spentK] = parts;
  const planField = version >= 2 ? (parts[10] ?? '').trim().toLowerCase() : '';
  const name = parts[version === 1 ? 10 : version === 2 ? 11 : 12] ?? '';
  const n = (x) => (x === '' ? null : Number(x));
  const r = {
    version,
    seed: parseInt(seed36, 36), week: n(week), low: n(low), high: n(high), onTimeChance: n(conf),
    outcome: n(outcome), delivered: res?.toUpperCase() === 'D', ninetyWeek: n(ninety), spentK: n(spentK), name,
    plan: null, played: null, desk: version === 3 ? decodeDesk(parts[11] ?? '') : null,
  };
  if (![r.week, r.low, r.high, r.onTimeChance, r.outcome].every(Number.isFinite)) return null;
  if (planField) {
    const stated = decodePlan(planField.slice(0, 3));
    const played = planField.length > 3 ? decodePlan(planField.slice(3, 6)) : stated;
    if (stated && played) { r.plan = stated; r.played = played; }
  }
  return r;
}

// ── The Decision Desk, as recorded ───────────────────────────────────────────
// What the student looked at before committing: the tool whose numbers they used (a
// tab letter, or none), how many tool tabs they opened, minutes on the briefing, and
// whether they changed the numbers they were given (the tool's, or the defaults).
// The order the tabs were opened in stays on the device; it is too long to read aloud.
export function normalizeDesk(d) {
  const tool = /^[a-z]$/.test(d.tool || '') ? d.tool : '';
  return { tool, tabs: Math.max(0, Math.min(99, Math.round(+d.tabs || 0))), minutes: Math.max(0, Math.min(99, Math.round(+d.minutes || 0))), edited: !!d.edited, order: Array.isArray(d.order) ? d.order.map(String) : [] };
}

/** "o7m6e": used tab o, opened 7 tabs, 6 minutes, edited. "x0m2": no tool, no tabs, 2 minutes, numbers as given. */
export const encodeDesk = (d) => { const n = normalizeDesk(d); return `${n.tool || 'x'}${n.tabs}m${n.minutes}${n.edited ? 'e' : ''}`; };

export function decodeDesk(s) {
  const m = /^([a-z])(\d{1,2})m(\d{1,2})(e?)$/.exec(String(s).trim().toLowerCase());
  if (!m) return null;
  return { tool: m[1] === 'x' ? '' : m[1], tabs: +m[2], minutes: +m[3], edited: m[4] === 'e' };
}

// ── Plans ────────────────────────────────────────────────────────────────────
// A plan, as the commit screen asks for it: crews added at the start, the inspection
// share, and a second shift ('none', 'late' for the closing weeks, 'every' week).
export const SHIFT_MODES = ['none', 'late', 'every'];

const shiftOn = (plan) => (typeof plan.shift === 'string' ? plan.shift !== 'none' : !!plan.shift);

export function normalizePlan(plan) {
  const inspect = CONFIG.inspectionOptions.reduce((best, o) => (Math.abs(o - +plan.inspect) < Math.abs(best - +plan.inspect) ? o : best), 0);
  const shift = SHIFT_MODES.includes(plan.shift) ? plan.shift : plan.shift === true ? 'late' : 'none';
  return { crews: Math.max(0, Math.min(9, Math.round(+plan.crews || 0))), inspect, shift };
}

export const encodePlan = (plan) => {
  const p = normalizePlan(plan);
  return `${p.crews}${Math.round(p.inspect * 10)}${p.shift[0]}`;
};

export function decodePlan(s) {
  const m = /^(\d)(\d)([nle])$/.exec(String(s).trim().toLowerCase());
  if (!m || +m[2] > 3) return null;
  return { crews: +m[1], inspect: +m[2] / 10, shift: SHIFT_MODES.find((x) => x[0] === m[3]) };
}

/** The plan a student actually played, in the commit screen's terms. */
export function playedPlan(p) {
  const base = planFromProject(p);
  const shiftWeeks = p.history.filter((x) => x.shift).length;
  const shift = shiftWeeks === 0 ? 'none' : shiftWeeks === p.history.length && shiftWeeks > 1 ? 'every' : 'late';
  return { crews: base.crews, inspect: base.inspect, shift };
}

const PLAN_INSPECT = ['no inspection', '10% inspection', '20% inspection', '30% inspection'];
const PLAN_SHIFT = { none: 'no second shift', late: 'second shift in the late weeks', every: 'second shift every week' };
export function describePlan(plan) {
  const p = normalizePlan(plan);
  if (p.crews === 0 && p.inspect === 0 && p.shift === 'none') return 'hands-off (no crews added, no inspection, no second shift)';
  return [p.crews ? `+${p.crews} crew${p.crews > 1 ? 's' : ''} at the start` : 'no crews added', PLAN_INSPECT[Math.round(p.inspect * 10)], PLAN_SHIFT[p.shift]].join(', ');
}

/**
 * Kept means the same plan in the terms the record is matched on: crews added,
 * inspection or not, second shift or not.
 */
export const planKept = (a, b) => normalizePlan(a).crews === normalizePlan(b).crews
  && (+a.inspect > 0) === (+b.inspect > 0) && shiftOn(a) === shiftOn(b);

export const isHandsOff = (plan) => { const p = normalizePlan(plan); return p.crews === 0 && p.inspect === 0 && p.shift === 'none'; };

/**
 * Was a held range reasoned or lucky? Information only: it never changes a score.
 *   reasoned  the range held, the plan was kept, and the forecast sat on the record
 *             of contracts run like the plan played (point within a week of their
 *             median, each end within two weeks of their 10th and 90th percentiles)
 *   lucky     the range held, but the play left the stated plan, or the forecast
 *             sat far from that record
 *   missed    the range missed
 * Old codes with no stated plan get null for a held range.
 * Hands-off play also returns the record of the past managers who coasted.
 */
export function judgeForecast({ forecast: f, outcome, stated, played }, cfg = CONFIG) {
  const held = outcome >= f.low && outcome <= f.high;
  const matched = matchContracts(played, { cfg });
  const statedMatch = stated ? matchContracts(stated, { cfg }) : null;
  const kept = stated ? planKept(stated, played) : null;
  const onRecord = Math.abs(f.week - matched.median) <= 1
    && Math.abs(f.low - matched.p10) <= 2 && Math.abs(f.high - matched.p90) <= 2;
  const verdict = !held ? 'missed' : kept === null ? null : kept && onRecord ? 'reasoned' : 'lucky';
  const why = verdict === 'lucky' ? (kept ? 'off-record' : 'changed') : null;
  let coaster = null;
  if (isHandsOff(played)) {
    const rows = matched.contracts;
    coaster = { n: rows.length, late: rows.filter((r) => !r.onTime).length, median: matched.median, min: matched.min, max: matched.max };
  }
  return { held, kept, onRecord, verdict, why, matched, statedMatch, coaster };
}

// ── The outside view ─────────────────────────────────────────────────────────
// Past contracts on the same line, run by managers with a spread of habits. Fixed
// across seeds so the whole room sees the same record. Each common plan has enough
// contracts (six or seven) that a student can find the ones run like their own.
// [count, plan]: crews added in hireWeek, inspection share, second shift in weeks shiftFrom-shiftTo.
const PAST_POLICIES = [
  [7, { hire: 0, inspect: 0 }],                         // hands-off
  [4, { hire: 0, inspect: 0.1 }],                       // inspection only
  [3, { hire: 0, inspect: 0.2 }],
  [5, { hire: 2, inspect: 0 }],                         // +2 crews
  [2, { hire: 2, hireWeek: 2, inspect: 0 }],
  [6, { hire: 3, inspect: 0 }],                         // +3 crews
  [6, { hire: 3, inspect: 0.1 }],                       // +3 crews, 10% inspection
  [1, { hire: 3, hireWeek: 2, inspect: 0.1 }],
  [3, { hire: 0, inspect: 0, shiftFrom: 9, shiftTo: 11 }], // second shift
  [2, { hire: 0, inspect: 0, shiftFrom: 8, shiftTo: 11 }],
  [1, { hire: 0, inspect: 0, shiftFrom: 10, shiftTo: 11 }],
];

// The six plans the record is built to cover, in the terms the commit screen asks for.
export const COMMON_PLANS = [
  { key: 'hands-off', label: 'Hands-off', crews: 0, inspect: 0, shift: false },
  { key: 'inspect', label: 'Inspection only', crews: 0, inspect: 0.1, shift: false },
  { key: 'crews2', label: '+2 crews', crews: 2, inspect: 0, shift: false },
  { key: 'crews3', label: '+3 crews', crews: 3, inspect: 0, shift: false },
  { key: 'crews3-inspect', label: '+3 crews, 10% inspection', crews: 3, inspect: 0.1, shift: false },
  { key: 'shift', label: 'Second shift', crews: 0, inspect: 0, shift: true },
];

// Round-robin over the plans, so neighbouring rows in the record differ.
function pastPlanList(n) {
  const left = PAST_POLICIES.map(([k]) => k);
  const out = [];
  while (out.length < n && left.some((k) => k > 0)) {
    PAST_POLICIES.forEach(([, plan], k) => { if (left[k]-- > 0 && out.length < n) out.push(plan); });
  }
  while (out.length < n) out.push(PAST_POLICIES[out.length % PAST_POLICIES.length][1]);
  return out;
}

export function playPolicy(project, { hire = 0, hireWeek = 1, shiftFrom = 99, shiftTo = 99, inspect = 0 }) {
  while (!project.done) {
    const w = project.week + 1;
    project.play({ hire: w === hireWeek ? hire : 0, shift: w >= shiftFrom && w <= shiftTo, inspect });
  }
  return project;
}

/** One finished contract as a row of the record. */
function contractRow(p, id) {
  const c = p.cfg;
  const h = p.history;
  const hires = [];
  h.forEach((x, i) => { const prev = i ? h[i - 1].crews : c.crews; if (x.crews > prev) hires.push({ week: x.week, crews: x.crews - prev }); });
  const full = h.find((x) => x.rejected > 0 || x.reported >= 0.999);
  const outcome = p.outcomeWeek();
  return {
    id,
    crewsAdded: Math.max(0, Math.max(c.crews, ...h.map((x) => x.crews)) - c.crews),
    hires,
    inspect: modeInspect(h),
    shiftWeeks: h.filter((x) => x.shift).length,
    scopeWeek: p.shockWeek,
    scopeUnits: p.shockSize,
    dashboardFullWeek: full ? full.week : null,
    rejected: Math.round(h.reduce((a, x) => a + x.rejected, 0)),
    accepted: outcome,
    delivered: p.result === 'DELIVERED',
    onTime: p.result === 'DELIVERED' && outcome <= c.deadline,
  };
}

// The inspection share used in most weeks (ties go to the higher share).
function modeInspect(h) {
  const n = {};
  for (const x of h) n[x.inspect] = (n[x.inspect] || 0) + 1;
  return Object.keys(n).map(Number).sort((a, b) => n[b] - n[a] || b - a)[0] ?? 0;
}

/** Nearest-rank quantile of a sorted list: always one of the weeks in the list. */
const rank = (sorted, q) => sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];

/** Count, median, 10-90 range, full range and on-time share for any set of contracts. */
export function summarizeContracts(rows, cfg = CONFIG) {
  const sorted = rows.map((r) => r.accepted).sort((a, b) => a - b);
  if (!sorted.length) return { n: 0, median: null, p10: null, p90: null, min: null, max: null, onTimeShare: null };
  return {
    n: sorted.length,
    median: rank(sorted, 0.5),
    p10: rank(sorted, 0.1),
    p90: rank(sorted, 0.9),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    onTimeShare: rows.filter((r) => r.accepted <= cfg.deadline && r.delivered !== false).length / rows.length,
  };
}

let _past = null;
export function pastContracts(cfg = CONFIG) {
  if (_past && cfg === CONFIG) return _past;
  const contracts = pastPlanList(cfg.pastContracts)
    .map((plan, i) => contractRow(playPolicy(new Project(`past-${i}`, cfg), plan), i + 1));
  const res = { contracts, weeks: contracts.map((r) => r.accepted), ...summarizeContracts(contracts, cfg) };
  if (cfg === CONFIG) _past = res;
  return res;
}

/** A finished (or part-played) project, described in the terms of a plan. */
export function planFromProject(p) {
  const h = p.history;
  return {
    crews: Math.max(0, Math.max(p.cfg.crews, ...h.map((x) => x.crews)) - p.cfg.crews),
    inspect: modeInspect(h),
    shift: h.some((x) => x.shift),
  };
}

/**
 * The past contracts run like a plan ({crews, inspect, shift}). Tries the closest
 * match first and widens only until at least `min` contracts qualify:
 *   1. same crews added, inspection or not, second shift or not
 *   2. crews added within one
 *   3. inspection or not, second shift or not
 *   4. all contracts
 */
export function matchContracts(plan, { min = 5, cfg = CONFIG } = {}) {
  const all = pastContracts(cfg).contracts;
  const crews = Math.max(0, Math.round(+plan.crews || 0));
  const insp = +plan.inspect > 0;
  const shift = shiftOn(plan);
  const same = (r) => (r.inspect > 0) === insp && (r.shiftWeeks > 0) === shift;
  const rules = [
    ['crews, inspection and shift', (r) => same(r) && r.crewsAdded === crews],
    ['crews within one, inspection and shift', (r) => same(r) && Math.abs(r.crewsAdded - crews) <= 1],
    ['inspection and shift', same],
    ['all contracts', () => true],
  ];
  for (const [rule, f] of rules) {
    const contracts = all.filter(f);
    if (contracts.length >= min || rule === 'all contracts') return { rule, contracts, ...summarizeContracts(contracts, cfg) };
  }
  return null;
}

// ── The line's last contract ─────────────────────────────────────────────────
// Same line, same four crews, built flat out with no inspection. The briefing shows
// its first weeks of reported completions (the inside view) AND how it ended: the
// week its dashboard first read 100%, and the week it was actually accepted.
let _last = null;
export function lastContract(cfg = CONFIG) {
  if (_last && cfg === CONFIG) return _last;
  const p = playPolicy(new Project('last-contract', cfg), { hire: 0, inspect: 0 });
  const full = p.history.find((h) => h.rejected > 0 || h.reported >= 0.999);
  const res = {
    history: p.history.slice(0, cfg.historyWeeks).map((h) => h.built),
    dashboardFullWeek: full ? full.week : null,
    deliveredWeek: p.outcomeWeek(),
    rejected: Math.round(p.history.reduce((a, h) => a + h.rejected, 0)),
  };
  if (cfg === CONFIG) _last = res;
  return res;
}

export const historyMean = (cfg = CONFIG) => {
  const h = lastContract(cfg).history;
  return +(h.reduce((a, b) => a + b, 0) / h.length).toFixed(1);
};
