// Tests for the game engine (frontend/src/plan/engine.js).
import { Project, CONFIG, COMMON_PLANS, pastContracts, lastContract, historyMean, playPolicy, matchContracts, planFromProject, summarizeContracts,
  encodePlan, decodePlan, normalizePlan, playedPlan, judgeForecast } from '../frontend/src/plan/engine.js';
import { filterContracts, filterForPlan, sortContracts } from '../frontend/src/plan/table.js';
import { pastManagers, playManager, recordWeek, contractSeed, firstCloseWeek, playSummary } from '../frontend/src/plan/engine.js';
import { FORECASTERS, screenData, allForecasts, statusReport, schedule, lastFive, records, analytics, riskSimulator, scenarios, consensus, aiPrompt, teamChat, costManagement, liveScreen, LIVE_FIELDS, LIVE_ROW_FIELDS, TABS } from '../frontend/src/plan/desk.js';
import { readFileSync } from 'node:fs';

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

console.log('The record is chronological; #40 is the last contract');
{
  const r40 = pastContracts().contracts[CONFIG.pastContracts - 1], l = lastContract();
  t('record #40 is the last contract: dashboard 100% wk 13, accepted wk 17, 19 rejected, run hands-off', r40.dashboardFullWeek === l.dashboardFullWeek && r40.accepted === l.deliveredWeek && r40.rejected === l.rejected
    && r40.crewsAdded === 0 && r40.inspect === 0 && r40.shiftWeeks === 0);
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
  t('no past manager went bankrupt or was terminated (record seed 659)', past.contracts.every((r) => r.delivered));
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
  t('weeks list matches the table', past.weeks.every((w, i) => w === recordWeek(rows[i])));
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
    // On the seeded-manager record no common plan has five exact matches; most match within one crew,
    // and inspection-only widens to any crews with inspection.
    const crewsOk = m.rule === 'inspection and shift' || m.contracts.every((r) => Math.abs(r.crewsAdded - cp.crews) <= 1);
    t(`${cp.label}: at least 5 contracts match (n ${m.n}, ${m.rule})`, m.n >= 5 && m.rule !== 'all contracts'
      && crewsOk && m.contracts.every((r) => (r.inspect > 0) === (cp.inspect > 0) && (r.shiftWeeks > 0) === cp.shift));
  }
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
  const c = judge({ week: 14, low: 12, high: 17, onTimeChance: 15 }, HANDS_OFF, {});
  t('all 40, hands-off stated and played: week 17, range held, plan kept, coaster line', c.p.scores().outcome === 17 && c.j.held && c.j.kept === true
    && c.j.coaster && c.j.coaster.n === 4 && c.j.coaster.late === 4 && c.j.coaster.median === 17);
  const ho = pastContracts().contracts.filter((r) => r.crewsAdded === 0 && r.inspect === 0 && r.shiftWeeks === 0);
  t('the coaster line counts only contracts the record shows as hands-off', c.j.coaster.n === ho.length && c.j.coaster.median === summarizeContracts(ho).median);
  const d = judge(pace, HANDS_OFF, {});
  t('pace, hands-off stated and played: range missed 5 weeks late, plan kept, coaster line', !d.j.held && d.j.missBy === 5 && d.j.kept === true && d.j.coaster?.n === 4);
  const e = judge({ week: 20, low: 18, high: 22, onTimeChance: 0 }, C3I, { hire: 3, inspect: 0.1 });
  t('a range that misses early says so: 6 weeks early', !e.j.held && e.j.missBy === -6);
  t('there is no judgement of method: no verdict, no closeness-to-record test', !('verdict' in a.j) && !('onRecord' in a.j) && !('why' in a.j));
  t('the facts never change a score', a.p.scores().forecast === 90 && judge(pace, C3I, { hire: 3, inspect: 0.1 }).p.scores().forecast === 90);
  t('with no stated plan, the plan fact is empty', judgeForecast({ forecast: pace, outcome: 12, stated: null, played: C3I }).kept === null);
}

console.log('The Decision Desk sees only the screen');
{
  const src = readFileSync(new URL('../frontend/src/plan/desk.js', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  t('desk.js never builds a Project or reads a scenario code', !/\bProject\b|seedFromString|playPolicy|shockWeek|shockSize|productivity|defectProne|_noise|hidden/.test(code));
  const imports = [...code.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/engine\.js'/g)].flatMap((m) => m[1].split(',').map((x) => x.trim()));
  t('desk.js takes from the engine only the record, the last contract and the stated rules', imports.every((x) => ['CONFIG', 'lastContract', 'pastContracts', 'matchContracts', 'summarizeContracts', 'normalizePlan', 'recordWeek'].includes(x)));
  const S = screenData();
  t('the screen holds only what the briefing shows', JSON.stringify(Object.keys(S)) === JSON.stringify(['history', 'last', 'contracts', 'rules'])
    && !('baseDefectRate' in S.rules) && !('shockWeeks' in S.rules) && !('productivityRange' in S.rules) && !('defectProneRange' in S.rules));
  const plans = [...COMMON_PLANS, { crews: 1, inspect: 0.3, shift: 'every' }];
  const before = JSON.stringify(plans.map((p) => allForecasts(S, p)));
  for (const seed of ['ledger', 'compass', 'desk-x']) playPolicy(new Project(seed), { hire: 3, inspect: 0.1 });
  t('playing any scenario leaves every tool unchanged', JSON.stringify(plans.map((p) => allForecasts(screenData(), p))) === before);
  t('every tool gives low <= week <= high and a chance in 0-100', plans.every((p) => allForecasts(S, p).every((f) => f.low <= f.week && f.week <= f.high && f.chance >= 0 && f.chance <= 100)));
  const prompt = aiPrompt(S, COMMON_PLANS[4], null, ['records', 'last5']);
  t(`Ask an AI with Records and Last 5 opened: the rules, the last six weeks, all 40 contracts and the plan (${prompt.length} chars, under 4,000)`, prompt.length < 4000
    && ['terminates', 'bankrupt', '2× to fix', 'slows the whole line', 'tired crews', '19.1'].every((x) => prompt.includes(x))
    && screenData().contracts.every((r) => prompt.includes(`
${r.id},`)) && prompt.includes('MY PLAN: add 3 crews'));
  const bare = aiPrompt(S, COMMON_PLANS[4], null, []);
  t('Ask an AI with nothing opened holds the contract and rules only', bare.includes('RULES') && !bare.includes('PAST CONTRACTS') && !bare.includes('19.1') && !bare.includes('STATUS REPORT'));
  t('Ask an AI adds each opened tab and only those', aiPrompt(S, COMMON_PLANS[4], null, ['status']).includes('STATUS REPORT') && !aiPrompt(S, COMMON_PLANS[4], null, ['status']).includes('TEAM CHAT')
    && aiPrompt(S, COMMON_PLANS[4], null, ['chat']).includes('Mabel'));
  const full = aiPrompt(S, COMMON_PLANS[4]);
  t('Ask an AI is even-handed: it asks for the forecast and reasoning, and names no theory', /forecast of the week the customer accepts the contract, an 80% range, and the chance of making week 12, with your reasoning/.test(full)
    && !/reference class|outside view|inside view|anchor|base rate|hidden|planning fallacy|bias|calibrat/i.test(full));
  t('Ask an AI has no forecast of its own, so Consensus and the sweep leave it out', !TABS.find((x) => x.id === 'ai').forecasts && !Object.keys(FORECASTERS).includes('ai'));
  t('every Team Chat colleague names the desk frame they reason from', teamChat(S, COMMON_PLANS[0]).every((c) => c.frame && c.reasoning && c.forecast));
  t('Team Chat runs Dana, Sam, Kim, Mabel, Priya (the record\'s voice fourth), and Mabel quotes the real record', (() => { const c = teamChat(S, COMMON_PLANS[0]); const all = records(S).all; return c.map((x) => x.name).join() === 'Dana,Sam,Kim,Mabel,Priya' && c[3].says.includes('fourteen weeks') && c[3].says.includes('one in seven') && all.week === 14 && all.chance === 15; })());
  t('Priya quotes the last contract\'s real rework', teamChat(S, COMMON_PLANS[0])[4].says.includes(`${screenData().last.rejected} units`) && teamChat(S, COMMON_PLANS[0])[4].says.includes('four more weeks'));
  t('Cost Management implies the Schedule\'s finish, and shows the credit line', JSON.stringify(costManagement(S, COMMON_PLANS[4]).forecast) === JSON.stringify(schedule(S, COMMON_PLANS[4]).forecast)
    && costManagement(S, COMMON_PLANS[4]).limit === CONFIG.budget + CONFIG.creditLine);
  t('Cost Management: +2 crews with a shift every week runs out of money in week 13', costManagement(S, { crews: 2, inspect: 0, shift: 'every' }).brokeWeek === 13);
  t('every tab has a one-line sees and can\'t-see, except the front tab', TABS.slice(1).every((x) => x.sees && x.cant) && TABS.length === 15 && TABS[1].id === 'contract');
  t('tab letters are unique', new Set(TABS.map((x) => x.letter).filter(Boolean)).size === 14);
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
  const outputs = () => JSON.stringify([allForecasts(S, C3I, liveScreen(p)), teamChat(S, C3I, liveScreen(p)).map((c) => c.says), aiPrompt(S, C3I, liveScreen(p)), costManagement(S, C3I, liveScreen(p)).cost]);
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
  t('the AI prompt carries the current status', aiPrompt(S, C3I, L).includes('STATUS AFTER WEEK 6'));
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
  t('Schedule: hands-off 11 (10-12), +3/10% 9 (8-10)', f(schedule(S, HO).forecast).startsWith('11 (10-12)') && f(schedule(S, C3I).forecast).startsWith('9 (8-10)'));
  t('Last 5 Contracts are records #36-40, the newest is the last contract: 16 (13-17) 0', (() => { const l = lastFive(S); return l.rows.map((r) => r.id).join() === '36,37,38,39,40' && l.newest.deliveredWeek === 17 && l.newest.dashboardFullWeek === 13 && l.newest.rejected === 19 && f(l.forecast) === '16 (13-17) 0'; })());
  // On the seeded-manager record (Oct 17 lists had 17 (15-20) 0 / 13 (11-14) 43 and 17 (15-19) 0 / 13 (11-14) 45).
  t('Records like my plan: hands-off 17 (14-18) 0, +3/10% 13 (12-15) 29', f(records(S, HO).matched) === '17 (14-18) 0' && f(records(S, C3I).matched) === '13 (12-15) 29');
  t('Analytics: hands-off 17 (15-18) 0, +3/10% 13 (11-14) 40', f(analytics(S, HO).forecast) === '17 (15-18) 0' && f(analytics(S, C3I).forecast) === '13 (11-14) 40');
  t('Risk Simulator, rework on: hands-off 17 (15-19), +3/10% 13 (11-14); off: 12 (11-12) 93 and 9 (9-10) 100', f(riskSimulator(S, HO).forecast).startsWith('17 (15-19)') && f(riskSimulator(S, C3I).forecast).startsWith('13 (11-14)')
    && f(riskSimulator(S, HO, { rework: false }).forecast) === '12 (11-12) 93' && f(riskSimulator(S, C3I, { rework: false }).forecast) === '9 (9-10) 100');
  t('Scenarios: hands-off 11/12/15/17, +3/10% 9/9/10/12', scenarios(S, HO).rows.map((r) => r.week).join('/') === '11/12/15/17' && scenarios(S, C3I).rows.map((r) => r.week).join('/') === '9/9/10/12');
  t('Consensus of five, +3/10%: 12 (11-14)', f(consensus(S, C3I, ['records-all', 'records-plan', 'analytics', 'simulator', 'schedule']).forecast).startsWith('12 (11-14)'));
}

console.log('Desk usage, recorded on the project');
{
  const p = new Project('desk-code');
  p.commit({ week: 13, low: 11, high: 14, onTimeChance: 45, plan: { crews: 3, inspect: 0.1, shift: 'none' }, desk: { tool: 'o', tabs: 7, minutes: 6.4, edited: true, order: ['status', 'analytics'] } });
  playPolicy(p, { hire: 3, inspect: 0.1 });
  t('the desk use is recorded: tool, tabs, whole minutes, edited, tab order', p.desk.tool === 'o' && p.desk.tabs === 7 && p.desk.minutes === 6 && p.desk.edited && p.desk.order.join() === 'status,analytics');
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
  t('the best plan on ledger never goes broke ($4.5M, week 12)', best.result === 'DELIVERED' && best.spent === 4_500_000 && best.outcomeWeek() === 12);
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
  t('group headers are neutral', JSON.stringify([...new Set(TABS.slice(1).map((x) => x.group))]) === JSON.stringify(['The Brief', 'Dashboards', 'People', 'History', 'Models', 'Your Record']));
}



console.log('How you played');
{
  const plan = { crews: 3, inspect: 0.1, shift: 'none' };
  const f0 = { week: 13, low: 11, high: 14, onTimeChance: 40, plan };
  // A: commits, then plays the defaults every week, touching nothing.
  const a = new Project('ledger'); a.commit(f0);
  while (!a.done) { const w = a.week + 1; a.play({ forecast: Math.max(13, w), range: { low: 11, high: 14, chance: 40, carried: 13 < w, touched: false } }); }
  const sa = playSummary(a);
  t('untouched play: autopilot after week 0, nothing checked, no forecast or decision changes', sa.autopilotAfter === 0 && !sa.engagedToEnd && sa.checkedWeeks === 0 && sa.forecastChanges === 0 && sa.decisionWeeks === 0);
  // B: hires in week 1, checks two tools before week 3, moves the forecast in week 5, then coasts.
  const b = new Project('ledger'); b.commit(f0);
  while (!b.done) {
    const w = b.week + 1;
    if (w === 3) { b.noteDesk(3, 'records'); b.noteDesk(3, 'status'); }
    if (w === 4) b.noteDesk(4, 'records');
    b.noteTime(w, 20 + w);
    b.play({ hire: w === 1 ? 3 : 0, inspect: 0.1, forecast: w >= 5 ? 14 : 13, range: { low: 11, high: w >= 5 ? 15 : 14, chance: 40, touched: w === 5 } });
  }
  const sb = playSummary(b);
  t('scenario B: autopilot after week 5; forecast changed once, first in week 5 (+1 week); decisions changed in week 1 only',
    sb.autopilotAfter === 5 && sb.forecastChanges === 1 && sb.firstForecastChange === 5 && sb.weeks[4].forecast.week === 1 && sb.decisionWeeks === 1 && sb.weeks[0].decisions.crews === 3 && sb.weeks[0].decisions.inspect);
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

console.log('Attention budget');
{
  const play = (notes, desk = null) => { const p = new Project('ledger'); p.commit({ week: 13, low: 11, high: 14, onTimeChance: 40, desk }); notes(p); for (let w = 0; w < 3; w++) p.play({}); return p; };
  const free = play((p) => { p.noteDesk(2, 'status'); p.noteDesk(2, 'records'); p.noteDesk(2, 'contract'); p.noteDesk(2, 'ai'); });
  const none = play(() => {});
  t('two tool checks a week, The Contract and Ask an AI are free', JSON.stringify(free.history.map((h) => h.built)) === JSON.stringify(none.history.map((h) => h.built)));
  const extra = play((p) => { ['status', 'records', 'schedule'].forEach((t) => p.noteDesk(2, t)); });
  const ratio = extra.history[1].built / none.history[1].built;
  t(`a third check costs a quarter of one crew's output that week (${ratio.toFixed(3)} of the week's build with 4 crews; built is stored to 0.1 unit)`, Math.abs(ratio - (4 - CONFIG.checkCost) / 4) < 0.006 && extra.history[1].events.some((e) => /extra tool check/.test(e)));
  t('rechecking a tab the same week is not a new check', play((p) => { ['status', 'status', 'records', 'records'].forEach((t) => p.noteDesk(2, t)); }).history[1].built === none.history[1].built);
  const before = play(() => {}, { tool: '', tabs: 6, minutes: 3, edited: true, order: ['status', 'records', 'last5', 'chat', 'cost', 'schedule', 'contract'] });
  t('before week 1 five checks are free; the sixth costs output in week 1', before.extraChecks(1) === 1 && before.history[0].built < none.history[0].built && before.history[1].built === none.history[1].built);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
