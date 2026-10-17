import { useState } from 'react';
import { Project, decodePlan } from './engine';
import { tabById } from './desk.js';
import Brief from './Brief';
import Play from './Play';
import Reveal from './Reveal';

const param = (k) => {
  try {
    return new URLSearchParams(window.location.search).get(k) || '';
  } catch {
    return '';
  }
};
const seedFromUrl = () => param('seed');
// ?tab=analytics opens the briefing on a tool tab, and ?plan=31n pre-states a plan:
// handy for projecting one tab in class.
const tabFromUrl = () => (tabById(param('tab')) ? param('tab') : 'commit');
const planFromUrl = () => decodePlan(param('plan'));

export default function PlanApp() {
  const [phase, setPhase] = useState('brief'); // brief | play | stop | reveal
  const [project, setProject] = useState(null);
  const [name, setName] = useState('');
  const [, setTick] = useState(0);
  const [lastSeed, setLastSeed] = useState(seedFromUrl);
  const [first, setFirst] = useState(true);

  const commit = (forecast, seed, who) => {
    const p = new Project(seed || null);
    p.commit(forecast);
    setProject(p);
    setName(who);
    setLastSeed(seed);
    setFirst(false);
    setPhase('play');
    window.scrollTo(0, 0);
  };

  const play = (decision) => {
    project.play(decision);
    setTick((t) => t + 1);
    if (project.done) {
      setPhase('stop');
      window.scrollTo(0, 0);
    }
  };

  if (phase === 'brief' || !project) return <Brief onCommit={commit} initialSeed={lastSeed} initialTab={first ? tabFromUrl() : 'commit'} initialPlan={first ? planFromUrl() : null} />;
  if (phase === 'play') return <Play project={project} onPlay={play} />;
  if (phase === 'stop') {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center space-y-6">
        <h1 className="text-2xl font-bold text-white">The contract is finished.</h1>
        <p className="text-slate-300">Don't reveal your results yet. Wait for your instructor.</p>
        <p className="text-sm text-slate-500">
          While you wait: in which week did the customer accept it? Was your forecast right? How sure are you, 0–100?
        </p>
        <button type="button" onClick={() => { setPhase('reveal'); window.scrollTo(0, 0); }}
          className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold">
          Reveal results
        </button>
      </div>
    );
  }
  return <Reveal project={project} name={name} onReplay={() => { setPhase('brief'); setProject(null); }} />;
}
