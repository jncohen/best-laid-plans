// Tests for the game engine (frontend/src/plan/engine.js).
import { Project, CONFIG, COMMON_PLANS, pastContracts, lastContract, historyMean, parseResultCode, playPolicy, matchContracts, planFromProject, summarizeContracts,
  encodePlan, decodePlan, normalizePlan, playedPlan, judgeForecast } from '../frontend/src/plan/engine.js';
import { filterContracts, filterForPlan, sortContracts } from '../frontend/src/plan/table.js';

let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

const runPolicy = (seed, d) => { const p = new Project(seed); p.commit({ week: 11, low: 10, high: 13, onTimeChance: 60 }); return playPolicy(p, d); };

console.log('Determinism and fairness');
{
  const a = runPolicy('room-1', { hire: 2, inspect: 0.1 });
  const b = runPolicy('room-1', { hire: 2, inspect: 0.1 });
  t('same seed and decisions give the same history', JSON.stringify(a.history) === JSON.stringify(b.history));
  const c = runPolicy('room-1', { hire: 0, inspect: 0 });
  t('the shock is the same whatever the player does', a.shockWeek === c.shockWeek && a.shockSize === c.shockSize);
  t('contract difficulty is the same whatever the player does', a.productivity === c.productivity && a.defectProne === c.defectProne);
  t('seed text is case-insensitive', new Project('Room-1').seed === new Project('room-1').seed);
}

console.log('The dashboard flatters, the truth catches up');
{
  let reportedNeverBelowTrue = true, acceptedOnlyWhenClean = true, rejectionsSeen = 0;
  for (let i = 0; i < 300; i++) {
    const p = runPolicy(`t${i}`, { hire: i % 4, inspect: CONFIG.inspectionOptions[i % 4] });
    for (const h of p.history) if (h.reported + 1e-9 < h.true) reportedNeverBelowTrue = false;
    if (p.result === 'DELIVERED' && p.hidden > 0) acceptedOnlyWhenClean = false;
    if (p.history.some((h) => h.rejected > 0)) rejectionsSeen++;
  }
  t('reported % complete is never below true % complete', reportedNeverBelowTrue);
  t('a contract is accepted only with no hidden defects left', acceptedOnlyWhenClean);
  t('the acceptance test rejects units in most runs', rejectionsSeen > 150);
  const flat = runPolicy('flat', { hire: 0, inspect: 0 });
  t('building flat out, the dashboard reaches 90% before the contract is accepted', flat.ninetyWeek() < flat.finishWeek);
}

console.log('Inspection finds defects early');
{
  const hiddenAt = (insp) => {
    let s = 0;
    for (let i = 0; i < 200; i++) { const p = new Project(`i${i}`); for (let w = 0; w < 6; w++) p.play({ hire: 0, inspect: insp }); s += p.hidden; }
    return s / 200;
  };
  t('more inspection leaves fewer hidden defects at week 6', hiddenAt(0.3) < hiddenAt(0.1) && hiddenAt(0.1) < hiddenAt(0));
}

console.log('Money and staffing');
{
  const p = new Project('money');
  const quoted = p.weekCost({ hire: 2, shift: true });
  const before = p.budget;
  p.play({ hire: 2, shift: true });
  t('the quoted week cost is what is charged', before - p.budget === quoted);
  const q = new Project('caps');
  q.play({ hire: 99 });
  t('hiring is capped per week', q.crews === CONFIG.crews + CONFIG.maxHirePerWeek);
  const r = new Project('floor');
  r.play({ hire: -99 });
  t('the last crew cannot be released', r.crews === 1);
}

console.log('The briefing is the engine\'s own record');
{
  const last = lastContract();
  const mean = last.history.reduce((a, b) => a + b, 0) / last.history.length;
  t('briefing pace is the mean of the last contract\'s reported weeks', Math.abs(mean - historyMean()) < 0.06);
  t('last contract: dashboard read 100% before it was accepted', last.dashboardFullWeek < last.deliveredWeek);
  const past = pastContracts();
  t('past contracts have the configured count', past.weeks.length === CONFIG.pastContracts);
  t('past contracts: p10 <= median <= p90', past.p10 <= past.median && past.median <= past.p90);
  t('the outside view is later than the inside view', past.median > CONFIG.scope / historyMean());
}

console.log('The numbers the lecture quotes');
{
  const last = lastContract();
  t('briefing pace is 19.1 units a week', historyMean() === 19.1);
  t('dashboard projection is 10.5 weeks', (CONFIG.scope / historyMean()).toFixed(1) === '10.5');
  t('last contract: dashboard 100% in week 13', last.dashboardFullWeek === 13);
  t('last contract: accepted in week 17', last.deliveredWeek === 17);
  t('last contract: 19 units rejected at acceptance', last.rejected === 19);
  const ledger = new Project('ledger'), compass = new Project('compass');
  t('seed ledger: scope change in week 4, +15 units', ledger.shockWeek === 4 && ledger.shockSize === 15);
  t('seed compass: scope change in week 6, +19 units', compass.shockWeek === 6 && compass.shockSize === 19);
  const past = pastContracts();
  t('all 40 past contracts: median 14', past.median === 14);
  t('all 40 past contracts: 10-90 range 12-17', past.p10 === 12 && past.p90 === 17);
  t('all 40 past contracts: 6 on time', past.contracts.filter((r) => r.onTime).length === 6);
}

console.log('The past contracts are a table');
{
  const past = pastContracts();
  const rows = past.contracts;
  const fields = ['id', 'crewsAdded', 'hires', 'inspect', 'shiftWeeks', 'scopeWeek', 'scopeUnits', 'dashboardFullWeek', 'rejected', 'accepted', 'onTime'];
  t('every contract records every field', rows.length === CONFIG.pastContracts && rows.every((r) => fields.every((f) => r[f] !== undefined && r[f] !== null)));
  t('ids run 1 to 40', rows.every((r, i) => r.id === i + 1));
  t('crews added match the hire log', rows.every((r) => r.hires.reduce((a, h) => a + h.crews, 0) === r.crewsAdded));
  t('dashboard reads 100% no later than acceptance', rows.every((r) => r.dashboardFullWeek <= r.accepted));
  t('on time means accepted by the deadline', rows.every((r) => r.onTime === (r.delivered && r.accepted <= CONFIG.deadline)));
  t('weeks list matches the table', past.weeks.every((w, i) => w === rows[i].accepted));
  const again = pastContracts({ ...CONFIG });
  t('the record is rebuilt identically (deterministic)', JSON.stringify(again.contracts) === JSON.stringify(rows));
  for (let i = 0; i < 5; i++) { const p = new Project(`other-${i}`); playPolicy(p, { hire: 1 }); }
  t('playing other seeds does not change the record', JSON.stringify(pastContracts().contracts) === JSON.stringify(rows));
  const s = summarizeContracts(rows);
  t('summary: min <= p10 <= median <= p90 <= max', s.min <= s.p10 && s.p10 <= s.median && s.median <= s.p90 && s.p90 <= s.max);
  t('summary of nothing is empty', summarizeContracts([]).n === 0);
}

console.log('Matching past contracts to a plan');
{
  for (const cp of COMMON_PLANS) {
    const m = matchContracts(cp);
    t(`${cp.label}: at least 5 contracts match closely`, m.rule === 'crews, inspection and shift' && m.n >= 5
      && m.contracts.every((r) => r.crewsAdded === cp.crews && (r.inspect > 0) === (cp.inspect > 0) && (r.shiftWeeks > 0) === cp.shift));
  }
  const odd = matchContracts({ crews: 5, inspect: 0.3, shift: true });
  t('an unusual plan still gets at least 5 contracts, under a wider rule', odd.n >= 5 && odd.rule !== 'crews, inspection and shift');
  const p = runPolicy('plan-of', { hire: 3, inspect: 0.1, shiftFrom: 10, shiftTo: 11 });
  const plan = planFromProject(p);
  t('what was played reads back as a plan', plan.crews === 3 && plan.inspect === 0.1 && plan.shift === true);
  const flat = planFromProject(runPolicy('plan-flat', {}));
  t('hands-off play reads back as hands-off', flat.crews === 0 && flat.inspect === 0 && flat.shift === false);
}

console.log('Scores and result codes');
{
  const p = runPolicy('score', { hire: 3, inspect: 0.1 });
  const s = p.scores();
  t('scores are within 0-100', s.delivery >= 0 && s.delivery <= 100 && s.forecast >= 0 && s.forecast <= 100);
  const code = p.resultCode("O'Brien, J.!");
  const r = parseResultCode(code);
  t('a result code round-trips', r && r.seed === p.seed && r.week === 11 && r.low === 10 && r.high === 13 && r.onTimeChance === 60 && r.outcome === s.outcome);
  t('the name in a code is sanitised', r && !r.name.includes('|') && !r.name.includes(','));
  t('junk is not a result code', parseResultCode('hello') === null && parseResultCode('BLP1|x|y') === null);
  const term = new Project('term');
  term.commit({ week: 12, low: 11, high: 13, onTimeChance: 50 });
  while (!term.done) term.play({ hire: -3, inspect: 0.3 });
  t('a terminated contract scores 0 on delivery and projects a later outcome', term.result !== 'TERMINATED' || (term.scores().delivery === 0 && term.outcomeWeek() > CONFIG.horizon - 1));
}

console.log('Fairness invariants');
{
  const world = (p) => JSON.stringify([p.shockWeek, p.shockTail, p.shockSize, p.productivity, p.defectProne, p._noise]);
  const forecasts = [{ week: 8, low: 6, high: 9, onTimeChance: 100 }, { week: 12, low: 11, high: 13, onTimeChance: 50 }, { week: 20, low: 15, high: 24, onTimeChance: 0 }];
  const plans = [null, { crews: 0, inspect: 0, shift: 'none' }, { crews: 3, inspect: 0.1, shift: 'none' }, { crews: 1, inspect: 0.3, shift: 'every' }];
  const policies = [{}, { hire: 3, inspect: 0.1 }, { hire: 2, shiftFrom: 1 }, { hire: -2, inspect: 0.3 }];
  let sameWorld = true, sameOutcome = true;
  for (const seed of ['ledger', 'compass', 'fair-1', 'fair-2']) {
    const ref = world(new Project(seed));
    for (const pol of policies) {
      let base = null;
      for (const f of forecasts) for (const plan of plans) {
        const p = new Project(seed);
        p.commit({ ...f, plan });
        if (world(p) !== ref) sameWorld = false;
        playPolicy(p, pol);
        if (world(p) !== ref) sameWorld = false;
        const h = JSON.stringify([p.history, p.result, p.outcomeWeek(), p.spent]);
        if (base === null) base = h; else if (h !== base) sameOutcome = false;
      }
    }
  }
  t('1. the world on a code is drawn before play and identical whatever is committed or played', sameWorld);
  t('2. the forecast and the stated plan never change an outcome', sameOutcome);
  const past = pastContracts();
  const rebuilt = past.contracts.every((r, i) => {
    const p = new Project(`past-${i}`);
    return p.shockWeek === r.scopeWeek && p.shockSize === r.scopeUnits;
  });
  t('3. the past contracts are drawn by the same engine (their scope changes are the engine\'s own draws)', rebuilt);
  t('3. past scope changes come from the same distributions as the student\'s', past.contracts.every((r) => r.scopeWeek >= CONFIG.shockWeeks[0] && r.scopeWeek <= CONFIG.shockWeeks[1]
    && ((r.scopeUnits >= CONFIG.shockUnits[0] && r.scopeUnits <= CONFIG.shockUnits[1]) || (r.scopeUnits >= CONFIG.shockTailUnits[0] && r.scopeUnits <= CONFIG.shockTailUnits[1]))));
  const fresh = playPolicy(new Project('past-0'), { hire: 0, inspect: 0 }).outcomeWeek();
  t('3. a past contract replays to the same outcome in a fresh engine', fresh === past.contracts[0].accepted);
}

console.log('Plans in result codes');
{
  for (const plan of [{ crews: 0, inspect: 0, shift: 'none' }, { crews: 3, inspect: 0.1, shift: 'none' }, { crews: 2, inspect: 0.3, shift: 'every' }, { crews: 1, inspect: 0.2, shift: 'late' }]) {
    t(`plan ${encodePlan(plan)} encodes and decodes`, JSON.stringify(decodePlan(encodePlan(plan))) === JSON.stringify(normalizePlan(plan)));
  }
  const kept = new Project('code-kept');
  kept.commit({ week: 13, low: 11, high: 14, onTimeChance: 45, plan: { crews: 3, inspect: 0.1, shift: 'none' } });
  playPolicy(kept, { hire: 3, inspect: 0.1 });
  const ck = kept.resultCode('Alex');
  const rk = parseResultCode(ck);
  t('a kept plan adds three characters to the code', ck.split('|')[10] === '31n');
  t('a BLP2 code round-trips the plan', rk && rk.version === 2 && JSON.stringify(rk.plan) === JSON.stringify(kept.plan) && JSON.stringify(rk.played) === JSON.stringify(playedPlan(kept)) && rk.name === 'Alex');
  const changed = new Project('code-changed');
  changed.commit({ week: 11, low: 10, high: 12, onTimeChance: 75, plan: { crews: 0, inspect: 0, shift: 'none' } });
  playPolicy(changed, { hire: 3, inspect: 0.1 });
  const rc = parseResultCode(changed.resultCode('B'));
  t('a changed plan carries both plans', changed.resultCode('B').split('|')[10] === '00n31n' && rc.plan.crews === 0 && rc.played.crews === 3);
  t('every field of a BLP2 code round-trips', rc.week === 11 && rc.low === 10 && rc.high === 12 && rc.onTimeChance === 75 && rc.outcome === changed.scores().outcome && rc.seed === changed.seed);
  const old = parseResultCode('BLP1|1u65p58|11|10|12|75|12|D|10|4500|Alex');
  t('old BLP1 codes still parse, with no plan', old && old.version === 1 && old.week === 11 && old.outcome === 12 && old.name === 'Alex' && old.plan === null);
  t('old BLP1 codes with no name still parse', parseResultCode('BLP1|1u65p58|11|10|12|75|12|D|10|4500')?.name === '');
  t('a BLP2 code with a garbled plan still parses, without the plan', parseResultCode('BLP2|1u65p58|11|10|12|75|12|D|10|4500|9xq|A')?.plan === null);
  t('codes read aloud may come back in lower case', parseResultCode('blp2|1u65p58|11|10|12|75|12|d|10|4500|31N|a')?.plan?.crews === 3);
}

console.log('The table summarises what matchContracts finds');
{
  const rows = pastContracts().contracts;
  for (const cp of COMMON_PLANS) {
    const m = matchContracts(cp);
    const f = filterContracts(rows, filterForPlan(cp));
    const s = summarizeContracts(f);
    t(`${cp.label}: table filter = matchContracts (n ${m.n}, median ${m.median}, ${m.p10}-${m.p90})`,
      JSON.stringify(f.map((r) => r.id)) === JSON.stringify(m.contracts.map((r) => r.id))
      && s.n === m.n && s.median === m.median && s.p10 === m.p10 && s.p90 === m.p90 && s.onTimeShare === m.onTimeShare);
  }
  t('no filter is all 40', filterContracts(rows).length === CONFIG.pastContracts);
  const sorted = sortContracts(rows, 'accepted', -1);
  t('sorting by acceptance week puts the latest first and keeps every row', sorted.length === rows.length && sorted.every((r, i) => !i || sorted[i - 1].accepted >= r.accepted));
  t('a stated "late weeks" shift matches the second-shift contracts', matchContracts({ crews: 0, inspect: 0, shift: 'late' }).contracts.every((r) => r.shiftWeeks > 0));
  t('a stated "no shift" plan does not match the second-shift contracts', matchContracts({ crews: 0, inspect: 0, shift: 'none' }).contracts.every((r) => r.shiftWeeks === 0));
}

console.log('Verdicts on ledger');
{
  const HANDS_OFF = { crews: 0, inspect: 0, shift: 'none' }, C3I = { crews: 3, inspect: 0.1, shift: 'none' };
  const judge = (f, plan, pol) => {
    const p = new Project('ledger');
    p.commit({ ...f, plan });
    playPolicy(p, pol);
    return { p, j: judgeForecast({ forecast: p.forecast, outcome: p.scores().outcome, stated: p.plan, played: playedPlan(p) }) };
  };
  const pace = { week: 11, low: 10, high: 12, onTimeChance: 75 };
  const a = judge(pace, HANDS_OFF, { hire: 3, inspect: 0.1 });
  t('pace, stated hands-off, plays +3/10%: week 12, range held, Lucky (plan changed)', a.p.scores().outcome === 12 && a.j.held && a.j.verdict === 'lucky' && a.j.why === 'changed' && !a.j.coaster);
  const b = judge({ week: 13, low: 11, high: 14, onTimeChance: 45 }, C3I, { hire: 3, inspect: 0.1 });
  t('matched record for +3/10%, stated and played: Reasoned', b.j.verdict === 'reasoned' && b.j.matched.median === 13 && b.j.matched.p10 === 11 && b.j.matched.p90 === 14);
  const c = judge({ week: 14, low: 12, high: 17, onTimeChance: 15 }, HANDS_OFF, {});
  t('all-40 record, stated and played hands-off: week 17, held, Lucky (off the coasters\' record), coaster line', c.p.scores().outcome === 17 && c.j.held && c.j.verdict === 'lucky' && c.j.why === 'off-record'
    && c.j.coaster && c.j.coaster.n === 7 && c.j.coaster.late === 7 && c.j.coaster.median === 17);
  const d = judge(pace, HANDS_OFF, {});
  t('pace, stated and played hands-off: Missed, with the coaster line', d.j.verdict === 'missed' && d.j.coaster?.n === 7);
  const e = judge(pace, C3I, { hire: 3, inspect: 0.1 });
  t('pace with the best plan stated and played: still Lucky, not Reasoned', e.j.held && e.j.verdict === 'lucky');
  t('the verdict never changes a score', a.p.scores().forecast === 90 && judge(pace, C3I, { hire: 3, inspect: 0.1 }).p.scores().forecast === 90);
  t('a code without a plan gets no verdict for a held range', judgeForecast({ forecast: pace, outcome: 12, stated: null, played: C3I }).verdict === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
