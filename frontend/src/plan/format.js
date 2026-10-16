// Number formatting.

export const money = (n) => {
  const v = Math.round(n);
  const sign = v < 0 ? '−' : '';
  const a = Math.abs(v);
  return a >= 1_000_000 ? `${sign}$${(a / 1_000_000).toFixed(2)}M` : `${sign}$${Math.round(a / 1000)}k`;
};

export const pct = (x) => `${Math.round(x * 100)}%`;
