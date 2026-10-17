// The Decision Desk's tab strip: the tools in their groups, scrolling sideways on a phone.
import { TABS } from './desk.js';

const TAB_TONE = {
  inside: ['text-sky-300', 'border-sky-400'],
  record: ['text-amber-300', 'border-amber-400'],
  people: ['text-violet-300', 'border-violet-400'],
  front: ['text-white', 'border-white'],
};

/** The tab strip: the front tab, then the tools in their groups. Scrolls sideways on a phone. */
export default function TabStrip({ tab, opened, onOpen, tabs = TABS, sticky = true }) {
  const groups = [];
  for (const t of tabs) {
    const g = t.group || '';
    if (!groups.length || groups[groups.length - 1].name !== g) groups.push({ name: g, tabs: [] });
    groups[groups.length - 1].tabs.push(t);
  }
  return (
    <nav aria-label="Decision support tabs" className={`${sticky ? 'sticky top-0 z-10 -mx-4 px-4' : ''} py-2 bg-slate-950/95 backdrop-blur border-b border-slate-800`}>
      <div className="flex gap-4 gap-y-2 overflow-x-auto sm:flex-wrap pb-1" role="tablist">
        {groups.map((g) => (
          <div key={g.name} className="shrink-0">
            <div className="text-[9px] uppercase tracking-wider text-slate-500 h-3 whitespace-nowrap">{g.name}</div>
            <div className="flex gap-1 mt-1">
              {g.tabs.map((t) => {
                const active = tab === t.id;
                const [txt, bd] = TAB_TONE[t.tone];
                return (
                  <button key={t.id} type="button" role="tab" aria-selected={active} onClick={() => onOpen(t.id)}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs border ${active ? `bg-slate-800 ${bd} ${txt} font-semibold` : `border-slate-800 ${opened.includes(t.id) ? 'text-slate-300' : 'text-slate-400'}`}`}>
                    {t.id === 'commit' ? t.short : t.name}
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
