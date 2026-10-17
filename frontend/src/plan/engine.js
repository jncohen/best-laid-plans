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
  budget: 4_600_000,
  creditLine: 500_000,       // overspend allowed on credit; past it, payroll fails and the company goes bankrupt

  // Production
  unitsPerCrew: 4.6,         // units BUILT per crew-week; what the dashboard counts
  noise: 0.05,
  // Each contract differs: how hard its build is, and how defect-prone its parts are.
  // Drawn per seed and never shown, so it is part of what the past contracts' spread reflects.
  productivityRange: [0.80, 1.20],
  defectProneRange: [0.5, 1.8],
  maxCrews: 9,
  coordinationLoss: 0.04,    // each crew above the opening four costs every crew 4% (Brooks)
  maxHirePerWeek: 3,

  // Money
  crewWeek: 50_000,
  hireFee: 100_000,
  releaseFee: 50_000,
  shiftPremiumPerCrew: 20_000,

  // Hiring drag: new crews are brought up to speed
  onboardingWeeks: 2,
  onboardingFactor: 0.5,
  onboardingDrag: 'new',     // 'new': only the new crews work at onboardingFactor; 'line': the whole line does

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

  // Mid-game events, disclosed as possibilities and drawn per contract before play.
  crewOutChance: 0.5,        // a crew is out for crewOutWeeks, starting in a week in crewOutWeekRange
  crewOutWeeks: 2,
  crewOutWeekRange: [3, 9],
  delayChance: 0.4,          // a parts delay idles part of the line for one week
  delayShare: 0.5,
  delayWeekRange: [4, 10],

  // Inspection's sample: each inspected week, the inspectors report the share of that week's
  // units they found defective. It reads the true defect rate with this relative error.
  sampleError: 0.08,

  // Attention: round 1 (the briefing and the week-1 decisions) is unlimited. From week 2, at
  // most this many tool tabs can be viewed each week. The front tab, The Contract and Ask an
  // AI never count; re-opening a tab that week is free.
  viewsPerWeek: 3,
  unlimitedRound1: true,

  // Updating score: weight on the interval score of each weekly 80% range
  updatingIntervalWeight: 3,

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
    // Mid-game events, drawn after everything above so earlier draws keep their values.
    const crewOut = r() < cfg.crewOutChance, crewOutAt = cfg.crewOutWeekRange[0] + Math.floor(r() * (cfg.crewOutWeekRange[1] - cfg.crewOutWeekRange[0] + 1));
    const delay = r() < cfg.delayChance, delayAt = cfg.delayWeekRange[0] + Math.floor(r() * (cfg.delayWeekRange[1] - cfg.delayWeekRange[0] + 1));
    this.crewOutWeek = crewOut ? crewOutAt : null;
    this.delayWeek = delay ? delayAt : null;
    // The inspectors' sampling error, one per week, drawn last so every earlier draw keeps its value.
    // It changes what the screen reports, never what happens.
    this._sample = Array.from({ length: cfg.horizon + 1 }, () => (r() + r() + r() - 1.5) * 2);

    this.week = 0;
    this.crews = cfg.crews;
    this.onboarding = 0;
    this.newCrews = 0;         // crews still being brought up to speed
    this.shiftStreak = 0;
    this.budget = cfg.budget;
    this.totalScope = cfg.scope;
    this.backlog = cfg.scope;  // known work left to build, including known rework
    this.hidden = 0;           // built, counted complete, actually defective — not shown
    this.done = false;
    this.result = 'PLAYING';   // PLAYING | DELIVERED | TERMINATED | BANKRUPT
    this.finishWeek = null;
    this.forecast = null;      // committed before week 1
    this.plan = null;          // the plan stated before week 1
    this.desk = null;          // how the Decision Desk was used before week 1
    this.deskLog = [];         // decision-support tabs opened during play: { week, tab }, and prompt copies
    this.weekSeconds = {};     // roughly how long each week took on the play screen
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
    this.forecastLog = [{ week: 0, forecast: +week, low: +low, high: +high, chance: +onTimeChance }];
    this.plan = plan ? normalizePlan(plan) : null;
    this.desk = desk ? normalizeDesk(desk) : null;
  }

  /** Records that a decision-support tab was opened (or the AI prompt copied) before a week was played. Never read by play(). */
  noteDesk(week, tab) {
    this.deskLog.push({ week: +week, tab: String(tab) });
  }

  /** Tool views used in a week: distinct tool tabs opened (not The Contract, not Ask an AI). Never read by play(). */
  checksFor(week) {
    return [...new Set(this.deskLog.filter((d) => d.week === week).map((d) => d.tab))].filter(isCheck).length;
  }

  /** Records roughly how many seconds a week took before it was played. Never read by play(). */
  noteTime(week, seconds) {
    this.weekSeconds[+week] = Math.max(0, Math.round(+seconds || 0));
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
  play({ hire = 0, shift = false, inspect = 0, forecast = null, range = null } = {}) {
    if (this.done) return null;
    const c = this.cfg;
    this.week++;
    const events = [];

    // Staffing
    hire = Math.max(-(this.crews - 1), Math.min(c.maxHirePerWeek, Math.round(hire), c.maxCrews - this.crews));
    const cost = this.weekCost({ hire, shift });
    if (this.budget - cost < -c.creditLine) {
      // The week's payroll would go past the credit line. Nothing is built; the contract ends.
      this.done = true;
      this.result = 'BANKRUPT';
      const row = {
        week: this.week, crews: this.crews, shift: false, inspect: 0, built: 0, found: 0, sampled: null, rejected: 0, shock: 0, cost: 0,
        budget: this.budget, backlog: +this.backlog.toFixed(1), reported: +this.reportedPct().toFixed(4), true: +this.truePct().toFixed(4), defectRate: 0,
        bankrupt: true,
        events: [`Week ${this.week}'s payroll (${Math.round(cost / 1000)}k) would take the company past its ${Math.round(c.creditLine / 1000)}k credit line. It can't pay its crews: the company is bankrupt and the contract ends.`],
      };
      if (forecast !== null && forecast !== undefined && Number.isFinite(+forecast)) this.forecastLog.push({ week: this.week, forecast: +forecast, ...(range || {}) });
      this.history.push(row);
      return row;
    }
    if (hire > 0) {
      this.crews += hire;
      this.onboarding = c.onboardingWeeks;
      this.newCrews = (this.onboarding > 0 && c.onboardingDrag === 'new' ? this.newCrews : 0) + hire;
      events.push(`${hire} new crew${hire > 1 ? 's' : ''} joined. ${c.onboardingDrag === 'new' ? `${hire > 1 ? 'They work' : 'It works'} at ${Math.round(c.onboardingFactor * 100)}% for ${c.onboardingWeeks} weeks while ${hire > 1 ? 'they are' : 'it is'} brought up to speed.` : `The line runs slower while ${hire > 1 ? 'they are' : 'it is'} brought up to speed.`}`);
    } else if (hire < 0) {
      this.crews += hire;
      events.push(`Released ${-hire} crew${hire < -1 ? 's' : ''}.`);
    }
    this.budget -= cost;
    this.spent += cost;

    // Capacity, split between building and inspecting
    inspect = c.inspectionOptions.includes(+inspect) ? +inspect : 0;
    const out = this.crewOutWeek !== null && this.week >= this.crewOutWeek && this.week < this.crewOutWeek + c.crewOutWeeks && this.crews > 1 ? 1 : 0;
    if (out && this.week === this.crewOutWeek) events.push(`A crew is out for ${c.crewOutWeeks} weeks. You still pay it; the line has one crew fewer.`);
    const delayed = this.week === this.delayWeek;
    if (delayed) events.push(`A parts delay idles ${Math.round(c.delayShare * 100)}% of the line this week.`);
    const lineCrews = c.onboardingDrag === 'new' && this.onboarding > 0
      ? this.crews - out - this.newCrews * (1 - c.onboardingFactor)
      : this.crews - out;
    const capacity = lineCrews * c.unitsPerCrew * this.productivity
      * (delayed ? 1 - c.delayShare : 1)
      * (1 - c.coordinationLoss * Math.max(0, this.crews - c.crews))
      * (c.onboardingDrag !== 'new' && this.onboarding > 0 ? c.onboardingFactor : 1)
      * (shift ? c.shiftBoost : 1)
      * this._noise[this.week];
    const built = Math.min(this.backlog, capacity * (1 - inspect));
    const rate = this.defectRate(shift);
    const bad = built * rate;
    // What the inspectors' sample says about this week's units (only when some of the line inspects).
    const sampled = inspect > 0 && built > 0 ? +Math.max(0, rate * (1 + c.sampleError * this._sample[this.week])).toFixed(3) : null;
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
        events.push(`Customer acceptance test: ${Math.round(rejected)} unit${Math.round(rejected) === 1 ? '' : 's'} rejected. Fixing ${Math.round(rejected) === 1 ? 'it' : 'them'} this late takes ${Math.round(rejected * c.lateFixMultiplier)} units of work.`);
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
      if (found >= 0.5) {
        const n = Math.round(found), units = `${n} defective unit${n === 1 ? '' : 's'}`;
        events.push(inspect > 0 ? `Inspection found ${units}; back in the queue.` : `${units[0].toUpperCase()}${units.slice(1)} turned up in the work; back in the queue.`);
      }
    }
    if (sampled !== null) events.push(`Inspectors' sample: ${(sampled * 100).toFixed(1)}% of this week's units were defective.`);

    if (forecast !== null && forecast !== undefined && Number.isFinite(+forecast)) {
      this.forecastLog.push({ week: this.week, forecast: +forecast, ...(range || {}) });
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
      sampled,
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
    if (this.onboarding === 0) this.newCrews = 0;
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
    const delivery = this.result === 'TERMINATED' || this.result === 'BANKRUPT'
      ? 0
      : Math.max(0, Math.round(100 - late * c.latePenaltyPerWeek - (over / 50_000) * c.overspendPenaltyPer50k));

    const f = this.forecast || { week: c.deadline, low: c.deadline, high: c.deadline, onTimeChance: 50 };
    // A contract never delivered misses every range: its outcome week is only a projection.
    const failed = this.result === 'BANKRUPT' ? 'bankrupt' : this.result === 'TERMINATED' ? 'terminated' : null;
    const held = !failed && outcome >= f.low && outcome <= f.high;
    const missBy = held ? 0 : failed ? null : +(outcome > f.high ? outcome - f.high : outcome - f.low).toFixed(1);
    const onTime = this.result === 'DELIVERED' && this.finishWeek <= c.deadline;
    const p = Math.max(0, Math.min(1, f.onTimeChance / 100));
    const brier = (p - (onTime ? 1 : 0)) ** 2;
    const forecastScore = Math.max(0, Math.round(100 - 8 * Math.abs(outcome - f.week) - (held ? 0 : 20) - 40 * brier));

    return { delivery, forecast: forecastScore, updating: updatingScore(this.forecastLog, outcome, onTime, c), outcome, held, missBy, failed, onTime, brier: +brier.toFixed(3), late: +late.toFixed(1), overspend: Math.round(over) };
  }

}

/**
 * The week the running forecast first came within a week of the outcome: 0 for the
 * commitment, otherwise the week whose play logged it. Forecasts the game carried
 * forward (left behind the calendar, so moved up to the week being played) don't count.
 */
export function firstCloseWeek(log, outcome) {
  const e = log.find((x) => !x.carried && Math.abs(x.forecast - outcome) <= 1);
  return e ? e.week : null;
}

/**
 * How the student played, week by week, as plain facts for the reveal. For each week:
 * the tool tabs opened before it was played (in order), the change the student made
 * to the running forecast (null if they didn't touch it), the decisions that changed
 * from the week before (week 1 against the starting line: the opening crews, no shift, no
 * inspection), and the seconds it took. Plus counts, the most-checked tools, and the
 * autopilot week: the last week with any tab check, forecast change or decision change.
 */
export function playSummary(p) {
  const c = p.cfg;
  const rows = p.history.filter((h) => !h.bankrupt);
  const logAt = (w) => p.forecastLog.find((e) => e.week === w);
  const weeks = rows.map((h, i) => {
    const prev = i ? rows[i - 1] : { crews: c.crews, shift: false, inspect: 0 };
    const opened = p.deskLog.filter((d) => d.week === h.week);
    const tabs = opened.filter((d) => !d.tab.startsWith('use:') && d.tab !== 'ai-copy').map((d) => d.tab);
    const e = logAt(h.week);
    const before = p.forecastLog.filter((x) => x.week < h.week).pop();
    let forecast = null;
    if (e && e.touched && before) {
      forecast = { week: e.forecast - before.forecast, low: (e.low ?? before.low) - before.low, high: (e.high ?? before.high) - before.high, chance: (e.chance ?? before.chance) - before.chance };
      if (!forecast.week && !forecast.low && !forecast.high && !forecast.chance) forecast = null;
    }
    const decisions = { crews: h.crews - prev.crews, shift: h.shift !== prev.shift, inspect: h.inspect !== prev.inspect };
    const decided = decisions.crews !== 0 || decisions.shift || decisions.inspect;
    return { week: h.week, tabs, used: opened.some((d) => d.tab.startsWith('use:')), copied: opened.some((d) => d.tab === 'ai-copy'),
      forecast, decisions, decided, seconds: p.weekSeconds[h.week] ?? null, engaged: tabs.length > 0 || !!forecast || decided };
  });
  const counts = {};
  for (const w of weeks) for (const t of w.tabs) counts[t] = (counts[t] || 0) + 1;
  const changes = weeks.filter((w) => w.forecast);
  const lastEngaged = [...weeks].reverse().find((w) => w.engaged);
  const played = weeks.length;
  return {
    weeks, played,
    checkedWeeks: weeks.filter((w) => w.tabs.length).length,
    forecastChanges: changes.length, firstForecastChange: changes.length ? changes[0].week : null,
    decisionWeeks: weeks.filter((w) => w.decided).length,
    autopilotAfter: lastEngaged ? lastEngaged.week : 0,
    engagedToEnd: !!lastEngaged && lastEngaged.week === played,
    topTools: Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([tab, n]) => ({ tab, n })),
    secondsBeforeCommit: p.desk ? p.desk.seconds : null,
    secondsPlaying: weeks.reduce((a, w) => a + (w.seconds || 0), 0),
  };
}

/**
 * The interval (Winkler) score of an 80% range: its width, plus 2/0.2 = 10 times how
 * far the outcome falls outside it. Lower is better: narrow ranges that hold score best.
 */
export const intervalScore = (low, high, outcome) => (high - low) + 10 * Math.max(0, low - outcome) + 10 * Math.max(0, outcome - high);

/**
 * The Updating score: each forecast in force during play (the commitment, then each
 * week's running forecast) scored as 100 − 8 × |error| − updatingIntervalWeight ×
 * interval score − 40 × Brier of the week-12 chance (the Brier only while week 12 was
 * still possible), floored at 0 and averaged with week w weighted w + 1.
 */
export function updatingScore(log, outcome, onTime, cfg = CONFIG) {
  if (!log || !log.length) return null;
  let total = 0, weight = 0;
  for (const e of log) {
    const low = e.low ?? e.forecast, high = e.high ?? e.forecast;
    const brier = e.week < cfg.deadline && e.chance !== undefined ? (Math.max(0, Math.min(1, e.chance / 100)) - (onTime ? 1 : 0)) ** 2 : 0;
    const s = Math.max(0, 100 - 8 * Math.abs(outcome - e.forecast) - cfg.updatingIntervalWeight * intervalScore(low, high, outcome) - 40 * brier);
    total += (e.week + 1) * s;
    weight += e.week + 1;
  }
  return Math.round(total / weight);
}

/** The student's own tab: Your Plan & Prediction before week 1, This Week's Decisions during play. Never counted, never locked. */
export const isFront = (tab) => tab === 'commit' || tab === 'decide';

/** A tool check: opening a tool tab. The front tab, The Contract and Ask an AI don't count, nor using a tool's numbers. */
export const isCheck = (tab) => !!tab && !isFront(tab) && tab !== 'contract' && tab !== 'ai' && tab !== 'ai-copy' && !tab.startsWith('use:');

/** Tool views allowed before playing `week`: unlimited in round 1 (the briefing and week 1), then viewsPerWeek. */
export const viewLimit = (week, c = CONFIG) => (c.unlimitedRound1 && week <= 1 ? Infinity : c.viewsPerWeek);

/** Whether a tab can open, given the tool tabs already viewed this week: anything not counted, anything viewed, or while views are left. */
export const canOpen = (tab, opened, limit) => !isCheck(tab) || opened.includes(tab) || opened.filter(isCheck).length < limit;

/** Round 1's notice, shown across the top of the tab strip and in The Contract. */
export const round1Rule = (c = CONFIG) => `Round 1 only: look at everything you like. From week 2, you get ${c.viewsPerWeek} tool views a week.`;

/** The attention rule, in the briefing's words. */
export const attentionRule = (c = CONFIG) => `${c.unlimitedRound1 ? `${round1Rule(c)} ` : ''}You can view at most ${c.viewsPerWeek} tool tabs each week${c.unlimitedRound1 ? ' from week 2' : ''}. Re-opening a tab you've already viewed that week is free, and so are your own tab, The Contract and Ask an AI.`;

/** The onboarding rule, in the briefing's words. */
export const onboardingRule = (c = CONFIG) => (c.onboardingDrag === 'new'
  ? `New crews work at ${Math.round(c.onboardingFactor * 100)}% for their first ${c.onboardingWeeks} weeks.`
  : `A new crew slows the whole line to ${Math.round(c.onboardingFactor * 100)}% for ${c.onboardingWeeks} weeks.`);

/** The mid-game events a contract may face, in the briefing's words. */
export const eventRules = (c = CONFIG) => [
  c.crewOutChance > 0 && `About ${Math.round(c.crewOutChance * 100)}% of contracts lose a crew for ${c.crewOutWeeks} weeks, starting somewhere in weeks ${c.crewOutWeekRange[0]}–${c.crewOutWeekRange[1]}. You still pay it.`,
  c.delayChance > 0 && `About ${Math.round(c.delayChance * 100)}% of contracts hit a parts delay that idles ${Math.round(c.delayShare * 100)}% of the line for one week, somewhere in weeks ${c.delayWeekRange[0]}–${c.delayWeekRange[1]}.`,
].filter(Boolean);

/**
 * "3 of 40 never delivered (2 bankrupt, 1 terminated)", or null when all were delivered.
 * `what` names the contracts: failuresLine(sum, 'run like yours') gives "1 of 7 run like yours never delivered (1 bankrupt)".
 */
export function failuresLine(sum, what = '') {
  const f = sum.failed;
  if (!f || !f.total) return null;
  const parts = [f.bankrupt && `${f.bankrupt} bankrupt`, f.terminated && `${f.terminated} terminated`].filter(Boolean).join(', ');
  return `${f.total} of ${sum.n}${what ? ` ${what}` : ''} never delivered (${parts})`;
}

// ── The Decision Desk, as recorded ───────────────────────────────────────────
// What the student looked at before committing: the tool whose numbers they used (a
// tab letter, or none), how many tool tabs they opened, minutes on the briefing, and
// whether they changed the numbers they were given (the tool's, or the defaults).
export function normalizeDesk(d) {
  const tool = /^[a-z]$/.test(d.tool || '') ? d.tool : '';
  return { tool, tabs: Math.max(0, Math.min(99, Math.round(+d.tabs || 0))), minutes: Math.max(0, Math.min(99, Math.round(+d.minutes || 0))), edited: !!d.edited, copied: !!d.copied, seconds: Math.max(0, Math.round((+d.minutes || 0) * 60)), order: Array.isArray(d.order) ? d.order.map(String) : [] };
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
 * The two facts the reveal states, and the record for the plan played. Information
 * only: nothing here changes a score.
 *   held, missBy   did the 80% range hold; if not, by how many weeks (+ late, − early).
 *                  A contract never delivered (`failed`: 'bankrupt' or 'terminated') misses any range; missBy is null.
 *   kept           was the plan played the plan stated (null with no stated plan)
 * Hands-off play also returns the record of the past managers who coasted.
 */
export function judgeForecast({ forecast: f, outcome, stated, played, failed = null }, cfg = CONFIG) {
  const held = !failed && outcome >= f.low && outcome <= f.high;
  const missBy = held ? 0 : failed ? null : +(outcome > f.high ? outcome - f.high : outcome - f.low).toFixed(1);
  const matched = matchContracts(played, { cfg });
  const kept = stated ? planKept(stated, played) : null;
  let coaster = null;
  if (isHandsOff(played)) {
    const rows = matched.contracts;
    // Only contracts the record shows as run hands-off, whatever rule the match widened to.
    const coasters = pastContracts(cfg).contracts.filter((r) => r.crewsAdded === 0 && r.inspect === 0 && r.shiftWeeks === 0);
    const s = summarizeContracts(coasters, cfg);
    coaster = { n: s.n, late: coasters.filter((r) => !r.onTime).length, median: s.median, min: s.min, max: s.max, matched: rows.length !== s.n ? { n: rows.length, late: rows.filter((r) => !r.onTime).length, median: matched.median, rule: matched.rule } : null };
  }
  return { held, missBy, kept, matched, coaster };
}

// ── The outside view ─────────────────────────────────────────────────────────
// Past contracts on the same line, each run by a manager with habits of their own.
// A manager is one of eight archetypes, with parameters drawn from a fixed seed, so
// the record is the same for the whole room and on every scenario code. Managers
// play week by week and react only to what their screen shows (reported backlog,
// crews, the week), never to the hidden defects.
const PAST_SEED = 659;
const ARCHETYPES = [
  ['coaster', 0.15], ['early hirer', 0.17], ['reactive hirer', 0.17], ['staged hirer', 0.08],
  ['inspector', 0.13], ['shift runner', 0.15], ['hire + shift', 0.08], ['quality-first', 0.07],
];

function makeManager(r) {
  let u = r(), arch = ARCHETYPES[0][0];
  for (const [k, w] of ARCHETYPES) { if ((u -= w) <= 0) { arch = k; break; } }
  const pick = (a) => a[Math.floor(r() * a.length)];
  const m = { arch, hire: 0, hireWeek: 1, react: false, stage: false, inspect: 0, inspectUntil: 99, shiftFrom: 99, shiftTo: 99 };
  if (arch === 'early hirer') { m.hire = pick([1, 2, 2, 3, 3]); m.hireWeek = pick([1, 1, 2]); m.inspect = pick([0, 0, 0.1]); }
  if (arch === 'reactive hirer') { m.react = true; m.hire = pick([1, 2, 3]); m.inspect = pick([0, 0, 0.1]); }
  if (arch === 'staged hirer') { m.stage = true; m.hire = pick([2, 3]); m.inspect = pick([0, 0.1]); }
  if (arch === 'inspector') { m.inspect = pick([0.1, 0.2, 0.3]); m.inspectUntil = pick([99, 8, 10]); }
  if (arch === 'shift runner') { m.shiftFrom = pick([7, 8, 9, 10]); m.shiftTo = 11; m.inspect = pick([0, 0.1]); }
  if (arch === 'hire + shift') { m.hire = pick([1, 2]); m.hireWeek = pick([1, 2, 3]); m.shiftFrom = pick([9, 10]); m.shiftTo = 11; }
  if (arch === 'quality-first') { m.hire = pick([2, 3]); m.inspect = pick([0.1, 0.2]); m.inspectUntil = pick([9, 99]); }
  return m;
}

/** One past manager runs a contract. A reactive hirer hires once, from week 4, when the reported backlog says the deadline will slip. */
export function playManager(p, m) {
  const c = p.cfg;
  let reacted = false;
  while (!p.done) {
    const w = p.week + 1;
    let hire = 0;
    if (!m.react && !m.stage && w === m.hireWeek) hire = m.hire;
    if (m.stage && (w === 1 || w === 4)) hire = Math.ceil(m.hire / 2);
    if (m.react && !reacted && w >= 4 && w - 1 + p.backlog / Math.max(1, p.crews * c.unitsPerCrew) > c.deadline) { hire = m.hire; reacted = true; }
    p.play({ hire, inspect: w <= m.inspectUntil ? m.inspect : 0, shift: w >= m.shiftFrom && w <= m.shiftTo });
  }
  return p;
}

/**
 * The record is chronological: contract n (the newest) is the line's last contract,
 * the one the briefing tells the story of. Its manager ran it hands-off, on the
 * contract seed 'last-contract'. Every other manager is drawn from PAST_SEED.
 */
export function pastManagers(n = CONFIG.pastContracts) {
  const r = mulberry32(PAST_SEED);
  const ms = Array.from({ length: n }, () => makeManager(r));
  ms[n - 1] = { arch: 'coaster', hire: 0, hireWeek: 1, react: false, stage: false, inspect: 0, inspectUntil: 99, shiftFrom: 99, shiftTo: 99, last: true };
  return ms;
}

/** The scenario seed each past contract was played on. */
export const contractSeed = (i, n = CONFIG.pastContracts) => (i === n - 1 ? 'last-contract' : `past-${i}`);

// Six common plans, in the terms the commit screen asks for.
export const COMMON_PLANS = [
  { key: 'hands-off', label: 'Hands-off', crews: 0, inspect: 0, shift: false },
  { key: 'inspect', label: 'Inspection only', crews: 0, inspect: 0.1, shift: false },
  { key: 'crews2', label: '+2 crews', crews: 2, inspect: 0, shift: false },
  { key: 'crews3', label: '+3 crews', crews: 3, inspect: 0, shift: false },
  { key: 'crews3-inspect', label: '+3 crews, 10% inspection', crews: 3, inspect: 0.1, shift: false },
  { key: 'shift', label: 'Second shift', crews: 0, inspect: 0, shift: true },
];

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
    bankrupt: p.result === 'BANKRUPT',
    endedWeek: p.result === 'DELIVERED' ? null : p.week,
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
/**
 * Count, median, 10-90 range, full range and on-time share for any set of contracts.
 * Weeks are taken from the contracts that were delivered; those never delivered
 * (bankrupt or terminated) are counted separately. The on-time share is out of all of
 * them, with a failure counting as not on time.
 */
export function summarizeContracts(rows, cfg = CONFIG) {
  const delivered = rows.filter((r) => r.delivered !== false);
  const failed = { total: rows.length - delivered.length, bankrupt: rows.filter((r) => r.bankrupt).length, terminated: rows.filter((r) => r.delivered === false && !r.bankrupt).length };
  const sorted = delivered.map((r) => r.accepted).sort((a, b) => a - b);
  const onTimeShare = rows.length ? rows.filter((r) => r.accepted <= cfg.deadline && r.delivered !== false).length / rows.length : null;
  if (!sorted.length) return { n: rows.length, delivered: 0, failed, median: null, p10: null, p90: null, min: null, max: null, onTimeShare };
  return {
    n: rows.length, delivered: sorted.length, failed,
    median: rank(sorted, 0.5),
    p10: rank(sorted, 0.1),
    p90: rank(sorted, 0.9),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    onTimeShare,
  };
}

let _past = null;
export function pastContracts(cfg = CONFIG) {
  if (_past && cfg === CONFIG) return _past;
  const contracts = pastManagers(cfg.pastContracts)
    .map((m, i) => ({ ...contractRow(playManager(new Project(contractSeed(i, cfg.pastContracts), cfg), m), i + 1), habit: m.arch }));
  const res = { contracts, weeks: contracts.filter((r) => r.delivered).map((r) => r.accepted), ...summarizeContracts(contracts, cfg) };
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
 * match first and widens only until at least `min` delivered contracts qualify:
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
    // Widen until at least `min` of the matches were delivered, so the weeks quoted rest on real outcomes.
    if (contracts.filter((r) => r.delivered !== false).length >= min || rule === 'all contracts') return { rule, contracts, ...summarizeContracts(contracts, cfg) };
  }
  return null;
}

// ── The line's last contract (record #40, the newest in the record) ─────────────
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
