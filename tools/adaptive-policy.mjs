// A screen-only adaptive manager: re-estimates the line's rate each week from the
// dashboard, sizes the crew to finish by a target week within the money it has,
// sheds crews when comfortably ahead, and sets inspection from what inspection finds.
// It reads only what the play screen shows: each week's units built, defects found,
// units rejected, crews, inspection, shift, scope added, events, budget and units left.
export function adaptive(p, w, k = {}) {
  k = { ...JSON.parse((typeof process !== 'undefined' && process.env.ADAPT) || '{}'), ...k };
  const c = p.cfg, h = p.history;
  const A = { open: 3, inspect: 0.1, target: 11.6, scope: 17, rework: 3.5, reworkInspected: 1.8, findsTypical: 0.07, findsHigh: 0.11, findsLow: 0.04, lastHire: 8, releaseFrom: 4, release: 1.2, cash: 0.55, ...k };
  if (w === 1) return { hire: A.open, inspect: A.inspect, projected: null };
  // The line's rate per crew-week, from clean weeks: no onboarding, no crew out, no parts delay.
  let built = 0, effort = 0;
  h.forEach((r, i) => {
    const prev = i ? h[i - 1].crews : c.crews, prev2 = i > 1 ? h[i - 2].crews : c.crews;
    const onboarding = r.crews > prev || (i > 0 && prev > prev2);
    const disturbed = r.events.some((e) => /crew is out|parts delay/.test(e)) || (i > 0 && h[i - 1].events.some((e) => /crew is out/.test(e)));
    if (r.built <= 0 || r.backlog < 0.5 || onboarding || disturbed) return;
    built += r.built;
    effort += r.crews * (1 - r.inspect) * (r.shift ? c.shiftBoost : 1) * (1 - c.coordinationLoss * Math.max(0, r.crews - c.crews));
  });
  const perCrew = effort > 0 ? built / effort : 19.1 / 4;
  const inspected = h.filter((r) => r.inspect > 0);
  const findRate = inspected.length ? inspected.reduce((a, r) => a + r.found, 0) / Math.max(1, inspected.reduce((a, r) => a + r.built, 0)) : A.findsTypical;
  const inspect = w <= 9 ? (findRate > A.findsHigh ? 0.2 : findRate < A.findsLow && w > 4 ? 0 : 0.1) : 0;
  const extra = h.some((r) => r.shock > 0) ? 0 : A.scope;
  const defectScale = Math.max(0.5, Math.min(2.2, findRate / A.findsTypical));
  const tested = h.some((r) => r.rejected > 0);
  const finish = (n, insp, adding) => {
    const rate = (n - (adding ? adding * (1 - c.onboardingFactor) * (c.onboardingDrag === 'new' ? 1 : n / Math.max(1, adding)) * (c.onboardingWeeks / 4) : 0)) * perCrew * (1 - insp) * (1 - c.coordinationLoss * Math.max(0, n - c.crews));
    const weeks = (p.backlog + extra) / Math.max(1, rate);
    return { at: w - 1 + weeks + (tested ? 0 : (insp > 0 ? A.reworkInspected : A.rework) * defectScale), weeks };
  };
  // Payroll comes in whole weeks, through to acceptance (rework included).
  const cashFor = (n, weeks, adding) => p.spent + n * c.crewWeek * Math.max(1, Math.ceil(weeks)) + adding * c.hireFee;
  const limit = c.budget + c.creditLine * A.cash;
  const affordable = (n, adding) => cashFor(n, finish(n, inspect, adding).at - (w - 1), adding) <= limit;
  let hire = 0;
  if (w <= A.lastHire) {
    let pick = p.crews;
    for (let n = p.crews; n <= Math.min(c.maxCrews, p.crews + c.maxHirePerWeek); n++) {
      if (!affordable(n, n - p.crews)) break;
      pick = n;
      if (finish(n, inspect, n - p.crews).at <= A.target) break;
    }
    hire = pick - p.crews;
  }
  if (hire === 0 && w >= A.releaseFrom && p.crews > c.crews && finish(p.crews - 1, inspect, 0).at <= A.target - A.release) hire = -1;
  // Near the end, keep only the crews the last of the work needs.
  const needed = Math.max(1, Math.ceil(p.backlog / Math.max(1, perCrew * (1 - inspect))));
  if (hire <= 0 && tested && p.crews > needed) hire = -Math.min(p.crews - needed, p.crews - 1);
  // Shed a crew to stay solvent only if the smaller line still finishes before the customer would terminate.
  if (hire === 0 && p.crews > 1 && !affordable(p.crews, 0) && finish(p.crews - 1, inspect, 0).at <= c.horizon - 1) hire = -1;
  const now = finish(p.crews + hire, inspect, Math.max(0, hire));
  const shift = w >= 9 && now.at > c.deadline && now.at < c.deadline + 2 && cashFor(p.crews, now.weeks, 0) + p.crews * c.shiftPremiumPerCrew * 3 <= limit;
  // The projected acceptance week, for a forecaster who uses the same reading of the screen.
  return { hire, inspect, shift, projected: finish(p.crews + hire, inspect, Math.max(0, hire)).at };
}
