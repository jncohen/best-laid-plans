// Server-renders every screen of the game, across finished, terminated and fuzzed runs.
import { renderToString } from 'react-dom/server';
import { Project, playPolicy } from './src/plan/engine.js';
import Brief from './src/plan/Brief.jsx';
import Play from './src/plan/Play.jsx';
import Reveal, { Finished } from './src/plan/Reveal.jsx';
import { TABS, screenData, liveScreen } from './src/plan/desk.js';
import DeskTab from './src/plan/DeskTabs.jsx';
import TabStrip from './src/plan/DeskStrip.jsx';

let fails = 0;
const ok = (n, fn) => {
  try { const h = fn(); if (!h || h.length < 50) throw new Error('suspiciously empty output'); console.log(`  ok   ${n} (${h.length} chars)`); }
  catch (e) { fails++; console.log(`  FAIL ${n} — ${e.message}`); }
};

console.log('Render checks');
ok('Brief', () => renderToString(<Brief onCommit={() => {}} />));
ok('Tab strip: every tab is always open, with no counter or notice', () => {
  for (const front of [{ id: 'commit', short: 'Your Plan & Prediction' }, { id: 'decide', short: "This Week's Decisions" }]) {
    const h = renderToString(<TabStrip tab="status" opened={['status', 'records', 'last5', 'chat', 'cost', 'schedule']} onOpen={() => {}} front={front} />).replace(/&#x27;/g, "'");
    if (h.includes('disabled=""') || h.includes('🔒') || /views? left|used your|Round 1/.test(h)) throw new Error(`a tab locks or a limit shows (${front.id})`);
  }
  return renderToString(<TabStrip tab="status" opened={[]} onOpen={() => {}} />);
});
{
  // Every desk tab during play, recomputed from the week's dashboard.
  const p = new Project('ledger');
  p.commit({ week: 13, low: 11, high: 14, onTimeChance: 40, plan: { crews: 3, inspect: 0.1, shift: 'none' } });
  const S = screenData();
  for (const w of [1, 4, 10]) {
    while (p.week < w && !p.done) p.play({ hire: p.week === 0 ? 3 : 0, inspect: 0.1, forecast: 13, range: { low: 11, high: 14, chance: 40 } });
    for (const t of TABS.slice(1)) {
      ok(`Desk during play, week ${w}: ${t.name}`, () => {
        const h = renderToString(<DeskTab id={t.id} S={S} plan={p.plan} planReady onUse={() => {}} live={liveScreen(p)} />);
        if (t.id === 'ai' && !h.includes(`STATUS AFTER WEEK ${w}`)) throw new Error('prompt lacks the current status');
        if (t.id === 'chat' && !h.includes(`after week ${w}`)) throw new Error('chat not updated for the week');
        return h;
      });
    }
  }
}
{
  const p = new Project('render-plan');
  p.commit({ week: 10, low: 9, high: 12, onTimeChance: 70 });
  ok('Play, week 1', () => renderToString(<Play project={p} onPlay={() => {}} />));
  for (let w = 0; w < 7; w++) p.play({ hire: w === 0 ? 2 : 0, inspect: 0.1, shift: w > 4, forecast: 11 + w });
  ok('Play, mid-game with history', () => renderToString(<Play project={p} onPlay={() => {}} />));
  // However many tabs are open, This Week's Decisions and its play controls work, and nothing locks.
  ok('Play, many tabs viewed: the front tab and play controls work, nothing locks', () => {
    const h = renderToString(<Play project={p} onPlay={() => {}} initialSeen={['status', 'records', 'last5', 'chat', 'cost', 'schedule', 'analytics']} />).replace(/<!-- -->/g, '').replace(/&#x27;/g, "'");
    if (!h.includes(`Play week ${p.week + 1}`) || /<button[^>]*disabled=""[^>]*>[^<]*(This Week's Decisions|Play week)/.test(h)) throw new Error('decisions locked');
    if (h.includes('🔒') || /views? left|used your|Round 1/.test(h)) throw new Error('a limit still shows');
    return h;
  });
  // The big moments are cards: the scope change, an acceptance rejection; and the 90% marker on the chart.
  {
    const m = new Project('ledger');
    m.commit({ week: 14, low: 12, high: 16, onTimeChance: 20, plan: { crews: 0, inspect: 0, shift: 'none' } });
    const show = () => renderToString(<Play project={m} onPlay={() => {}} />).replace(/<!-- -->/g, '');
    while (m.week < 4) m.play({});
    ok('Play: the scope change is a card', () => { const h = show(); if (!/border-amber-400[^>]*>The customer added 15 units in week 4\./.test(h)) throw new Error('no scope card'); return h; });
    while (!m.done && !m.history.some((r) => r.rejected > 0)) m.play({});
    ok('Play: an acceptance rejection is a card, and the 90% marker shows', () => {
      const h = show(), r = m.history[m.history.length - 1];
      if (!new RegExp(`border-rose-400[^>]*>Customer acceptance test, week ${r.week}: ${r.rejected} units rejected\. Fixing them now takes ${r.rejected * 2} units of work\.`).test(h)) throw new Error('no rejection card');
      if (!/Dashboard: 100% done in week \d+\. The customer ran the acceptance test\./.test(h)) throw new Error('no 100% banner');
      if (h.indexOf('Customer acceptance test, week') > h.indexOf('Your prediction')) throw new Error('cards are not at the top');
      if (!/Money lasts to week \d+ at this spend/.test(h)) throw new Error('no money runway line');
      if (!h.includes('Dashboard: 90% done')) throw new Error('no 90% marker');
      return h;
    });
  }
  ok('Play, on a tool tab: the way back is open', () => {
    const h = renderToString(<Play project={p} onPlay={() => {}} initialSeen={['status', 'records', 'last5']} initialTab="records" />).replace(/&#x27;/g, "'");
    if (!h.includes("Back to This Week's Decisions") || /<button[^>]*disabled=""[^>]*>[^<]*This Week/.test(h)) throw new Error('no way back');
    return h;
  });
  playPolicy(p, { inspect: 0.1 });
  ok('Reveal, delivered', () => renderToString(<Reveal project={p} onReplay={() => {}} />));
}
{
  const t = new Project('render-term');
  t.commit({ week: 12, low: 11, high: 13, onTimeChance: 50 });
  while (!t.done) t.play({ hire: -3, inspect: 0.3 });
  ok('Reveal, terminated or very late', () => renderToString(<Reveal project={t} onReplay={() => {}} />));
  // A bankrupt contract misses every range, whatever the projection.
  const b = new Project('render-broke');
  b.commit({ week: 30, low: 6, high: 40, onTimeChance: 50 });
  while (!b.done) b.play({ hire: 3, shift: true });
  ok('Reveal, bankrupt: a miss for every range', () => {
    const h = renderToString(<Reveal project={b} onReplay={() => {}} />);
    // Bankruptcy is its own line; the range is graded against the week it would have taken.
    const a = h.replace(/<!-- -->/g, '');
    if (b.result !== 'BANKRUPT' || !a.includes(`Your company went bankrupt in week ${b.week}.`) || !a.includes('a miss for every range') || !a.includes('0: the contract was never delivered') || !a.includes('missed: bankrupt') || a.includes('>held<')) throw new Error('bankruptcy not a miss');
    return h;
  });
  // The finish screen states what happened.
  ok('Finished: bankrupt, never delivered', () => {
    const h = renderToString(<Finished project={b} onReveal={() => {}} />).replace(/<!-- -->/g, '');
    if (!h.includes(`The company went bankrupt in week ${b.week}. The contract was never delivered.`)) throw new Error('finish screen wrong');
    return h;
  });
}
{
  // Four ledger cases: each reveal states whether the range held and whether the plan was kept.
  const C3I = { crews: 3, inspect: 0.1, shift: 'none' }, HO = { crews: 0, inspect: 0, shift: 'none' };
  const pace = { week: 11, low: 10, high: 12, onTimeChance: 75 };
  const cases = [
    ['pace, stated hands-off, plays +3/10%', pace, HO, { hire: 3, inspect: 0.1 }, ['): held.', 'You changed it before playing week 1', 'Your committed numbers came from Status Report'], false],
    ['matched record, +3/10% stated and played', { week: 13, low: 11, high: 14, onTimeChance: 45 }, C3I, { hire: 3, inspect: 0.1 }, ['): held.', 'Week 1 ran as stated', 'Your committed numbers came from Records, and you then changed them'], false],
    ['all 40, hands-off stated and played', { week: 15, low: 11, high: 22, onTimeChance: 20 }, HO, {}, ['): held.', 'A range that wide costs points even when it holds.', 'Week 1 ran as stated'], true],
    ['pace, hands-off stated and played', pace, HO, {}, ['missed by 5 weeks (late)', 'Week 1 ran as stated', 'Sees ', 'You set your committed numbers yourself.'], true],
  ];
  for (const [i, [label, f, plan, pol, verdict, coaster]] of cases.entries()) {
    const p = new Project('ledger');
    p.commit({ ...f, plan, desk: { tool: ['a', 'j', 'e', ''][i], tabs: i * 3, minutes: 4 + i, edited: i === 1, order: ['status', 'analytics'] } });
    playPolicy(p, pol);
    ok(`Reveal, ledger: ${label} → ${verdict.join(', ')}`, () => {
      const h = renderToString(<Reveal project={p} onReplay={() => {}} />).replace(/<!-- -->/g, '').replace(/&#x27;/g, "'");
      for (const v of verdict) if (!h.includes(v)) throw new Error(`"${v}" not shown`);
      if (/Reasoned|Lucky|Verdict|Tool used|Played as stated/.test(h)) throw new Error('an old label is still shown');
      if (h.includes('How you played') || h.includes('Updating')) throw new Error('How you played or Updating still shown');
      if (h.includes('past managers also ran it hands-off') !== coaster) throw new Error('coaster line wrong');
      // The phone order: lesson, scores, tools, your range, the dashboard, then More detail.
      const at = (x) => h.indexOf(x);
      const order = ['Your game in 8 facts', 'Your dashboard said', 'Forecast score', 'Delivery (secondary)', 'How each tool on the desk would have done', 'Your range against the record', 'What your dashboard told you', 'More detail'];
      if (order.some((x) => at(x) < 0) || order.some((x, k) => k && at(x) < at(order[k - 1]))) throw new Error('reveal order wrong');
      const fw = p.history.find((r) => r.rejected > 0 || r.reported >= 0.999).week;
      if (!/Your game in 8 facts/.test(h) || (h.match(/aria-hidden="true">[1-8]<\/span>/g) || []).length !== 8) throw new Error('8 numbered facts missing');
      for (const x of [`Your dashboard said week ${fw}.`, `It was accepted in week ${p.scores().outcome}.`, `The past contracts said week 14`, `You gave ${f.onTimeChance}% to week 12; it`, 'first passed 90% in week']) if (!h.replace(/<[^>]+>/g, '').includes(x)) throw new Error(`"${x}" missing`);
      if (h.includes('BLP') || h.includes('result code')) throw new Error('a result code is still shown');
      return h;
    });
    ok(`Play, ledger with stated plan: ${label}`, () => {
      const q = new Project('ledger');
      q.commit({ ...f, plan });
      const h = renderToString(<Play project={q} onPlay={() => {}} />);
      if (!h.includes('Your stated plan:') || !h.includes('Week 1 is set from it')) throw new Error('stated plan not shown as a reminder');
      // The stated plan is applied as week 1's decisions.
      const a = h.replace(/<!-- -->/g, '');
      if (plan.crews > 0 && !a.includes(`4 + ${plan.crews} this week`)) throw new Error('week 1 crews not set from the plan');
      if (!new RegExp(`aria-pressed="true"[^>]*>${Math.round(plan.inspect * 100)}%`).test(a)) throw new Error('week 1 inspection not set from the plan');
      if (!/This Week(&#x27;|')s Decisions/.test(h) || !h.includes('Status Report') || !/Play week (<!-- -->)?1/.test(h)) throw new Error('decisions tab or tool strip missing');
      return h;
    });
  }
  ok('Brief, front tab: inputs only', () => {
    const h = renderToString(<Brief onCommit={() => {}} />);
    for (const s of ['1 · Your plan', '2 · Your forecast', 'Commit plan and forecast', "The contract, its rules and the line"]) if (!h.includes(s) && !h.includes(s.replace("'", '&#x27;'))) throw new Error(`missing "${s}"`);
    for (const s of ['What you decide each week', 'a week</strong>', 'two scores', 'Two scores']) if (h.includes(s)) throw new Error(`front tab still shows "${s}"`);
    if (!h.replace(/<[^>]+>/g, '').includes('Your score is your forecast. Delivery shows how the company did.') || h.includes('Three scores') || h.includes('Updating')) throw new Error('scoring line wrong before commit');
    return h;
  });
  // Fairness: everything a calibrated forecast needs is reachable before week 1, in the tabs.
  const before = (id, plan = null) => renderToString(<Brief onCommit={() => {}} initialTab={id} initialPlan={plan} />);
  const strip = (h) => h.replace(/<!-- -->/g, '').replace(/&#x27;/g, "'").replace(/<\/?(strong|span)[^>]*>/g, '');
  ok('Before week 1, The Contract states every rule and both scores', () => {
    const h = strip(before('contract'));
    if (/tool tabs each week|views a week|Round 1|lose a crew|parts delay|inspectors|Updating/.test(h)) throw new Error('The Contract states a removed rule');
    for (const s of ['200', '12', '4', '$5.00M', '$500k', 'A new crew slows the whole line to 70%', 'From the second straight week, tired crews make more defects', 'acceptance test', 'terminates the contract', 'goes bankrupt', 'scope change', 'turn out defective', 'What you decide each week', 'Your score is your forecast. Delivery shows how the company did.', 'a narrow range that holds scores best', 'units of work to fix', 'own week-to-week luck']) if (!h.includes(s)) throw new Error(`missing "${s}"`);
    return h;
  });
  ok('Before week 1, Last 5 Contracts gives the pace and the last contract’s story', () => {
    const h = strip(before('last5'));
    for (const s of ['19.1 a week', '10.5 weeks', '100% in week 13', 'Accepted in week 17', '20 units', 'Range of the delivered ones']) if (!h.includes(s)) throw new Error(`missing "${s}"`);
    if (h.includes('80% range')) throw new Error('Last 5 still calls its min-max an 80% range');
    return h;
  });
  ok('Before week 1, Records gives the 40 contracts, their dot strip and summary', () => {
    const h = strip(before('records'));
    for (const s of ['All 40 contracts', 'median week 14', 'percentile weeks 12–17', 'of the 38 delivered', '18% made week 12', '2 of 40 never delivered (2 bankrupt)', 'counts as not on time']) if (!h.includes(s)) throw new Error(`missing "${s}"`);
    if ((before('records').match(/rounded-full/g) || []).length < 38) throw new Error('dot strip missing (one dot per delivered contract)');
    if (!h.includes('✕✕') || h.includes('✕✕✕') || !h.includes('never delivered: 2 bankrupt')) throw new Error('failures not beside the dot strip');
    return h;
  });
  const C3 = { crews: 3, inspect: 0.1, shift: 'none' };
  for (const t of TABS.slice(1)) {
    for (const plan of [null, C3, { crews: 1, inspect: 0.3, shift: 'every' }]) {
      ok(`Desk tab ${t.name}${plan ? `, plan ${plan.crews}/${plan.inspect}/${plan.shift}` : ', no plan yet'}`, () => {
        const h = renderToString(<Brief onCommit={() => {}} initialTab={t.id} initialPlan={plan} />);
        if (/>Can(&#x27;|')t see</.test(h)) throw new Error('the tab still carries a sees or cant-see label');
        if (t.forecasts && t.id !== 'chat' && t.id !== 'records' && !h.includes('Use this on my prediction')) throw new Error('no Use this button');
        if (t.id === 'records' && (h.match(/<tr/g) || []).length < 41) throw new Error('table does not have 40 rows');
        if (t.id === 'status' && (!h.includes('Schedule efficiency') || !h.includes('Cost efficiency') || !h.includes('Projected finish') || !h.includes('Credit line') || /EV ÷|BAC|planned value/.test(h))) throw new Error('status report jargon or money tiles wrong');
        if (t.id === 'simulator' && !h.includes('Include rework')) throw new Error('rework switch missing');
        if (t.id === 'last5' && !/#(<!-- -->)?40/.test(h)) throw new Error('last contract not record #40');
        if (t.id === 'ai' && (!h.includes('Copy the prompt') || !h.includes('knows what you') || !h.includes('always includes the contract') || h.includes('includes: The Contract') || h.includes('PAST CONTRACTS'))) throw new Error('AI prompt should hold only the rules until tabs are opened');
        return h;
      });
    }
  }
}
{
  let n = 0;
  for (let i = 0; i < 40; i++) {
    const p = new Project(`fuzz-plan-${i}`);
    p.commit({ week: 8 + (i % 8), low: 7 + (i % 8), high: 10 + (i % 9), onTimeChance: (i * 7) % 101, plan: { crews: i % 4, inspect: [0, 0.1, 0.2, 0.3][(i >> 2) % 4], shift: ['none', 'late', 'every'][i % 3] } });
    playPolicy(p, { hire: (i % 5) - 1, inspect: [0, 0.1, 0.2, 0.3][i % 4], shiftFrom: 6 + (i % 7) });
    try { renderToString(<Reveal project={p} onReplay={() => {}} />); n++; } catch (err) { console.log(`  FAIL plan fuzz ${i}: ${err.message}`); fails++; break; }
  }
  console.log(`  ok   plan fuzz: ${n}/40 reveals rendered`);
}

{
  // Personal luck: one code, several students, each reveal reads sensibly against that student's own outcome.
  for (let i = 1; i <= 12; i++) {
    const p = new Project('ledger', undefined, i);
    p.commit({ week: 13, low: 11, high: 14, onTimeChance: 40, plan: { crews: i % 4, inspect: (i % 3) / 10, shift: 'none' } });
    playPolicy(p, { hire: i % 4, inspect: (i % 3) / 10 });
    ok(`Reveal with personal luck ${i}`, () => {
      const h = renderToString(<Reveal project={p} onReplay={() => {}} />);
      if (!h.includes('How each tool on the desk would have done') || (p.result === 'DELIVERED' && !h.replace(/<!-- -->/g, '').includes(`week ${p.scores().outcome}`))) throw new Error('comparison missing');
      return h;
    });
  }
}
console.log(fails ? `\n${fails} FAILED` : '\nAll render checks passed');
process.exit(fails ? 1 : 0);
