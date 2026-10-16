// Hand-drawn SVG charts. Plain SVG renders identically on the server and in the
// browser, so the reveal can be checked without a browser, and it adds no weight.

const W = 600;
const PAD = { l: 36, r: 12, t: 22, b: 24 };

function axes({ x, y, end, h, yTicks = [0, 50, 100], yFmt = (v) => `${v}%`, xStep = 2 }) {
  const xs = [];
  for (let w = 0; w <= end; w += xStep) xs.push(w);
  return (
    <g>
      {yTicks.map((v) => (
        <g key={`y${v}`}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#1e293b" />
          <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#64748b">{yFmt(v)}</text>
        </g>
      ))}
      {xs.map((w) => (
        <text key={`x${w}`} x={x(w)} y={h - 6} textAnchor="middle" fontSize="11" fill="#64748b">{w}</text>
      ))}
    </g>
  );
}

function vline(x, h, { color, dash = '4 3', label, anchor = 'start', dy = 0 }) {
  return (
    <g>
      <line x1={x} x2={x} y1={PAD.t} y2={h - PAD.b} stroke={color} strokeWidth="1.5" strokeDasharray={dash} />
      {label && (
        <text x={anchor === 'end' ? x - 4 : x + 4} y={PAD.t + 10 + dy} textAnchor={anchor} fontSize="11" fill={color} fontWeight="600">{label}</text>
      )}
    </g>
  );
}

/**
 * Why the forecast missed. Reported progress week by week, with the week the dashboard
 * read 90%, every acceptance rejection, the deadline, the week it was accepted, and the
 * past contracts' range behind it all.
 */
export function RevealChart({ history, deadline, finishWeek, ninetyWeek, band, end }) {
  const h = 280;
  const x = (w) => PAD.l + (w / end) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - v / 100) * (h - PAD.t - PAD.b);
  const pts = [[0, 0], ...history.map((r) => [r.week, Math.round(r.reported * 100)])];
  const line = pts.map(([w, v]) => `${x(w)},${y(v)}`).join(' ');
  const rejections = history.filter((r) => r.rejected > 0);
  const ninety = ninetyWeek ? history.find((r) => r.week === ninetyWeek) : null;

  return (
    <svg viewBox={`0 0 ${W} ${h}`} width="100%" role="img" aria-label="Reported progress against the week the contract was accepted">
      <rect x={x(band[0])} y={PAD.t} width={Math.max(0, x(band[1]) - x(band[0]))} height={h - PAD.t - PAD.b} fill="#f59e0b" fillOpacity="0.12" />
      <text x={(x(band[0]) + x(band[1])) / 2} y={h - PAD.b - 6} textAnchor="middle" fontSize="11" fill="#fbbf24">past contracts</text>
      {axes({ x, y, end, h })}
      {vline(x(deadline), h, { color: '#fb7185', label: 'deadline', anchor: 'end', dy: 150 })}
      {finishWeek !== null && vline(x(finishWeek), h, { color: '#fbbf24', dash: '0', label: 'accepted', anchor: 'start' })}
      <polyline points={line} fill="none" stroke="#38bdf8" strokeWidth="3" strokeLinejoin="round" />
      {pts.map(([w, v]) => <circle key={w} cx={x(w)} cy={y(v)} r="2.5" fill="#38bdf8" />)}
      {ninety && (
        <g>
          <circle cx={x(ninety.week)} cy={y(Math.round(ninety.reported * 100))} r="6" fill="none" stroke="#e0f2fe" strokeWidth="2" />
          <text x={x(ninety.week) - 8} y={y(Math.round(ninety.reported * 100)) + 4} textAnchor="end" fontSize="11" fill="#e0f2fe" fontWeight="600">
            "{Math.round(ninety.reported * 100)}% done"
          </text>
        </g>
      )}
      {rejections.map((r, i) => (
        <g key={`rej${r.week}`}>
          <line x1={x(r.week)} x2={x(r.week)} y1={y(Math.round(r.reported * 100))} y2={y(Math.round(r.reported * 100)) + 26 + (i % 2) * 16} stroke="#f43f5e" strokeWidth="2" />
          <text x={x(r.week)} y={y(Math.round(r.reported * 100)) + 38 + (i % 2) * 16} textAnchor="middle" fontSize="10" fill="#fda4af">−{Math.round(r.rejected)} rejected</text>
        </g>
      ))}
    </svg>
  );
}

/** The dashboard during play: reported progress only. */
export function ProgressSpark({ history, deadline, end }) {
  const h = 140;
  const x = (w) => PAD.l + (w / end) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - v / 100) * (h - PAD.t - PAD.b);
  const pts = [[0, 0], ...history.map((r) => [r.week, Math.round(r.reported * 100)])];
  const line = pts.map(([w, v]) => `${x(w)},${y(v)}`).join(' ');
  const area = `${x(0)},${y(0)} ${line} ${x(pts[pts.length - 1][0])},${y(0)}`;
  return (
    <svg viewBox={`0 0 ${W} ${h}`} width="100%" role="img" aria-label="Reported progress so far">
      {axes({ x, y, end, h })}
      {vline(x(deadline), h, { color: '#fb7185' })}
      <polygon points={area} fill="#0ea5e9" fillOpacity="0.15" />
      <polyline points={line} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The prediction chart — the centre of the game. x: the week of play. y: the week you
 * predicted the customer would accept it. Behind everything, the past contracts' range;
 * at week 0, the 80% range you committed to. When `outcome` is known it is drawn as the
 * line your forecast was chasing.
 */
export function ForecastChart({ log, interval, band, deadline, outcome = null, ninetyWeek = null, xEnd, compact = false }) {
  const h = compact ? 190 : 300;
  const ys = [...log.map((f) => f.forecast), interval.low, interval.high, band[0], band[1], deadline, outcome ?? deadline];
  const lo = Math.max(0, Math.floor(Math.min(...ys)) - 1);
  const hi = Math.ceil(Math.max(...ys)) + 1;
  const x = (w) => PAD.l + 10 + (w / xEnd) * (W - PAD.l - PAD.r - 10);
  const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo)) * (h - PAD.t - PAD.b);
  let d = '';
  log.forEach((f, i) => {
    d += i === 0 ? `M${x(f.week)},${y(f.forecast)}` : ` H${x(f.week)} V${y(f.forecast)}`;
  });
  const step = Math.max(1, Math.round((hi - lo) / 5));
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
  const last = log[log.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${h}`} width="100%" role="img" aria-label="Your predicted acceptance week, week by week">
      <rect x={PAD.l} y={y(band[1])} width={W - PAD.l - PAD.r} height={Math.max(0, y(band[0]) - y(band[1]))} fill="#f59e0b" fillOpacity="0.12" />
      <text x={W - PAD.r - 4} y={y(band[1]) + 13} textAnchor="end" fontSize="11" fill="#fbbf24">past contracts landed here</text>
      {axes({ x, y, end: xEnd, h, yTicks: ticks, yFmt: (v) => `wk ${v}`, xStep: Math.max(1, Math.ceil(xEnd / 8)) })}
      <line x1={PAD.l} x2={W - PAD.r} y1={y(deadline)} y2={y(deadline)} stroke="#fb7185" strokeDasharray="4 3" />
      <text x={PAD.l + 14} y={y(deadline) + 13} fontSize="11" fill="#fb7185">deadline</text>
      <rect x={x(0) - 5} y={y(interval.high)} width="10" height={Math.max(2, y(interval.low) - y(interval.high))} rx="3" fill="#34d399" fillOpacity="0.35" stroke="#34d399" />
      {ninetyWeek !== null && (
        <g>
          <line x1={x(ninetyWeek)} x2={x(ninetyWeek)} y1={PAD.t} y2={h - PAD.b} stroke="#38bdf8" strokeDasharray="2 3" />
          <text x={x(ninetyWeek) + 4} y={h - PAD.b - 6} fontSize="11" fill="#7dd3fc">dashboard: 90% done</text>
        </g>
      )}
      {outcome !== null && (
        <g>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(outcome)} y2={y(outcome)} stroke="#fbbf24" strokeWidth="2.5" />
          <text x={W - PAD.r - 4} y={y(outcome) - 6} textAnchor="end" fontSize="12" fontWeight="700" fill="#fbbf24">accepted: week {outcome}</text>
        </g>
      )}
      <path d={d} fill="none" stroke="#34d399" strokeWidth="3" />
      {log.map((f) => <circle key={f.week} cx={x(f.week)} cy={y(f.forecast)} r="3" fill="#34d399" />)}
      {last && outcome === null && <text x={x(last.week) + 7} y={y(last.forecast) + 4} fontSize="12" fontWeight="700" fill="#6ee7b7">wk {last.forecast}</text>}
    </svg>
  );
}
