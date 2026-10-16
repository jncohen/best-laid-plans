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
  let n = 0;
  for (let i = 0; i < 40; i++) {
    const p = new Project(`fuzz-plan-${i}`);
    p.commit({ week: 8 + (i % 8), low: 7 + (i % 8), high: 10 + (i % 9), onTimeChance: (i * 7) % 101 });
    playPolicy(p, { hire: (i % 5) - 1, inspect: [0, 0.1, 0.2, 0.3][i % 4], shiftFrom: 6 + (i % 7) });
    try { renderToString(<Reveal project={p} name={`s${i}`} onReplay={() => {}} />); n++; } catch (err) { console.log(`  FAIL plan fuzz ${i}: ${err.message}`); fails++; break; }
  }
  console.log(`  ok   plan fuzz: ${n}/40 reveals rendered`);
}

console.log(fails ? `\n${fails} FAILED` : '\nAll render checks passed');
process.exit(fails ? 1 : 0);
