// Server-renders every screen of the game, across finished, terminated and fuzzed runs.
import { renderToString } from 'react-dom/server';
import { Project, playPolicy } from './src/plan/engine.js';
import Brief from './src/plan/Brief.jsx';
import Play from './src/plan/Play.jsx';
import Reveal from './src/plan/Reveal.jsx';
import Room from './src/plan/Room.jsx';

let fails = 0;
const ok = (n, fn) => {
  try { const h = fn(); if (!h || h.length < 50) throw new Error('suspiciously empty output'); console.log(`  ok   ${n} (${h.length} chars)`); }
  catch (e) { fails++; console.log(`  FAIL ${n} — ${e.message}`); }
};

console.log('Render checks');
ok('Brief', () => renderToString(<Brief onCommit={() => {}} />));
{
  const p = new Project('render-plan');
  p.commit({ week: 10, low: 9, high: 12, onTimeChance: 70 });
  ok('Play, week 1', () => renderToString(<Play project={p} onPlay={() => {}} />));
  for (let w = 0; w < 7; w++) p.play({ hire: w === 0 ? 2 : 0, inspect: 0.1, shift: w > 4, forecast: 11 + w });
  ok('Play, mid-game with history', () => renderToString(<Play project={p} onPlay={() => {}} />));
  playPolicy(p, { inspect: 0.1 });
  ok('Reveal, delivered', () => renderToString(<Reveal project={p} name="A Student" onReplay={() => {}} />));
}
{
  const t = new Project('render-term');
  t.commit({ week: 12, low: 11, high: 13, onTimeChance: 50 });
  while (!t.done) t.play({ hire: -3, inspect: 0.3 });
  ok('Reveal, terminated or very late', () => renderToString(<Reveal project={t} name="" onReplay={() => {}} />));
}
ok('Room, empty', () => renderToString(<Room />));
{
  // The four ledger cases from the work order: each reveal must name its verdict.
  const C3I = { crews: 3, inspect: 0.1, shift: 'none' }, HO = { crews: 0, inspect: 0, shift: 'none' };
  const pace = { week: 11, low: 10, high: 12, onTimeChance: 75 };
  const cases = [
    ['pace, stated hands-off, plays +3/10%', pace, HO, { hire: 3, inspect: 0.1 }, 'Lucky', false],
    ['matched record, +3/10% stated and played', { week: 13, low: 11, high: 14, onTimeChance: 45 }, C3I, { hire: 3, inspect: 0.1 }, 'Reasoned', false],
    ['all 40, hands-off stated and played', { week: 14, low: 12, high: 17, onTimeChance: 15 }, HO, {}, 'Lucky', true],
    ['pace, hands-off stated and played', pace, HO, {}, 'Missed', true],
  ];
  const codes = [];
  for (const [label, f, plan, pol, verdict, coaster] of cases) {
    const p = new Project('ledger');
    p.commit({ ...f, plan });
    playPolicy(p, pol);
    codes.push(p.resultCode(label.slice(0, 10)));
    ok(`Reveal, ledger: ${label} → ${verdict}`, () => {
      const h = renderToString(<Reveal project={p} name="" onReplay={() => {}} />);
      if (!h.includes(`>${verdict}</div>`)) throw new Error(`verdict ${verdict} not shown`);
      if (h.includes('past managers also ran it hands-off') !== coaster) throw new Error('coaster line wrong');
      return h;
    });
    ok(`Play, ledger with stated plan: ${label}`, () => {
      const q = new Project('ledger');
      q.commit({ ...f, plan });
      const h = renderToString(<Play project={q} onPlay={() => {}} />);
      if (!h.includes('Your stated plan')) throw new Error('stated plan not shown');
      return h;
    });
  }
  ok('Room, BLP2 and BLP1 codes together', () => {
    const h = renderToString(<Room initialText={[...codes, 'BLP1|1u65p58|11|10|12|75|12|D|10|4500|Old'].join('\n')} />);
    if (!h.includes('changed') || !h.includes('kept')) throw new Error('kept/changed markers missing');
    if (!/1<!-- --> reasoned/.test(h) || !/2<!-- --> lucky/.test(h)) throw new Error('reasoned/lucky counts wrong');
    return h;
  });
  ok('Brief shows the record table and the disclosures', () => {
    const h = renderToString(<Brief onCommit={() => {}} />);
    for (const s of ['Crews added', 'Scope change', 'terminates the contract', 'turn out defective', 'Contracts run like my plan', '1 · Your plan']) {
      if (!h.includes(s)) throw new Error(`missing "${s}"`);
    }
    if ((h.match(/<tr /g) || []).length < 41 && (h.match(/<tr>/g) || []).length + (h.match(/<tr /g) || []).length < 41) throw new Error('table does not have 40 rows');
    return h;
  });
}
{
  let n = 0;
  for (let i = 0; i < 40; i++) {
    const p = new Project(`fuzz-plan-${i}`);
    p.commit({ week: 8 + (i % 8), low: 7 + (i % 8), high: 10 + (i % 9), onTimeChance: (i * 7) % 101, plan: { crews: i % 4, inspect: [0, 0.1, 0.2, 0.3][(i >> 2) % 4], shift: ['none', 'late', 'every'][i % 3] } });
    playPolicy(p, { hire: (i % 5) - 1, inspect: [0, 0.1, 0.2, 0.3][i % 4], shiftFrom: 6 + (i % 7) });
    try { renderToString(<Reveal project={p} name={`s${i}`} onReplay={() => {}} />); n++; } catch (err) { console.log(`  FAIL plan fuzz ${i}: ${err.message}`); fails++; break; }
  }
  console.log(`  ok   plan fuzz: ${n}/40 reveals rendered`);
}

console.log(fails ? `\n${fails} FAILED` : '\nAll render checks passed');
process.exit(fails ? 1 : 0);
