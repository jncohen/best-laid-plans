// Server-renders every screen of the game, across finished, terminated and fuzzed runs.
import { renderToString } from 'react-dom/server';
import { Project, playPolicy } from './src/plan/engine.js';
import Brief from './src/plan/Brief.jsx';
import Play from './src/plan/Play.jsx';
import Reveal from './src/plan/Reveal.jsx';
import { TABS, screenData, liveScreen } from './src/plan/desk.js';
import DeskTab from './src/plan/DeskTabs.jsx';

let fails = 0;
const ok = (n, fn) => {
  try { const h = fn(); if (!h || h.length < 50) throw new Error('suspiciously empty output'); console.log(`  ok   ${n} (${h.length} chars)`); }
  catch (e) { fails++; console.log(`  FAIL ${n} — ${e.message}`); }
};

console.log('Render checks');
ok('Brief', () => renderToString(<Brief onCommit={() => {}} />));
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
  playPolicy(p, { inspect: 0.1 });
  ok('Reveal, delivered', () => renderToString(<Reveal project={p} onReplay={() => {}} />));
}
{
  const t = new Project('render-term');
  t.commit({ week: 12, low: 11, high: 13, onTimeChance: 50 });
  while (!t.done) t.play({ hire: -3, inspect: 0.3 });
  ok('Reveal, terminated or very late', () => renderToString(<Reveal project={t} onReplay={() => {}} />));
}
{
  // Four ledger cases: each reveal states whether the range held and whether the plan was kept.
  const C3I = { crews: 3, inspect: 0.1, shift: 'none' }, HO = { crews: 0, inspect: 0, shift: 'none' };
  const pace = { week: 11, low: 10, high: 12, onTimeChance: 75 };
  const cases = [
    ['pace, stated hands-off, plays +3/10%', pace, HO, { hire: 3, inspect: 0.1 }, ['Missed, 1 wk late', 'You changed plan'], false],
    ['matched record, +3/10% stated and played', { week: 13, low: 11, high: 14, onTimeChance: 45 }, C3I, { hire: 3, inspect: 0.1 }, ['>Held<', 'You played the plan you stated'], false],
    ['all 40, hands-off stated and played', { week: 15, low: 11, high: 23, onTimeChance: 20 }, HO, {}, ['>Held<', 'You played the plan you stated'], true],
    ['pace, hands-off stated and played', pace, HO, {}, ['Missed, 6 wk late', 'You played the plan you stated', 'Sees '], true],
  ];
  for (const [i, [label, f, plan, pol, verdict, coaster]] of cases.entries()) {
    const p = new Project('ledger');
    p.commit({ ...f, plan, desk: { tool: ['a', 'o', 'j', ''][i], tabs: i * 3, minutes: 4 + i, edited: i === 1, order: ['status', 'analytics'] } });
    playPolicy(p, pol);
    ok(`Reveal, ledger: ${label} → ${verdict.join(', ')}`, () => {
      const h = renderToString(<Reveal project={p} onReplay={() => {}} />);
      for (const v of verdict) if (!h.includes(v)) throw new Error(`"${v}" not shown`);
      if (/Reasoned|Lucky|Verdict/.test(h)) throw new Error('a verdict label is still shown');
      if (!h.includes('How you played') || !/changed nothing and checked no tools|still checking or changing things/.test(h)) throw new Error('How you played panel missing');
      if (h.includes('past managers also ran it hands-off') !== coaster) throw new Error('coaster line wrong');
      for (const s of ['Your numbers', `week ${p.scores().outcome}`, `${f.onTimeChance}%`, 'Tool used']) if (!h.includes(s)) throw new Error(`"${s}" missing from Your numbers`);
      if (h.includes('BLP') || h.includes('result code')) throw new Error('a result code is still shown');
      return h;
    });
    ok(`Play, ledger with stated plan: ${label}`, () => {
      const q = new Project('ledger');
      q.commit({ ...f, plan });
      const h = renderToString(<Play project={q} onPlay={() => {}} />);
      if (!h.includes('Your stated plan')) throw new Error('stated plan not shown');
      if (!/This Week(&#x27;|')s Decisions/.test(h) || !h.includes('Status Report') || !/Play week (<!-- -->)?1/.test(h)) throw new Error('decisions tab or tool strip missing');
      return h;
    });
  }
  ok('Brief, front tab: inputs only', () => {
    const h = renderToString(<Brief onCommit={() => {}} />);
    for (const s of ['1 · Your plan', '2 · Your forecast', 'Commit plan and forecast', "The contract, its rules and the line"]) if (!h.includes(s) && !h.includes(s.replace("'", '&#x27;'))) throw new Error(`missing "${s}"`);
    for (const s of ['terminates the contract', 'What you decide each week', 'a week</strong>']) if (h.includes(s)) throw new Error(`front tab still shows "${s}"`);
    return h;
  });
  // Fairness: everything a calibrated forecast needs is reachable before week 1, in the tabs.
  const before = (id, plan = null) => renderToString(<Brief onCommit={() => {}} initialTab={id} initialPlan={plan} />);
  const strip = (h) => h.replace(/<!-- -->/g, '').replace(/&#x27;/g, "'").replace(/<\/?(strong|span)[^>]*>/g, '');
  ok('Before week 1, The Contract states every rule and both scores', () => {
    const h = strip(before('contract'));
    for (const s of ['200', '12', '4', '$4.60M', '$500k', 'New crews work at 50%', 'lose a crew', 'parts delay', 'free tool checks', 'acceptance test', 'terminates the contract', 'goes bankrupt', 'scope change', 'turn out defective', 'What you decide each week', 'Forecast', 'Delivery', 'costs double']) if (!h.includes(s)) throw new Error(`missing "${s}"`);
    return h;
  });
  ok('Before week 1, Last 5 Contracts gives the pace and the last contract’s story', () => {
    const h = strip(before('last5'));
    for (const s of ['20.6 a week', '9.7 weeks', '100% in week 12', 'Accepted in week 16', '20 units']) if (!h.includes(s)) throw new Error(`missing "${s}"`);
    return h;
  });
  ok('Before week 1, Records gives the 40 contracts, their dot strip and summary', () => {
    const h = strip(before('records'));
    for (const s of ['All 40 contracts', 'median week 15', 'percentile weeks 11–23', '20% made week 12']) if (!h.includes(s)) throw new Error(`missing "${s}"`);
    if ((before('records').match(/rounded-full/g) || []).length < 40) throw new Error('dot strip missing');
    return h;
  });
  const C3 = { crews: 3, inspect: 0.1, shift: 'none' };
  for (const t of TABS.slice(1)) {
    for (const plan of [null, C3, { crews: 1, inspect: 0.3, shift: 'every' }]) {
      ok(`Desk tab ${t.name}${plan ? `, plan ${plan.crews}/${plan.inspect}/${plan.shift}` : ', no plan yet'}`, () => {
        const h = renderToString(<Brief onCommit={() => {}} initialTab={t.id} initialPlan={plan} />);
        if (/>Can(&#x27;|')t see</.test(h)) throw new Error('the tab still carries a sees or cant-see label');
        if (t.forecasts && t.id !== 'chat' && t.id !== 'consensus' && t.id !== 'records' && !h.includes('Use this on my prediction')) throw new Error('no Use this button');
        if (t.id === 'records' && (h.match(/<tr/g) || []).length < 41) throw new Error('table does not have 40 rows');
                        if (t.id === 'cost' && !h.includes('bankruptcy')) throw new Error('bankruptcy line missing');
        if (t.id === 'simulator' && !h.includes('Include rework')) throw new Error('rework switch missing');
        if (t.id === 'last5' && !/#(<!-- -->)?40/.test(h)) throw new Error('last contract not record #40');
        if (t.id === 'risks' && !h.includes('Premortem')) throw new Error('premortem missing');
        if (t.id === 'ai' && (!h.includes('Copy the prompt') || !h.includes('knows only what you') || h.includes('PAST CONTRACTS'))) throw new Error('AI prompt should hold only the rules until tabs are opened');
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

console.log(fails ? `\n${fails} FAILED` : '\nAll render checks passed');
process.exit(fails ? 1 : 0);
