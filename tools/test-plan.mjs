// Tests for the game engine (frontend/src/plan/engine.js).
import { Project, CONFIG, COMMON_PLANS, pastContracts, lastContract, historyMean, parseResultCode, playPolicy, matchContracts, planFromProject, summarizeContracts } from '../frontend/src/plan/engine.js';

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
