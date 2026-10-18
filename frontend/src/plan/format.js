// Number formatting.

export const money = (n) => {
  const v = Math.round(n);
  const sign = v < 0 ? '−' : '';
  const a = Math.abs(v);
  return a >= 1_000_000 ? `${sign}$${(a / 1_000_000).toFixed(2)}M` : `${sign}$${Math.round(a / 1000)}k`;
};

export const pct = (x) => `${Math.round(x * 100)}%`;

/** Saves text as a file in the browser. */
export function downloadText(name, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
