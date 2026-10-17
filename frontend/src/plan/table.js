// The past-contracts table: filtering and sorting, kept pure so the tests can check
// that what the table summarises is what matchContracts() finds.
import { normalizePlan } from './engine.js';

export const ANY = 'any';

/** Filters: crews added (a number or 'any'), inspection and second shift ('none', 'some' or 'any'). */
export function filterContracts(rows, { crews = ANY, inspect = ANY, shift = ANY } = {}) {
  return rows.filter((r) => (crews === ANY || r.crewsAdded === +crews)
    && (inspect === ANY || (r.inspect > 0) === (inspect === 'some'))
    && (shift === ANY || (r.shiftWeeks > 0) === (shift === 'some')));
}

/** The table filters that pick out contracts run like a plan (matchContracts' closest rule). */
export function filterForPlan(plan) {
  const p = normalizePlan(plan);
  return { crews: p.crews, inspect: p.inspect > 0 ? 'some' : 'none', shift: p.shift !== 'none' ? 'some' : 'none' };
}

const KEYS = {
  id: (r) => r.id,
  crews: (r) => r.crewsAdded * 100 + (r.hires[0]?.week ?? 0),
  inspect: (r) => r.inspect,
  shift: (r) => r.shiftWeeks,
  scope: (r) => r.scopeUnits * 100 + r.scopeWeek,
  full: (r) => r.dashboardFullWeek ?? 99,
  rejected: (r) => r.rejected,
  accepted: (r) => r.accepted,
  onTime: (r) => (r.onTime ? 1 : 0),
};

export function sortContracts(rows, key = 'id', dir = 1) {
  const k = KEYS[key] || KEYS.id;
  return [...rows].sort((a, b) => (k(a) - k(b)) * dir || a.id - b.id);
}
