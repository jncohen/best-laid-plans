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

/**
 * A careful forecaster's weekly forecast, from the screen only (desk.js liveScreen and
 * screenData): this contract's build rate from clean weeks, its defect rate from the
 * inspectors' samples, the defects still hidden (sampled defects built, less those found
 * and rejected), how much of the hidden stock inspection finds each week, and the record
 * for what is still to come (scope change, crew out, parts delay). It plays the week's
 * decision forward, then the line as it stands, through the acceptance test, over
 * scenarios drawn from the record, and reports the median and 10th-90th percentile.
 */
export function screenForecast(S, L, d, k = {}) {
  const R = S.rules, rows = L.rows, w = L.week + 1;
  const K = { runs: 60, prior: 0.12, pad: 0.5, ...k };
  // Build rate per crew-week, from weeks without onboarding, a crew out or a parts delay.
  let built = 0, effort = 0;
  rows.forEach((r, i) => {
    const prev = i ? rows[i - 1].crews : R.crews, prev2 = i > 1 ? rows[i - 2].crews : R.crews;
    const onboarding = r.crews > prev || (i > 0 && prev > prev2);
    const disturbed = r.events.some((e) => /crew is out|parts delay/.test(e)) || (i > 0 && rows[i - 1].events.some((e) => /crew is out/.test(e)));
    if (r.built <= 0 || r.backlog < 0.5 || onboarding || disturbed) return;
    built += r.built;
    effort += r.crews * (1 - r.inspect) * (r.shift ? R.shiftBoost : 1) * (1 - R.coordinationLoss * Math.max(0, r.crews - R.crews));
  });
  const perCrew = effort > 0 ? built / effort : S.history.reduce((a, b) => a + b, 0) / S.history.length / R.crews;
  const samples = rows.filter((r) => r.sampled !== null && r.sampled !== undefined);
  const rate = samples.length ? samples.reduce((a, r) => a + r.sampled, 0) / samples.length : K.prior;
  // Hidden defects: what the sampled rate says was built bad, less what was found or rejected.
  let hidden = 0, findBase = 0, findHit = 0;
  for (const r of rows) {
    const bad = r.built * (r.sampled ?? rate);
    if (r.inspect > 0 && r.rejected === 0) { findBase += hidden + bad; findHit += r.found; }
    hidden = Math.max(0, hidden + bad - r.found - r.rejected);
  }
  const findShare = findBase > 1 ? Math.min(0.9, findHit / findBase) : 0.35;
  const trickle = 0.05;
  const scopeSeen = rows.some((r) => r.shock > 0);
  const outSeen = rows.some((r) => r.events.some((e) => /crew is out/.test(e)));
  const delaySeen = rows.some((r) => r.events.some((e) => /parts delay/.test(e)));
  const future = S.contracts.filter((c) => c.scopeWeek >= w);
  let seed = 7 + w;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const sims = [];
  for (let i = 0; i < K.runs; i++) {
    const sc = !scopeSeen && future.length ? future[Math.floor(rnd() * future.length)] : null;
    const outAt = !outSeen && rnd() < R.crewOutChance ? Math.max(w, R.crewOutWeekRange[0] + Math.floor(rnd() * (R.crewOutWeekRange[1] - R.crewOutWeekRange[0] + 1))) : null;
    const delayAt = !delaySeen && rnd() < R.delayChance ? R.delayWeekRange[0] + Math.floor(rnd() * (R.delayWeekRange[1] - R.delayWeekRange[0] + 1)) : null;
    let left = L.backlog, H = hidden, crews = Math.max(1, L.crews + (d.hire || 0)), onboard = (d.hire || 0) > 0 ? R.onboardingWeeks : L.onboarding ? 1 : 0, adding = Math.max(0, d.hire || 0), wk = w - 1;
    while (wk < 40) {
      wk++;
      const insp = wk === w ? d.inspect || 0 : wk <= 9 ? d.inspect || 0 : 0;
      const shift = wk === w && d.shift;
      const out = outAt !== null && wk >= outAt && wk < outAt + R.crewOutWeeks ? 1 : 0;
      const atWork = (onboard > 0 ? crews - adding * (1 - R.onboardingFactor) : crews) - out;
      const cap = atWork * perCrew * (1 - R.coordinationLoss * Math.max(0, crews - R.crews)) * (wk === delayAt ? 1 - R.delayShare : 1) * (shift ? R.shiftBoost : 1);
      const b = Math.min(left, cap * (1 - insp));
      left -= b; H += b * rate;
      if (sc && wk === sc.scopeWeek) left += sc.scopeUnits;
      if (onboard > 0) onboard--;
      if (left < 0.5) {
        if (H < 0.5) break;
        left = H * R.lateFixMultiplier; H = 0;
      } else {
        const f = H * (insp > 0 ? findShare : trickle); H -= f; left += f;
      }
    }
    sims.push(wk);
  }
  sims.sort((a, b) => a - b);
  const at = (q) => sims[Math.max(0, Math.ceil(q * sims.length) - 1)];
  const week = at(0.5);
  return { week, low: Math.max(w, Math.floor(at(0.1) - K.pad)), high: Math.ceil(at(0.9) + K.pad), chance: Math.round((100 * sims.filter((x) => x <= R.deadline).length) / sims.length), rate, hidden, findShare, perCrew };
}
