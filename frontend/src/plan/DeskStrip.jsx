// The Decision Desk's tab strip: the student's own tab first and highlighted, then the
// tools in their groups, scrolling sideways on a phone.
import { TABS } from './desk.js';
import { round1Rule } from './engine';

const TAB_TONE = {
  inside: ['text-sky-300', 'border-sky-400'],
  record: ['text-amber-300', 'border-amber-400'],
  people: ['text-violet-300', 'border-violet-400'],
};

/**
 * `front` is the student's own tab (Your Plan & Prediction before week 1, This Week's
 * Decisions during play): a filled button, first in the strip's first row, pinned to
 * the left edge while the tools scroll sideways, so it stays in view and never reads
 * as one more tool.
 */
export default function TabStrip({ tab, opened, onOpen, front = TABS[0], tabs = TABS.slice(1), sticky = true, checks = null }) {
  // A tab is locked once the week's views are used, unless it was already viewed (or doesn't count).
  // The front tab is never locked. Round 1 (no limit) locks nothing.
  const round1 = !!checks && checks.limit === Infinity;
  const locked = (t) => !!checks && !round1 && checks.left <= 0 && checks.counts(t.id) && !opened.includes(t.id);
  const groups = [];
  for (const t of tabs) {
    const g = t.group || '';
    if (!groups.length || groups[groups.length - 1].name !== g) groups.push({ name: g, tabs: [] });
    groups[groups.length - 1].tabs.push(t);
  }
  const frontActive = tab === front.id;
  return (
    <nav aria-label="Briefing and decision support tabs" className={`${sticky ? 'sticky top-0 z-10 -mx-4 px-4' : ''} py-2 bg-slate-950/95 backdrop-blur border-b border-slate-800`}>
      {round1 && (
        <div role="note" className="mb-2 rounded-lg border-2 border-amber-400 bg-amber-500/15 px-3 py-2 text-sm sm:text-base font-bold text-amber-100">
          {round1Rule()}
        </div>
      )}
      <div className="flex gap-4 gap-y-2 overflow-x-auto sm:flex-wrap pb-1" role="tablist">
        {/* The student's own tab: first in the first row, and pinned to the left edge while the tools scroll. */}
        <div className="shrink-0 sticky left-0 z-10 bg-slate-950 pr-1">
          <div className="text-[9px] uppercase tracking-wider text-emerald-300 h-3 whitespace-nowrap">{front.group || 'You'}</div>
          <div className="flex gap-1 mt-1">
            <button type="button" role="tab" aria-selected={frontActive} onClick={() => onOpen(front.id)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 border ${frontActive ? 'border-white ring-2 ring-emerald-300/60' : 'border-emerald-500'}`}>
              {front.short || front.name}
            </button>
          </div>
        </div>
        {groups.map((g) => (
          <div key={g.name} className="shrink-0">
            <div className="text-[9px] uppercase tracking-wider text-slate-500 h-3 whitespace-nowrap">{g.name}</div>
            <div className="flex gap-1 mt-1">
              {g.tabs.map((t) => {
                const active = tab === t.id;
                const [txt, bd] = TAB_TONE[t.tone] || ['text-white', 'border-white'];
                const lock = locked(t);
                return (
                  <button key={t.id} type="button" role="tab" aria-selected={active} aria-disabled={lock} disabled={lock} onClick={() => onOpen(t.id)}
                    title={lock ? `You've used your ${checks.limit} views ${checks.when}` : undefined}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs border ${active ? `bg-slate-800 ${bd} ${txt} font-semibold` : lock ? 'border-slate-900 text-slate-600 line-through cursor-not-allowed' : `border-slate-800 ${opened.includes(t.id) ? 'text-slate-300' : 'text-slate-400'}`}`}>
                    {lock ? '🔒 ' : ''}{t.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {checks && !round1 && (
        <div className={`text-[11px] mt-1 ${checks.left > 0 ? 'text-slate-400' : 'text-amber-300'}`}>
          {checks.left > 0 ? `${checks.left} view${checks.left === 1 ? '' : 's'} left ${checks.when}` : `You've used your ${checks.limit} views ${checks.when}. The tabs you've viewed stay open.`}
        </div>
      )}
    </nav>
  );
}
