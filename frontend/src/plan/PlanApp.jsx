import { useState } from 'react';
import { Project, CONFIG, decodePlan } from './engine';
import { tabById } from './desk.js';
import Brief from './Brief';
import Play from './Play';
import Reveal, { Finished } from './Reveal';

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
  const [, setTick] = useState(0);
  const [lastSeed, setLastSeed] = useState(seedFromUrl);
  const [first, setFirst] = useState(true);

  const commit = (forecast, seed) => {
    // The room shares the code's contract; each play draws its own luck, once, at commit.
    const p = new Project(seed || null, CONFIG, (Math.random() * 4294967296) >>> 0);
    p.commit(forecast);
    setProject(p);
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
  if (phase === 'stop') return <Finished project={project} onReveal={() => { setPhase('reveal'); window.scrollTo(0, 0); }} />;
  return <Reveal project={project} onReplay={() => { setPhase('brief'); setProject(null); }} />;
}
