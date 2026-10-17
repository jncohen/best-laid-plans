// The player's own track record, kept on this device only.
export const TRACK_KEY = 'blp-track-v1';

export function readTrack() {
  try { const v = JSON.parse(localStorage.getItem(TRACK_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** Adds one finished play. Storage may be unavailable (private windows); then nothing is kept. */
export function addToTrack(entry) {
  try { localStorage.setItem(TRACK_KEY, JSON.stringify([...readTrack(), entry].slice(-50))); } catch { /* storage unavailable */ }
}
