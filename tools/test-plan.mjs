// Tests for the game engine (frontend/src/plan/engine.js).
import { Project, CONFIG, COMMON_PLANS, pastContracts, lastContract, historyMean, playPolicy, matchContracts, planFromProject, summarizeContracts,
  encodePlan, decodePlan, normalizePlan, playedPlan, judgeForecast } from '../frontend/src/plan/engine.js';
import { filterContracts, filterForPlan, sortContracts } from '../frontend/src/plan/table.js';
import { pastManagers, playManager, contractSeed, firstCloseWeek, playSummary, isCheck, forecastScore, forecastParts, dashboardPeak } from '../frontend/src/plan/engine.js';
import { FORECASTERS, screenData, allForecasts, statusReport, schedule, lastFive, records, teamChat, costManagement, liveScreen, LIVE_FIELDS, LIVE_ROW_FIELDS, TABS } from '../frontend/src/plan/desk.js';
import { readFileSync } from 'node:fs';
import { gameFacts, luckReplay, resultsText, checkingSummary } from '../frontend/src/plan/facts.js';
import { comparisonRows, aiPrompt, recordsCsv, projectControls, whatIf } from '../frontend/src/plan/desk.js';

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
  t('past contracts have the configured count', past.contracts.length === CONFIG.pastContracts && past.weeks.length === past.delivered);
  t('past contracts: p10 <= median <= p90', past.p10 <= past.median && past.median <= past.p90);
  t('the outside view is later than the inside view', past.median > CONFIG.scope / historyMean());
}

console.log('The record is chronological; #40 is the last contract');
{
  const r40 = pastContracts().contracts[CONFIG.pastContracts - 1], l = lastContract();
  t('record #40 is the last contract: dashboard 100% wk 13, accepted wk 17, 19 rejected, run hands-off', r40.dashboardFullWeek === l.dashboardFullWeek && r40.accepted === l.deliveredWeek && r40.rejected === l.rejected
    && r40.crewsAdded === 0 && r40.inspect === 0 && r40.shiftWeeks === 0);
}

console.log('The numbers the lecture quotes');
{
  const last = lastContract();
  // The desk build's numbers (option a, Oct 17); live 1.1.0 and Monday's lecture keep 19.1, 13 -> 17 / 19, 14, 12-17, 6 of 40.
  t('briefing pace is 19.1 units a week', historyMean() === 19.1);
  t('dashboard projection is 10.5 weeks', (CONFIG.scope / historyMean()).toFixed(1) === '10.5');
  t('last contract: dashboard 100% in week 13', last.dashboardFullWeek === 13);
  t('last contract: accepted in week 17', last.deliveredWeek === 17);
  t('last contract: 20 units rejected at acceptance (whole units, each costing 2 to fix)', last.rejected === 20);
  const ledger = new Project('ledger'), compass = new Project('compass');
  t('seed ledger: scope change in week 4, +15 units', ledger.shockWeek === 4 && ledger.shockSize === 15);
  t('seed compass: scope change in week 6, +19 units', compass.shockWeek === 6 && compass.shockSize === 19);
  const past = pastContracts();
  t('all 40 past contracts: median 14 (of the 38 delivered)', past.median === 14 && past.delivered === 38);
  t('all 40 past contracts: 10-90 range 12-17, from delivered contracts only', past.p10 === 12 && past.p90 === 17);
  t('all 40 past contracts: 7 on time', past.contracts.filter((r) => r.onTime).length === 7);
  t('2 of the 40 past managers went bankrupt, none was terminated', past.contracts.filter((r) => r.bankrupt).length === 2 && past.contracts.every((r) => r.delivered || r.bankrupt));
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
  t('weeks list is the delivered contracts\' acceptance weeks', JSON.stringify(past.weeks) === JSON.stringify(rows.filter((r) => r.delivered).map((r) => r.accepted)));
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
    // Crews within one come before dropping crews: "crews within one" may mix inspection and shift,
    // "inspection and shift" drops crews (and says so).
    const crewsOk = m.rule === 'inspection and shift' || m.contracts.every((r) => Math.abs(r.crewsAdded - cp.crews) <= 1);
    const sameOk = m.rule === 'crews within one' || m.contracts.every((r) => (r.inspect > 0) === (cp.inspect > 0) && (r.shiftWeeks > 0) === cp.shift);
    t(`${cp.label}: at least 5 contracts match (n ${m.n}, ${m.rule})`, m.n >= 5 && m.rule !== 'all contracts' && crewsOk && sameOk && m.crewsDropped === (m.rule === 'inspection and shift'));
  }
  const far = matchContracts({ crews: 7, inspect: 0.3, shift: 'every' });
  t('a plan no past manager ran drops crews, and says so', far.crewsDropped === true && ['inspection and shift', 'all contracts'].includes(far.rule) && matchContracts(COMMON_PLANS[1]).rule === 'crews within one' && matchContracts(COMMON_PLANS[1]).crewsDropped === false);
  const odd = matchContracts({ crews: 5, inspect: 0.3, shift: true });
  t('an unusual plan still gets at least 5 contracts, under a wider rule', odd.n >= 5 && odd.rule !== 'crews, inspection and shift');
  const p = runPolicy('plan-of', { hire: 3, inspect: 0.1, shiftFrom: 10, shiftTo: 11 });
  const plan = planFromProject(p);
  t('what was played reads back as a plan', plan.crews === 3 && plan.inspect === 0.1 && plan.shift === true);
  const flat = planFromProject(runPolicy('plan-flat', {}));
  t('hands-off play reads back as hands-off', flat.crews === 0 && flat.inspect === 0 && flat.shift === false);
}

console.log('Scores');
{
  const p = runPolicy('score', { hire: 3, inspect: 0.1 });
  const s = p.scores();
  t('scores are within 0-100', s.delivery >= 0 && s.delivery <= 100 && s.forecast >= 0 && s.forecast <= 100);
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
    const p = new Project(contractSeed(i));
    return p.shockWeek === r.scopeWeek && p.shockSize === r.scopeUnits;
  });
  t('3. the past contracts are drawn by the same engine (their scope changes are the engine\'s own draws)', rebuilt);
  t('3. past scope changes come from the same distributions as the student\'s', past.contracts.every((r) => r.scopeWeek >= CONFIG.shockWeeks[0] && r.scopeWeek <= CONFIG.shockWeeks[1]
    && ((r.scopeUnits >= CONFIG.shockUnits[0] && r.scopeUnits <= CONFIG.shockUnits[1]) || (r.scopeUnits >= CONFIG.shockTailUnits[0] && r.scopeUnits <= CONFIG.shockTailUnits[1]))));
  const managers = pastManagers();
  t('3. every past contract replays to the same outcome in a fresh engine', managers.every((m, i) => playManager(new Project(contractSeed(i)), m).outcomeWeek() === past.contracts[i].accepted));
  t('3. the record’s managers are drawn from a fixed seed', JSON.stringify(pastManagers()) === JSON.stringify(managers) && new Set(managers.map((m) => m.arch)).size === 8);
  t('3. the record has variety: at least 20 distinct plans, hires in week 1 and later', new Set(past.contracts.map((r) => `${r.crewsAdded}|${r.hires.map((h) => h.week)}|${r.inspect}|${r.shiftWeeks}`)).size >= 20
    && past.contracts.some((r) => r.hires.some((h) => h.week >= 4)));
}

console.log('Plans');
{
  for (const plan of [{ crews: 0, inspect: 0, shift: 'none' }, { crews: 3, inspect: 0.1, shift: 'none' }, { crews: 2, inspect: 0.3, shift: 'every' }, { crews: 1, inspect: 0.2, shift: 'late' }]) {
    t(`plan ${encodePlan(plan)} encodes and decodes`, JSON.stringify(decodePlan(encodePlan(plan))) === JSON.stringify(normalizePlan(plan)));
  }
}

console.log('The table summarises what matchContracts finds');
{
  const rows = pastContracts().contracts;
  for (const cp of COMMON_PLANS) {
    const m = matchContracts(cp);
    // The closest rule is the table's own filters; "crews within one" is three crew filters together.
    const base = filterForPlan(cp);
    const f = m.rule === 'crews, inspection and shift' ? filterContracts(rows, base)
      : m.rule === 'inspection and shift' ? filterContracts(rows, { ...base, crews: 'any' })
      : m.rule === 'crews within one' ? rows.filter((r) => [cp.crews - 1, cp.crews, cp.crews + 1].some((c) => filterContracts([r], { crews: c }).length))
      : rows.filter((r) => [cp.crews - 1, cp.crews, cp.crews + 1].some((c) => filterContracts([r], { ...base, crews: c }).length));
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

console.log('The two facts on ledger');
{
  const HANDS_OFF = { crews: 0, inspect: 0, shift: 'none' }, C3I = { crews: 3, inspect: 0.1, shift: 'none' };
  const judge = (f, plan, pol) => {
    const p = new Project('ledger');
    p.commit({ ...f, plan });
    playPolicy(p, pol);
    return { p, j: judgeForecast({ forecast: p.forecast, outcome: p.scores().outcome, stated: p.plan, played: playedPlan(p) }) };
  };
  const pace = { week: 11, low: 10, high: 12, onTimeChance: 75 };
  // The reveal states two facts: did the range hold (and if not, by how much), and was the stated plan played.
  const a = judge(pace, HANDS_OFF, { hire: 3, inspect: 0.1 });
  t('pace, stated hands-off, plays +3/10%: week 12, range held, plan changed', a.p.scores().outcome === 12 && a.j.held && a.j.missBy === 0 && a.j.kept === false && !a.j.coaster);
  const b = judge({ week: 13, low: 11, high: 14, onTimeChance: 45 }, C3I, { hire: 3, inspect: 0.1 });
  t('the record for +3/10%, stated and played: range held, plan kept', b.j.held && b.j.kept === true);
  const c = judge({ week: 15, low: 11, high: 23, onTimeChance: 20 }, HANDS_OFF, {});
  t('all 40 (15, 11-23), hands-off stated and played: week 17, range held, plan kept, coaster line', c.p.scores().outcome === 17 && c.j.held && c.j.kept === true
    && c.j.coaster && c.j.coaster.n === 4 && c.j.coaster.late === 4 && c.j.coaster.median === 17);
  const ho = pastContracts().contracts.filter((r) => r.crewsAdded === 0 && r.inspect === 0 && r.shiftWeeks === 0);
  t('the coaster line counts only contracts the record shows as hands-off', c.j.coaster.n === ho.length && c.j.coaster.median === summarizeContracts(ho).median);
  const d = judge(pace, HANDS_OFF, {});
  t('pace, hands-off stated and played: range missed 5 weeks late, plan kept, coaster line', !d.j.held && d.j.missBy === 5 && d.j.kept === true && d.j.coaster?.n === 4);
  const e = judge({ week: 20, low: 18, high: 22, onTimeChance: 0 }, C3I, { hire: 3, inspect: 0.1 });
  t('a range that misses early says so: 6 weeks early', !e.j.held && e.j.missBy === -6);
  t('there is no judgement of method: no verdict, no closeness-to-record test', !('verdict' in a.j) && !('onRecord' in a.j) && !('why' in a.j));
  t('the facts never change a score', (() => { const q = new Project('ledger'); q.commit({ ...pace }); playPolicy(q, { hire: 3, inspect: 0.1 }); return q.scores().forecast === a.p.scores().forecast; })());
  t('with no stated plan, the plan fact is empty', judgeForecast({ forecast: pace, outcome: 12, stated: null, played: C3I }).kept === null);
}

console.log('The Decision Desk sees only the screen');
{
  const src = readFileSync(new URL('../frontend/src/plan/desk.js', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  t('desk.js never builds a Project or reads a scenario code', !/\bProject\b(?! Controls)|seedFromString|playPolicy|shockWeek|shockSize|productivity|defectProne|_noise|hidden/.test(code));
  const imports = [...code.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/engine\.js'/g)].flatMap((m) => m[1].split(',').map((x) => x.trim()));
  t('desk.js takes from the engine only the record, the last contract and the stated rules', imports.every((x) => ['CONFIG', 'lastContract', 'pastContracts', 'matchContracts', 'summarizeContracts', 'normalizePlan', 'failuresLine'].includes(x)));
  const S = screenData();
  t('the screen holds only what the briefing shows', JSON.stringify(Object.keys(S)) === JSON.stringify(['history', 'last', 'contracts', 'rules'])
    && !('baseDefectRate' in S.rules) && !('shockWeeks' in S.rules) && !('productivityRange' in S.rules) && !('defectProneRange' in S.rules));
  const plans = [...COMMON_PLANS, { crews: 1, inspect: 0.3, shift: 'every' }];
  const before = JSON.stringify(plans.map((p) => allForecasts(S, p)));
  for (const seed of ['ledger', 'compass', 'desk-x']) playPolicy(new Project(seed), { hire: 3, inspect: 0.1 });
  t('playing any scenario leaves every tool unchanged', JSON.stringify(plans.map((p) => allForecasts(screenData(), p))) === before);
  t('every tool gives low <= week <= high and a chance in 0-100', plans.every((p) => allForecasts(S, p).every((f) => f.low <= f.week && f.week <= f.high && f.chance >= 0 && f.chance <= 100)));
  t('every Team Chat colleague names the desk frame they reason from', teamChat(S, COMMON_PLANS[0]).every((c) => c.frame && c.reasoning && c.forecast));
  t('Team Chat runs Dana, Sam, Kim, Mabel, Priya (the record\'s voice fourth), and Mabel quotes the real record', (() => { const c = teamChat(S, COMMON_PLANS[0]); const all = records(S).all; return c.map((x) => x.name).join() === 'Dana,Sam,Kim,Mabel,Priya' && c[3].says.includes('fourteen weeks') && c[3].says.includes('one in six') && all.week === 14 && all.chance === 18; })());
  t('Priya quotes the last contract\'s real rework', teamChat(S, COMMON_PLANS[0])[4].says.includes(`${screenData().last.rejected} units`) && teamChat(S, COMMON_PLANS[0])[4].says.includes('four more weeks'));
  t('Cost Management implies the Schedule\'s finish, and shows the credit line', JSON.stringify(costManagement(S, COMMON_PLANS[4]).forecast) === JSON.stringify(schedule(S, COMMON_PLANS[4]).forecast)
    && costManagement(S, COMMON_PLANS[4]).limit === CONFIG.budget + CONFIG.creditLine);
  t('Cost Management: +2 crews with a shift every week runs out of money in week 13', costManagement(S, { crews: 2, inspect: 0, shift: 'every' }).brokeWeek === 13);
  t('every tab has a one-line sees and can\'t-see, except the front tab', TABS.slice(1).every((x) => x.sees && x.cant) && TABS.length === 9 && TABS[1].id === 'contract');
  t('tab letters are unique', new Set(TABS.map((x) => x.letter).filter(Boolean)).size === 8);
}

console.log('The desk during play sees only the dashboard');
{
  const S = screenData();
  const C3I = COMMON_PLANS[4];
  const p = new Project('ledger');
  p.commit({ week: 13, low: 11, high: 14, onTimeChance: 40, plan: C3I });
  for (let w = 0; w < 6; w++) p.play({ hire: w === 0 ? 3 : 0, inspect: 0.1 });
  const L = liveScreen(p);
  t('the live screen copies only dashboard fields', JSON.stringify(Object.keys(L)) === JSON.stringify(LIVE_FIELDS)
    && L.rows.every((r) => JSON.stringify(Object.keys(r)) === JSON.stringify(LIVE_ROW_FIELDS)) && !LIVE_ROW_FIELDS.includes('true') && !LIVE_ROW_FIELDS.includes('defectRate'));
  const outputs = () => JSON.stringify([allForecasts(S, C3I, liveScreen(p)), teamChat(S, C3I, liveScreen(p)).map((c) => c.says), costManagement(S, C3I, liveScreen(p)).cost]);
  const before = outputs();
  const saved = [p.hidden, p.productivity, p.defectProne, p.shockWeek, p.shockSize, [...p._noise]];
  p.hidden = 999; p.productivity = 0.5; p.defectProne = 3; p.shockWeek = 7; p.shockSize = 99; p._noise.fill(2);
  t('changing every hidden draw leaves every weekly tool unchanged', outputs() === before);
  [p.hidden, p.productivity, p.defectProne, p.shockWeek, p.shockSize] = saved; saved[5].forEach((v, i) => { p._noise[i] = v; });
  t('weekly tools are pure functions of the live screen', JSON.stringify(allForecasts(S, C3I, JSON.parse(JSON.stringify(L)))) === JSON.stringify(allForecasts(S, C3I, L)));
  t('the Schedule re-plans from the current week', schedule(S, C3I, L).from === 6 && schedule(S, C3I, L).forecast.week > 6);
  t('the Status Report reports this contract to date during play', statusReport(S, L).live && statusReport(S, L).weeksShown === 6);
  t('Cost Management uses actual spend', costManagement(S, C3I, L).spent === p.spent);
  t('Team Chat speaks to the latest week', teamChat(S, C3I, L)[0].says.startsWith(`We built ${Math.round(L.rows[5].built)} last week`));
  const q = new Project('ledger');
  q.commit({ week: 13, low: 11, high: 14, onTimeChance: 40, plan: C3I });
  for (let w = 0; w < 6; w++) { q.noteDesk(w + 1, 'status'); q.play({ hire: w === 0 ? 3 : 0, inspect: 0.1, forecast: 9 + w, range: { low: 8, high: 15, chance: 10 * w } }); }
  t('weekly forecasts and desk use are recorded and never change an outcome', JSON.stringify(q.history) === JSON.stringify(p.history) && q.deskLog.length === 6 && q.forecastLog.length === 7 && q.forecastLog[6].chance === 50);
}

console.log('Desk numbers on ledger (work order, Oct 17)');
{
  const S = screenData();
  const f = (x) => `${x.week} (${x.low}-${x.high}) ${x.chance}`;
  const HO = COMMON_PLANS[0], C3I = COMMON_PLANS[4];
  t('Status Report (EVM, 12 weeks / SPI): 10 (10-11) 90', f(statusReport(S).forecast) === '10 (10-11) 90' && statusReport(S).eacWeeks === 10.5);
  t('the plan on paper (Sam): hands-off 11 (10-12), +3/10% 9 (8-10)', f(schedule(S, HO).forecast).startsWith('11 (10-12)') && f(schedule(S, C3I).forecast).startsWith('9 (8-10)'));
  t('Last 5 Contracts are records #36-40, the newest is the last contract: 16 (12-17) 20, none failed', (() => { const l = lastFive(S); return l.rows.map((r) => r.id).join() === '36,37,38,39,40' && l.newest.deliveredWeek === 17 && l.newest.dashboardFullWeek === 13 && l.newest.rejected === 20 && f(l.forecast) === '16 (12-17) 20' && l.summary.failed.total === 0; })());
  // On the seeded-manager record (Oct 17 lists had 17 (15-20) 0 / 13 (11-14) 43 and 17 (15-19) 0 / 13 (11-14) 45).
  t('Records like my plan: hands-off 17 (14-18) 0, +3/10% 13 (12-15) 29', f(records(S, HO).matched) === '17 (14-18) 0' && f(records(S, C3I).matched) === '13 (12-15) 29');
  // Fitted on delivered contracts only, so it shares their survivorship: the +3/10% runs that went bankrupt are not in it.
  // Its chance also counts the contracts run like the plan that never delivered (1 of 7 for +3/10%: 68% x 6/7).
  // Every range from the record carries its failures beside it.
  t('failures beside the ranges: all 40 carries them; ranges with none carry none', records(S).all.fail === '2 of 40 never delivered (2 bankrupt)'
    && records(S, C3I).matched.fail === null && lastFive(S).forecast.fail === null && teamChat(S, HO).find((c) => c.key === 'veteran').reasoning.includes('2 of 40 never delivered'));
  t('the desk is nine tabs: the front tab, The Contract, Status Report, Project Controls, What-if Planner, Team Chat, Ask an AI, Last 5 Contracts, Records',
    TABS.map((t) => t.id).join() === 'commit,contract,status,controls,whatif,chat,ai,last5,records' && Object.keys(FORECASTERS).join() === 'status,last5,records-all,records-plan');
  const st = statusReport(S, null, C3I);
  t('the Status Report carries the money: planned cost, budget, credit line, cost efficiency', st.money.plannedCost === costManagement(S, C3I).cost.bac && st.money.budget === CONFIG.budget && st.money.creditLine === CONFIG.creditLine && typeof st.cpi === 'number');
}

console.log('Desk usage, recorded on the project');
{
  const p = new Project('desk-code');
  p.commit({ week: 13, low: 11, high: 14, onTimeChance: 45, plan: { crews: 3, inspect: 0.1, shift: 'none' }, desk: { tool: 'j', tabs: 7, minutes: 6.4, edited: true, order: ['status', 'analytics'] } });
  playPolicy(p, { hire: 3, inspect: 0.1 });
  t('the desk use is recorded: tool, tabs, whole minutes, edited, tab order', p.desk.tool === 'j' && p.desk.tabs === 7 && p.desk.minutes === 6 && p.desk.edited && p.desk.order.join() === 'status,analytics');
  const same = new Project('desk-code'); same.commit({ week: 13, low: 11, high: 14, onTimeChance: 45 }); playPolicy(same, { hire: 3, inspect: 0.1 });
  t('what the desk recorded never changes an outcome', JSON.stringify(same.history) === JSON.stringify(p.history));
}

console.log('Bankruptcy past the credit line');
{
  const p = new Project('ledger');
  p.commit({ week: 12, low: 11, high: 13, onTimeChance: 50 });
  playPolicy(p, { hire: 2, shiftFrom: 1 });
  const s = p.scores();
  t('+2 crews with a shift every week goes bankrupt on ledger, and scores 0 on delivery', p.result === 'BANKRUPT' && s.delivery === 0 && p.history.at(-1).events[0].includes('bankrupt'));
  t('the forecast is scored on the projected week, as for termination', s.outcome === p.outcomeWeek() && s.outcome > p.week);
  let neverPast = true, onlyWhenPast = true;
  for (let i = 0; i < 300; i++) {
    const q = new Project(`bk-${i}`);
    playPolicy(q, { hire: i % 4, inspect: [0, 0.1, 0.2, 0.3][i % 4], shiftFrom: i % 3 ? 99 : 1 });
    if (q.history.some((h) => h.budget < -CONFIG.creditLine)) neverPast = false;
    if (q.result === 'BANKRUPT' && q.budget - q.weekCost({ shift: q.week >= (i % 3 ? 99 : 1) }) >= -CONFIG.creditLine) onlyWhenPast = false;
  }
  t('the budget never goes below the credit line', neverPast);
  t('bankruptcy comes only when the next payroll would pass the credit line', onlyWhenPast);
  const best = playPolicy(new Project('ledger'), { hire: 3, inspect: 0.1 });
  t('+3 crews with 10% inspection on ledger: accepted week 12, $4.50M, on budget', best.result === 'DELIVERED' && best.spent === 4_500_000 && best.outcomeWeek() === 12);
  t('the credit line is a stated rule the desk can see', screenData().rules.creditLine === CONFIG.creditLine);
}

console.log('Review fixes (Oct 17)');
{
  // A forecast never moved from 12 is carried forward by the play screen as the calendar passes it; that must not count.
  const p = new Project('ledger');
  p.commit({ week: 12, low: 11, high: 13, onTimeChance: 50, plan: { crews: 0, inspect: 0, shift: 'none' } });
  while (!p.done) { const w = p.week + 1; p.play({ forecast: Math.max(12, w), range: { low: 11, high: 13, chance: 50, carried: 12 < w } }); }
  t('an untouched forecast carried forward by the calendar never counts as coming close', p.outcomeWeek() === 17 && firstCloseWeek(p.forecastLog, p.outcomeWeek()) === null);
  t('a forecast the student set does count', firstCloseWeek([{ week: 0, forecast: 12 }, { week: 5, forecast: 16 }], 17) === 5 && firstCloseWeek([{ week: 0, forecast: 17 }], 17) === 0);
  // Event wording: no "Inspection found" without inspection; singular and plural.
  const q = new Project('ledger');
  while (!q.done) q.play({});
  const events = q.history.flatMap((h) => h.events);
  t('with no inspection, defects "turn up in the work" rather than being found by inspection', !events.some((e) => e.startsWith('Inspection found')) && events.some((e) => /turned up in the work/.test(e)));
  t('no "1 units" or "1 bad units" anywhere', !events.some((e) => /\b1 units\b|\b1 bad units\b|\b1 defective units\b/.test(e)));
  const r = new Project('ledger');
  for (let w = 0; w < 4; w++) r.play({ inspect: 0.2 });
  t('with inspection, the log says inspection found them', r.history.some((h) => h.events.some((e) => e.startsWith('Inspection found'))));
  // Cost efficiency against the plan's own cost baseline, not the budget.
  const S = screenData(), C3I = COMMON_PLANS[4];
  t('Status Report CPI is near 1 before week 1 (1.15), measured against the line\'s own cost baseline', statusReport(S).cpi === 1.15);
  t('Cost Management before week 1: baseline = EAC, CPI 1.00, headroom to the budget shown separately', (() => { const c = costManagement(S, C3I); return c.cost.cpi === 1 && c.cost.bac === c.cost.eac && c.headroom === CONFIG.budget - c.cost.eac && c.headroomCredit === CONFIG.budget + CONFIG.creditLine - c.cost.eac; })());
  const live = new Project('ledger');
  live.commit({ week: 13, low: 11, high: 14, onTimeChance: 40, plan: C3I });
  for (let w = 0; w < 6; w++) live.play({ hire: w === 0 ? 3 : 0, inspect: 0.1 });
  const cl = costManagement(S, C3I, liveScreen(live)).cost, sl = statusReport(S, liveScreen(live), C3I);
  t(`during play CPI sits near 1 (cost ${cl.cpi}, status ${sl.cpi})`, cl.cpi > 0.6 && cl.cpi < 1.4 && sl.cpi > 0.6 && sl.cpi < 1.4);
  t('every tool keeps its sees / cant-see line, now shown on the reveal', TABS.slice(1).every((x) => x.sees && x.cant));
  t('group headers are neutral', JSON.stringify([...new Set(TABS.slice(1).map((x) => x.group))]) === JSON.stringify(['The Brief', 'Dashboards', 'People', 'History']));
}



console.log('How you played');
{
  const plan = { crews: 3, inspect: 0.1, shift: 'none' };
  const f0 = { week: 13, low: 11, high: 14, onTimeChance: 40, plan };
  // A: commits, then plays the defaults every week, touching nothing (week 1 starts from the stated plan).
  const a = new Project('ledger'); a.commit(f0);
  while (!a.done) { const w = a.week + 1; a.play({ hire: w === 1 ? 3 : 0, inspect: 0.1, forecast: Math.max(13, w), range: { low: 11, high: 14, chance: 40, carried: 13 < w, touched: false } }); }
  const sa = playSummary(a);
  t('untouched play: autopilot after week 0, nothing checked, no forecast or decision changes', sa.autopilotAfter === 0 && !sa.engagedToEnd && sa.checkedWeeks === 0 && sa.forecastChanges === 0 && sa.decisionWeeks === 0);
  // B: plays the stated plan (+3 crews in week 1), checks two tools before week 3, moves the forecast in week 5, then coasts.
  const b = new Project('ledger'); b.commit(f0);
  while (!b.done) {
    const w = b.week + 1;
    if (w === 3) { b.noteDesk(3, 'records'); b.noteDesk(3, 'status'); }
    if (w === 4) b.noteDesk(4, 'records');
    b.noteTime(w, 20 + w);
    b.play({ hire: w === 1 ? 3 : 0, inspect: 0.1, forecast: w >= 5 ? 14 : 13, range: { low: 11, high: w >= 5 ? 15 : 14, chance: 40, touched: w === 5 } });
  }
  const sb = playSummary(b);
  t('scenario B: autopilot after week 5; forecast changed once, first in week 5 (+1 week); the stated plan in week 1 is not a change',
    sb.autopilotAfter === 5 && sb.forecastChanges === 1 && sb.firstForecastChange === 5 && sb.weeks[4].forecast.week === 1 && sb.decisionWeeks === 0 && sb.weeks[0].decisions.crews === 0 && !sb.weeks[0].decisions.inspect);
  t('scenario B: checked tools in 2 weeks; most checked Records (2), then Status Report (1); per-week seconds recorded',
    sb.checkedWeeks === 2 && sb.topTools[0].tab === 'records' && sb.topTools[0].n === 2 && sb.topTools[1].tab === 'status' && sb.weeks[2].tabs.join() === 'records,status' && sb.weeks[0].seconds === 21);
  // C: changes inspection in the last week played: engaged to the end.
  const c = new Project('ledger'); c.commit(f0);
  const last = (() => { const q = new Project('ledger'); q.commit(f0); playPolicy(q, { hire: 3, inspect: 0.1 }); return q.week; })();
  while (!c.done) { const w = c.week + 1; c.play({ hire: w === 1 ? 3 : 0, inspect: w === last ? 0 : 0.1 }); }
  const sc = playSummary(c);
  t('scenario C: a change in the last week means engaged to the end', sc.engagedToEnd && sc.autopilotAfter === sc.played);
  const d = new Project('ledger'); d.commit({ week: 9, low: 8, high: 10, onTimeChance: 99, plan: { crews: 0, inspect: 0, shift: 'none' } });
  while (!d.done) { const w = d.week + 1; d.play({ hire: w === 1 ? 3 : 0, inspect: 0.1 }); }
  t('tracking (tabs, times, forecast touches) never changes an outcome', JSON.stringify(b.history) === JSON.stringify(d.history) && b.outcomeWeek() === d.outcomeWeek());
}

console.log('Tabs: no limit; which were opened each week is tracked, never acted on');
{
  const play = (notes, desk = null) => { const p = new Project('ledger'); p.commit({ week: 13, low: 11, high: 14, onTimeChance: 40, desk }); notes(p); for (let w = 0; w < 3; w++) p.play({}); return p; };
  const none = play(() => {});
  const many = play((p) => { ['status', 'records', 'schedule', 'chat', 'contract', 'ai'].forEach((t) => p.noteDesk(2, t)); }, { tool: '', tabs: 6, minutes: 3, edited: true, order: ['status', 'records', 'last5', 'chat', 'cost', 'schedule'] });
  t('views never cost output or change an outcome', JSON.stringify(many.history.map((h) => h.built)) === JSON.stringify(none.history.map((h) => h.built)));
  t('a week counts distinct tool tabs; The Contract and Ask an AI do not count', many.checksFor(2) === 4 && play((p) => ['status', 'status', 'contract', 'ai'].forEach((t) => p.noteDesk(2, t))).checksFor(2) === 1);
  t('there is no view limit in the rules', !('viewsPerWeek' in CONFIG) && !('viewsBeforeWeek1' in CONFIG) && !('unlimitedRound1' in CONFIG));
  t('the front tab is never a tool check', !isCheck('commit') && !isCheck('decide'));
}

console.log('The Forecast score: one score, and wide ranges cost points');
{
  const at = (low, high, week, outcome) => forecastScore({ week, low, high, onTimeChance: 20 }, outcome, outcome <= CONFIG.deadline);
  // Typical ledger outcomes for the plans students play run from week 13 to 15.
  t('on typical outcomes (weeks 13-15) a 12-17 range clearly beats 6-24', [13, 14, 15].every((o) => at(12, 17, 14, o) >= at(6, 24, 15, o) + 25));
  t('10-11 scores poorly when the outcome is 15', at(10, 11, 10, 15) <= 10 && at(10, 11, 11, 15) <= 10);
  t('the examples: outcome 15 gives 12-17 75, 6-24 44, 10-11 0', at(12, 17, 14, 15) === 75 && at(6, 24, 15, 15) === 44 && at(10, 11, 11, 15) === 0);
  t('there is no Updating score', !('updating' in new Project('ledger').scores()));
  // Bankruptcy is reported on its own; the range is graded against the projected week.
  const b = new Project('render-broke'); b.commit({ week: 14, low: 12, high: 16, onTimeChance: 0 }); while (!b.done) b.play({ hire: 3, shift: true });
  t('a bankrupt contract missed its range: Forecast score 0, reported as failed', b.result === 'BANKRUPT' && b.scores().failed === 'bankrupt' && b.scores().held === false && b.scores().forecast === 0);
  const pt = forecastParts({ week: 14, low: 12, high: 17, onTimeChance: 20 }, 15, false);
  t('the Forecast score shows its three parts: point 8, range 15, chance 2 = 75', pt.point === 8 && pt.range === 15 && pt.chance === 2 && pt.score === 75);
}

console.log('Your game in 8 facts');
{
  // Fixed scenarios on ledger, with fixed luck: a pace-anchored student and a Mabel follower.
  const game = ({ commit, desk, pol, luck = 7, forecastAt = null }) => {
    const p = new Project('ledger', CONFIG, luck);
    p.commit({ ...commit, plan: { crews: 3, inspect: 0.1, shift: 'none' }, desk });
    while (!p.done) {
      const w = p.week + 1, fc = forecastAt ? forecastAt(w, p) : null;
      p.play({ ...pol(w), forecast: fc ? fc.week : Math.max(w, commit.week), range: fc ? { low: fc.low, high: fc.high, chance: fc.chance, touched: fc.touched } : { low: Math.max(w, commit.low), high: Math.max(w, commit.high), chance: commit.onTimeChance, carried: commit.week < w } });
    }
    return p;
  };
  const plan = (w) => ({ hire: w === 1 ? 3 : 0, inspect: 0.1 });
  const a = game({ commit: { week: 10, low: 10, high: 11, onTimeChance: 90 }, desk: { tool: 'a', source: 'Status Report', tabs: 1, minutes: 2, order: ['status'] }, pol: plan });
  const fa = gameFacts(a), byKey = (fs, k) => fs.find((x) => x.key === k);
  t('fact 1: week 10 is close to the line\'s pace (10.5) and not the median', byKey(fa, 'start').value.near.join() === 'close to the line\'s pace' && byKey(fa, 'start').text === 'You committed week 10: close to the line\'s pace.');
  t('fact 2: opened Status Report only, so Records no and Last 5 no; no checks in play; no AI', byKey(fa, 'record').text === 'Before week 1 you checked information sources 1 time (Records: no; Last 5 Contracts: no). During play you checked nothing; You did not use AI.');
  const ninety = a.history.find((r) => dashboardPeak(r) >= 0.9), rej = a.history.reduce((s, r) => s + r.rejected, 0);
  t('fact 3: the 90% week from the peak reading, the units rejected, and a move after the rejection', byKey(fa, 'ninety').value.week === ninety.week && byKey(fa, 'ninety').value.rejected === rej && rej > 0
    && byKey(fa, 'ninety').text === `Your dashboard passed 90% in week ${ninety.week} (it read ${Math.round(dashboardPeak(ninety) * 100)}%); the customer then rejected ${rej} units. You changed your forecast within 2 weeks of the rejection: no.`);
  t('the peak reading: a week whose acceptance test rejected units read 100%', dashboardPeak({ rejected: 3, reported: 0.92 }) === 1 && dashboardPeak({ rejected: 0, reported: 0.92 }) === 0.92);
  t('fact 4: the scope change against the record\'s spread; a forecast never moved is "no"', byKey(fa, 'surprise').text === 'The customer added 15 units in week 4 (past contracts: +10 to +52). You changed your forecast within 2 weeks: no.');
  t('fact 5: the committed Status Report numbers', byKey(fa, 'advice').text === 'You committed the Status Report numbers.');
  t('fact 6: the range against the outcome', byKey(fa, 'range').value.held === a.scores().held && byKey(fa, 'range').value.missBy === a.scores().missBy);
  t('fact 7: not bankrupt; over budget only if spent more than $5.00M', byKey(fa, 'money').value.bankruptWeek === null && byKey(fa, 'money').value.over === Math.max(0, a.spent - CONFIG.budget));
  const b = game({ commit: { week: 13, low: 12, high: 15, onTimeChance: 30 }, desk: { tool: 'f', source: "Mabel's", tabs: 2, minutes: 3, order: ['records', 'chat'] }, pol: plan,
    forecastAt: (w) => (w >= 6 ? { week: 14, low: 13, high: 15, chance: 20, touched: true } : null) });
  const fb = gameFacts(b);
  t('fact 1 for week 13: close to the past contracts\' median (14)', byKey(fb, 'start').value.near.join() === 'close to the past contracts\' median');
  t('facts 2, 4, 5 for a Mabel follower who moved the forecast in week 6', byKey(fb, 'record').value.records && !byKey(fb, 'record').value.last5
    && byKey(fb, 'surprise').value.changedWithin === true && byKey(fb, 'advice').text === "You committed Mabel's numbers.");
  t('fact 4 asks within 2 weeks: a move in week 6, after a week-4 change, counts', byKey(gameFacts(game({ commit: { week: 13, low: 12, high: 15, onTimeChance: 30 }, desk: { tool: 'f', source: "Mabel's", tabs: 1, minutes: 3, order: ['chat'] }, pol: plan,
    forecastAt: (w) => (w >= 6 ? { week: 14, low: 13, high: 15, chance: 20, touched: w === 6 } : null) })), 'surprise').value.changedWithin === true);
  // Fact 5 counts "Use X's numbers" during play.
  const mid = new Project('ledger', CONFIG, 7);
  mid.commit({ week: 13, low: 12, high: 15, onTimeChance: 30, plan: { crews: 3, inspect: 0.1, shift: 'none' }, desk: { tool: '', tabs: 0, minutes: 1, order: [] } });
  while (!mid.done) { const w = mid.week + 1; if (w === 6) mid.noteDesk(6, 'use:chat:Priya'); if (w === 8) mid.noteDesk(8, 'use:records'); mid.play({ hire: w === 1 ? 3 : 0, inspect: 0.1 }); }
  t('fact 5 counts mid-game uses and names the hand-set forecast\'s closest tool', /closest to /.test(byKey(gameFacts(mid), 'advice').text) && byKey(gameFacts(mid), 'advice').text.endsWith("During play you used Priya's in week 6, the Records in week 8."));
  const coast = gameFacts(game({ commit: { week: 13, low: 12, high: 15, onTimeChance: 29 }, desk: { tool: 'j', source: 'Records', tabs: 2, minutes: 5, order: ['records', 'last5'] }, pol: plan }));
  t('fact 4: the calendar moving a range forward is not the student changing the forecast', byKey(coast, 'surprise').value.changedWithin === false && byKey(coast, 'advice').text === 'You committed the Records numbers.');
  const fd = gameFacts(game({ commit: { week: 12, low: 11, high: 13, onTimeChance: 50 }, desk: { tool: '', tabs: 0, minutes: 1, order: [] }, pol: plan }));
  t('fact 1 for week 12 is "at the deadline"; fact 5 is your own numbers, closest to a desk tool', byKey(fd, 'start').value.near.includes('at the deadline') && byKey(fd, 'advice').text === "You set your own numbers, closest to Kim's (week 12, 11–13).");
  // Fact 7 and 8 on a bankrupt game: +2 crews with a shift every week.
  const br = game({ commit: { week: 12, low: 11, high: 13, onTimeChance: 50 }, desk: { tool: '', tabs: 0, minutes: 1, order: [] }, pol: (w) => ({ hire: w === 1 ? 2 : 0, shift: true }) });
  const fbr = gameFacts(br);
  const bw = br.history[br.history.length - 1];
  t('fact 7: bankrupt, with the week and the overrun that triggered it', br.result === 'BANKRUPT' && bw.bankrupt && byKey(fbr, 'money').value.shortfall === bw.shortfall && bw.shortfall > 0
    && byKey(fbr, 'money').text === `Bankrupt: yes, in week ${bw.week}. Its payroll ($${Math.round(bw.payroll / 1000)}k) would have gone $${Math.round(bw.shortfall / 1000)}k past the $500k credit line.`);
  t('fact 6 and the score: a bankrupt contract missed its range and scores 0', byKey(fbr, 'range').text === 'Your 80% range (weeks 11–13): missed. The contract was never delivered.' && br.scores().forecast === 0 && br.scores().held === false && br.scores().parts === null);
  const L = byKey(fa, 'luck').value, R = luckReplay(a);
  t('fact 8: deterministic; typical week, luckier-than, range held, made and bankrupt counts', JSON.stringify(luckReplay(a)) === JSON.stringify(R) && byKey(fbr, 'luck').value.bankrupt >= 90 && L.draws === 100
    && L.luckier === R.weeks.filter((w) => w > a.outcomeWeek()).length && L.held === R.held
    && byKey(fa, 'luck').text === `With exactly your decisions, other luck gave week ${Math.ceil(L.median)} typically (${Math.ceil(L.p10)}–${Math.ceil(L.p90)}); you were luckier than ${L.luckier} of 100. With your decisions and other luck, your 80% range held in ${L.held} of 100; week 12 was made in ${L.onTime}, and the company went bankrupt in ${L.bankrupt}.`);
  // The replay's hold count: a replay that was never delivered is a miss, whatever its projected week.
  const wide = new Project('ledger', CONFIG, 7);
  wide.commit({ week: 14, low: 6, high: 22, onTimeChance: 50 });
  while (!wide.done) wide.play({ hire: wide.week === 0 ? 2 : 0, shift: true });
  const RW = luckReplay(wide);
  t('the replay hold count treats a failed contract as a miss (a shift every week: bankrupt in most, held in few)', RW.bankrupt >= 90 && RW.held <= RW.draws - RW.bankrupt && RW.weeks.filter((w) => w >= 6 && w <= 22).length > RW.held);
  t('fact 8 replays the student\'s own decisions: replaying with the student\'s own luck reproduces the outcome', (() => {
    const q = new Project('ledger', CONFIG, 7); let w = 0; while (!q.done) { q.play(a.decisions[w] || { hire: 0, inspect: 0.1 }); w++; } return q.outcomeWeek() === a.outcomeWeek() && q.spent === a.spent; })());
  t('the facts never change an outcome', (() => { const before = JSON.stringify(a.history); gameFacts(a); return JSON.stringify(a.history) === before; })());
  const t0 = Date.now(); for (let i = 0; i < 10; i++) luckReplay(a);
  t(`the luck replay is fast (${((Date.now() - t0) / 10).toFixed(1)} ms for 100 games here)`, (Date.now() - t0) / 10 < 50);
}

console.log('Fix 13: gut then final, the tour, checkpoints');
{
  // The comparison card: fixed order, every row from what the tabs show, none marked best.
  const S = screenData(), plan = { crews: 3, inspect: 0.1, shift: 'none' }, gut = { week: 11, low: 10, high: 12, onTimeChance: 70 };
  const rows = comparisonRows(S, plan, gut);
  t('the comparison card: gut first, then Status Report, the five colleagues, Last 5 and Records, in order', rows.map((r) => r.key).join() === 'gut,status,chat-supervisor,chat-planner,chat-sales,chat-veteran,chat-quality,last5,records'
    && rows[1].f.week === statusReport(S, null, plan).forecast.week && rows[8].f.week === records(S, plan).matched.week && rows.every((r) => !('best' in r)));
  // Gut vs final: the gut forecast is recorded, never scored; fact 1 shows the path.
  const p = new Project('ledger', CONFIG, 7);
  p.commit({ week: 14, low: 12, high: 16, onTimeChance: 20, plan: { crews: 3, inspect: 0.1, shift: 'none' }, gut: { week: 11, low: 10, high: 12, onTimeChance: 70 },
    desk: { tool: 'j', source: 'Records', tabs: 4, minutes: 6, order: ['status', 'chat', 'last5', 'records'] } });
  const q = new Project('ledger', CONFIG, 7);
  q.commit({ week: 14, low: 12, high: 16, onTimeChance: 20, plan: { crews: 3, inspect: 0.1, shift: 'none' } });
  const playOut = (x, taps) => { while (!x.done) { const w = x.week + 1; if (taps) taps(x, w); x.play({ hire: w === 1 ? 3 : 0, inspect: 0.1 }); } return x; };
  // Checkpoint taps: logged with week and event, never acted on.
  playOut(p, (x, w) => { const last = x.history[x.history.length - 1]; if (last && last.shock > 0) x.noteCheckpoint(w, 'scope', 'keep'); if (last && last.rejected > 0) x.noteCheckpoint(w, 'reject', 'change'); });
  playOut(q);
  t('the gut forecast is recorded and never scored', p.gutForecast.week === 11 && p.scores().forecast === q.scores().forecast && JSON.stringify(p.history) === JSON.stringify(q.history));
  const f1 = gameFacts(p).find((x) => x.key === 'start');
  t('fact 1 shows gut then final', f1.text.startsWith('Gut: week 11. Final: week 14 (after the tour)') && f1.value.gut === 11);
  t('checkpoint taps are logged with week, event and choice', p.checkpoints.some((k) => k.event === 'scope' && k.choice === 'keep' && k.week === 5) && p.checkpoints.some((k) => k.event === 'reject' && k.choice === 'change'));
  const fs = gameFacts(p);
  t('facts 3 and 4 report the taps', fs.find((x) => x.key === 'surprise').text.endsWith('You saw it, and you kept your forecast.') && fs.find((x) => x.key === 'ninety').text.includes('At the rejection: You saw it, and you changed your forecast.'));
  t('the checkpoint log never changes an outcome', JSON.stringify(p.history) === JSON.stringify(q.history));
}

console.log('Management information: controls, what-if');
{
  const S = screenData(), plan = { crews: 3, inspect: 0.1, shift: 'none' };
  const pc0 = projectControls(S, plan);
  t('Project Controls before week 1: the last contract burn-down, no defect weeks', pc0.actual.length === 7 && pc0.actual[0].left === 200 && pc0.defects.length === 0 && pc0.centre === null);
  const q = new Project('ledger');
  for (let w = 1; w <= 8; w++) q.play({ hire: w === 1 ? 3 : 0, inspect: 0.1 });
  const L = liveScreen(q), pc = projectControls(S, plan, L);
  t('Project Controls during play: units left from the dashboard, a c-chart from weeks with no acceptance test',
    pc.actual.length === 9 && pc.actual[8].left === Math.max(0, L.rows[7].backlog) && pc.defects.length === 8 && pc.centre !== null && pc.ucl > pc.centre && pc.projection.length > 1);
  const wi = whatIf(S, [plan, { ...plan, crews: 2 }, { crews: 0, inspect: 0, shift: 'none' }]);
  t('What-if before week 1: more crews finish sooner on paper and cost more up front; each row carries the record',
    wi[0].finish < wi[2].finish && wi.every((r) => r.record && r.record.n >= 5 && r.cost > 0));
  const wl = whatIf(S, [plan], L);
  t('What-if during play re-plans from now and shows no record', wl[0].finish > L.week && wl[0].record === null);
  t('Project Controls and the What-if Planner are tool checks', isCheck('controls') && isCheck('whatif'));
}

console.log('Each scenario code draws its own record');
{
  const a = pastContracts(CONFIG, 'ledger'), b = pastContracts(CONFIG, 'compass'), none = pastContracts();
  t('records differ by code, are the same for one code (any case), and no code keeps the original record',
    JSON.stringify(a.contracts.map((r) => r.accepted)) !== JSON.stringify(b.contracts.map((r) => r.accepted))
    && pastContracts(CONFIG, ' Ledger ') === a && none.median === 14 && none.p10 === 12 && none.p90 === 17);
  t('the same mix of past managers on every code', JSON.stringify(a.contracts.map((r) => r.habit)) === JSON.stringify(b.contracts.map((r) => r.habit)));
  const S = screenData(CONFIG, 'ledger');
  t('the last contract is record #40 on that code', S.last.deliveredWeek === a.contracts[39].accepted && S.last.rejected === a.contracts[39].rejected);
  t('the desk reads the code record: Records and Mabel match within it', records(S, { crews: 3, inspect: 0.1, shift: 'none' }).matched.week === matchContracts({ crews: 3, inspect: 0.1, shift: 'none' }, { code: 'ledger' }).median
    && teamChat(S, { crews: 3, inspect: 0.1, shift: 'none' }).find((c) => c.key === 'veteran').says.includes('about fourteen weeks'));
  t('the rules are the same on every code', JSON.stringify(screenData(CONFIG, 'compass').rules) === JSON.stringify(S.rules));
}

console.log('Records CSV, checks, AI use, checking out');
{
  const S = screenData(), csv = recordsCsv(S).split('\n');
  t('the records CSV has a header and all 40 contracts, with failures as outcomes', csv.length === 41 && csv[0].startsWith('id,crews_added') && csv.filter((l) => /,bankrupt,/.test(l)).length === 2);
  const plan = { crews: 3, inspect: 0.1, shift: 'none' };
  const p = new Project('ledger');
  p.commit({ week: 13, low: 12, high: 15, onTimeChance: 30, plan, desk: { tool: '', source: '', tabs: 2, checks: 5, ai: true, copied: true, csv: false, minutes: 3, order: ['records', 'ai'] } });
  let w = 0;
  while (!p.done) { w++; if (w <= 3) { p.noteDesk(w, 'status'); p.noteDesk(w, 'controls'); } if (w === 2) p.noteDesk(w, 'records-csv'); p.play({ hire: w === 1 ? 3 : 0, inspect: 0.1 }); }
  const k = checkingSummary(p);
  t('checks are counted before week 1 and during play; the AI steps; checking out after week 3', k.before === 5 && k.during === 6 && k.weeksChecked === 3 && k.stoppedAfter === 3 && k.aiOpened && k.aiCopied && k.csv);
  const fx = gameFacts(p).find((x) => x.key === 'record');
  t('the fact says it in words', fx.title === 'What you checked' && fx.text.includes('checked information sources 5 times') && fx.text.includes('you stopped checking after week 3')
    && fx.text.includes('AI: you opened Ask an AI, copied its prompt, downloaded the records.'));
  t('the results file lists the checks', resultsText(p, gameFacts(p)).includes('- Stopped checking: after week 3.'));
  t('the records CSV download is not a tool check; Ask an AI is not either', !isCheck('records-csv') && !isCheck('ai'));
}

console.log('Ask an AI, the plan fact, the results file, the chat');
{
  const S = screenData(), plan = { crews: 3, inspect: 0.1, shift: 'none' };
  const pr = aiPrompt(S, plan);
  t('Ask an AI: the basic numbers and the situation, one question, no method', !pr.includes('Past contracts') && !/was accepted in week|read 100% in week/.test(pr) && pr.includes('My plan: add 3 crews at the start') && pr.trim().endsWith('When will the customer accept the contract?')
    && !/reference class|base rate|outside view|inside view|forecasting/i.test(pr) && !('ai' in FORECASTERS));
  const p = new Project('ledger', CONFIG, 7);
  p.commit({ week: 13, low: 12, high: 15, onTimeChance: 30, plan, desk: { tool: 'j', source: 'Records', tabs: 3, minutes: 4, order: ['chat', 'last5', 'records'] } });
  while (!p.done) { const w = p.week + 1; p.play({ hire: w === 1 ? 3 : 0, inspect: 0.1, ...(w === 9 ? { hire: -1 } : {}) }); }
  const fs = gameFacts(p);
  t('the facts open with the plan: stated, week 1 as planned, the later changes', fs[0].key === 'plan' && fs[0].n === 1 && fs.length === 9 && fs[0].text.startsWith('You planned +3 crews at the start, 10% inspection, no second shift. Week 1 ran as planned; you changed your decisions in 1 later week'));
  const txt = resultsText(p, fs, { run: 2, date: new Date('2026-10-20T10:00:00Z') });
  t('the results file holds the run, plan, forecast, scores, facts and weeks', txt.includes('Scenario code: ledger   Run: 2   Date: 2026-10-20') && txt.includes('Plan: +3 crews at the start') && txt.includes(`Forecast score: ${p.scores().forecast}`)
    && txt.includes('1. Your plan.') && txt.includes('9. Luck.') && txt.split('\n').filter((l) => /^\d+,\d+,/.test(l)).length === p.history.length);
  const chat0 = teamChat(S, plan), q = new Project('ledger'); q.play({ hire: 3, inspect: 0.1 }); q.play({ inspect: 0.1 }); const chat2 = teamChat(S, plan, liveScreen(q));
  t('Team Chat says each approach, and every colleague updates during play', chat0.every((c) => c.approach && c.approach.startsWith('goes by'))
    && ['supervisor', 'planner', 'sales', 'veteran'].every((k) => chat0.find((c) => c.key === k).says !== chat2.find((c) => c.key === k).says));
}

console.log('Playtest fixes: arithmetic, fatigue, acceptance');
{
  // Late rejects are whole units, each taking lateFixMultiplier units of work; the message adds up.
  const runs = Array.from({ length: 60 }, (_, i) => { const p = new Project(`fix-${i}`, CONFIG, i + 1); while (!p.done) p.play({ hire: p.week === 0 ? 2 : 0 }); return p; });
  const rej = runs.flatMap((p) => p.history.filter((r) => r.rejected > 0));
  t('acceptance rejects whole units, and the message\'s work is 2 per unit, with plurals', rej.length > 20 && rej.every((r) => Number.isInteger(r.rejected)
    && r.events.some((e) => e.includes(`${r.rejected} unit${r.rejected === 1 ? '' : 's'} rejected`) && e.includes(`takes ${r.rejected * CONFIG.lateFixMultiplier} units of work`))));
  t('no message says "1 units" or "1 weeks"', runs.every((p) => p.history.every((r) => r.events.every((e) => !/\b1 units\b|\b1 weeks\b/.test(e)))));
  // Fatigue from the second straight shift week; a week off resets the count.
  const f = new Project('ledger');
  const rates = [true, true, false, true, true].map((sh) => f.play({ shift: sh }).defectRate);
  t('fatigue starts in the second straight shift week and resets after a week off', rates[0] === rates[2] && rates[1] > rates[0] && rates[3] === rates[0] && rates[4] > rates[3]);
  const d = runs.find((p) => p.result === 'DELIVERED');
  t('acceptance says "Accepted in full in week N."', d.history[d.history.length - 1].events.includes(`Accepted in full in week ${d.finishWeek}.`));
}

console.log('Personal luck: a shared contract, each student with their own week-to-week luck');
{
  const plan = (p) => { p.commit({ week: 13, low: 11, high: 14, onTimeChance: 40 }); while (!p.done) p.play({ hire: p.week === 0 ? 3 : 0, inspect: 0.1, forecast: 13 }); return p; };
  const a = new Project('ledger', CONFIG, 1), b = new Project('ledger', CONFIG, 2), z = new Project('ledger');
  const shared = (p) => JSON.stringify([p.shockWeek, p.shockSize, p.shockTail, p.productivity, p.defectProne]);
  t('the contract is shared: scope change, productivity and defect-proneness match whatever the luck', shared(a) === shared(b) && shared(a) === shared(z));
  plan(a); plan(b); plan(z);
  t('luck differs between students on one code', JSON.stringify(a.history.map((r) => r.built)) !== JSON.stringify(b.history.map((r) => r.built)));
  t('the same luck draw plays the same world', JSON.stringify(plan(new Project('ledger', CONFIG, 1)).history) === JSON.stringify(a.history));
  t('without a luck draw the shared world is unchanged (the record and the last contract use it)', JSON.stringify(plan(new Project('ledger')).history) === JSON.stringify(z.history) && pastContracts().median === 14 && lastContract().deliveredWeek === 17);
  const f = (fc) => { const p = new Project('ledger', CONFIG, 7); p.commit({ week: fc, low: fc - 2, high: fc + 2, onTimeChance: 10 }); while (!p.done) p.play({ hire: p.week === 0 ? 3 : 0, inspect: 0.1, forecast: fc + p.week }); return p; };
  t('forecasts never change outcomes under luck', JSON.stringify(f(10).history) === JSON.stringify(f(18).history));
  t('the Contract discloses it', readFileSync(new URL('../frontend/src/plan/DeskTabs.jsx', import.meta.url), 'utf8').includes('Your line also has its own week-to-week luck.'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
