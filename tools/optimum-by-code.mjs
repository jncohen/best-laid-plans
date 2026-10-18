// Does the best static plan differ from one scenario code to another?
// For each code, every static plan (crews added in week 1, inspection, second shift) is played
// under 30 personal-luck draws; the best plan is the one with the highest mean Delivery score.
import { Project, CONFIG } from '../frontend/src/plan/engine.js';
const codes = process.argv[2] ? process.argv[2].split(',') : Array.from({ length: 40 }, (_, i) => `code${i + 1}`);
const DRAWS = 30;
const plans = [];
for (const crews of [0, 1, 2, 3]) for (const inspect of CONFIG.inspectionOptions) for (const shift of ['none', 'late', 'every']) plans.push({ crews, inspect, shift });
const label = (p) => `+${p.crews}/${Math.round(p.inspect * 100)}%/${p.shift}`;
const tally = {};
for (const code of codes) {
  let best = null;
  const p0 = new Project(code);
  for (const pl of plans) {
    let score = 0, onTime = 0;
    for (let k = 0; k < DRAWS; k++) {
      const q = new Project(code, CONFIG, (Math.imul(k + 7, 2246822519) ^ 0x27d4eb2f) >>> 0);
      while (!q.done) { const w = q.week + 1; q.play({ hire: w === 1 ? pl.crews : 0, inspect: pl.inspect, shift: pl.shift === 'every' || (pl.shift === 'late' && w >= 9 && w <= 11) }); }
      score += q.scores().delivery; if (q.result === 'DELIVERED' && q.finishWeek <= CONFIG.deadline) onTime++;
    }
    const r = { pl, score: score / DRAWS, onTime: onTime / DRAWS };
    if (!best || r.score > best.score) best = r;
  }
  tally[label(best.pl)] = (tally[label(best.pl)] || 0) + 1;
  console.log(`${code.padEnd(8)} shock wk ${p0.shockWeek} +${p0.shockSize}  productivity ${p0.productivity.toFixed(2)}  defect-prone ${p0.defectProne.toFixed(2)}  best ${label(best.pl).padEnd(14)} delivery ${best.score.toFixed(1)}  on time ${Math.round(100 * best.onTime)}%`);
}
console.log('\nBest plan, by how many codes:', Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · '));
