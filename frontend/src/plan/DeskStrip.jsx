// The Decision Desk's tab strip: the student's own tab first and highlighted, then the
// tools in their groups, wrapped into rows so every tab is visible on a phone.
import { TABS } from './desk.js';

const TAB_TONE = {
  inside: ['text-sky-300', 'border-sky-400'],
  record: ['text-amber-300', 'border-amber-400'],
  people: ['text-violet-300', 'border-violet-400'],
};

/**
 * `front` is the student's own tab (Your Plan & Prediction before week 1, This Week's
 * Decisions during play): a filled button, first in the strip, so it never reads as one
 * more tool.
 */
export default function TabStrip({ tab, opened, onOpen, front = TABS[0], tabs = TABS.slice(1), sticky = true }) {
  const groups = [];
  for (const t of tabs) {
    const g = t.group || '';
    if (!groups.length || groups[groups.length - 1].name !== g) groups.push({ name: g, tabs: [] });
    groups[groups.length - 1].tabs.push(t);
  }
  const frontActive = tab === front.id;
  return (
    <nav aria-label="Briefing and decision support tabs" className={`${sticky ? 'sm:sticky top-0 z-10 -mx-4 px-4' : ''} py-2 bg-slate-950/95 backdrop-blur border-b border-slate-800`}>
      <div className="flex flex-wrap gap-x-3 gap-y-2" role="tablist">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-emerald-300 h-4 whitespace-nowrap">{front.group || 'You'}</div>
          <div className="flex gap-1 mt-0.5">
            <button type="button" role="tab" aria-selected={frontActive} onClick={() => onOpen(front.id)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 border ${frontActive ? 'border-white ring-2 ring-emerald-300/60' : 'border-emerald-500'}`}>
              {front.short || front.name}
            </button>
          </div>
        </div>
        {groups.map((g) => (
          <div key={g.name}>
            <div className="text-[11px] uppercase tracking-wider text-slate-500 h-4 whitespace-nowrap">{g.name}</div>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {g.tabs.map((t) => {
                const active = tab === t.id;
                const [txt, bd] = TAB_TONE[t.tone] || ['text-white', 'border-white'];
                return (
                  <button key={t.id} type="button" role="tab" aria-selected={active} onClick={() => onOpen(t.id)}
                    className={`whitespace-nowrap px-2.5 py-1.5 rounded-lg text-xs border ${active ? `bg-slate-800 ${bd} ${txt} font-semibold` : `border-slate-800 ${opened.includes(t.id) ? 'text-slate-300' : 'text-slate-400'}`}`}>
                    {opened.includes(t.id) ? '✓ ' : ''}{t.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
