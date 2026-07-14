// Value: a dimensioned quantity. Stored canonically in base units, tagged
// with a dimension signature and a preferred display unit. All arithmetic
// enforces dimensional consistency.
//
// kind: 'number' | 'percent' | 'date'
//   number  → n is the magnitude in base units, dims describes it
//   percent → dimensionless, n is the fraction (20% → 0.2)
//   date    → n is epoch SECONDS, dims empty
//
// display: a unit object (from units.js) to render in, or null (base).

import { mulDims, divDims, powDims, eqDims, isDimless, lookupUnit } from './units.js';

export class RErr extends Error {}

export const num = (n, dims = {}, display = null) => ({ n, dims, display, kind: 'number' });
export const percent = (p) => ({ n: p / 100, dims: {}, display: null, kind: 'percent' });
export const dateVal = (epochSec) => ({ n: epochSec, dims: {}, display: null, kind: 'date' });

// Apply a unit to a bare number → a quantity in that unit's dimension.
export function withUnit(n, unit) {
  const base = n * unit.factor + (unit.offset || 0);
  return { n: base, dims: unit.dims, display: unit, kind: 'number' };
}

const isDuration = (v) => v.kind === 'number' && eqDims(v.dims, { time: 1 });
const bothPercent = (a, b) => a.kind === 'percent' && b.kind === 'percent';
// Affine (offset-origin) temperatures — °C/°F stored as absolute kelvin. Naive
// arithmetic on them is physically meaningless, so we guard it rather than
// return confidently-wrong numbers.
const isTempDim = (v) => v.kind === 'number' && eqDims(v.dims, { temp: 1 });
const isOffsetTemp = (v) => isTempDim(v) && v.display && v.display.offset;

export function add(a, b) {
  if (a.kind === 'date' && b.kind === 'date') throw new RErr("can't add two dates");
  if (a.kind === 'date' && isDuration(b)) return dateVal(a.n + b.n);
  if (isDuration(a) && b.kind === 'date') return dateVal(a.n + b.n);
  if (a.kind === 'date' || b.kind === 'date') throw new RErr("can't add that to a date — use a duration like '3 days'");
  if (isOffsetTemp(a) || isOffsetTemp(b)) throw new RErr("can't add absolute temperatures — convert to K, or subtract for a difference");
  if (bothPercent(a, b)) return percent((a.n + b.n) * 100);
  requireSame(a, b, 'add');
  return { n: a.n + b.n, dims: a.dims, display: a.display || b.display, kind: 'number' };
}

export function sub(a, b) {
  if (a.kind === 'date' && b.kind === 'date') return num(a.n - b.n, { time: 1 }, lookupUnit('day'));
  if (a.kind === 'date' && isDuration(b)) return dateVal(a.n - b.n);
  if (a.kind === 'date' || b.kind === 'date') throw new RErr("can't subtract that from a date — use a duration or another date");
  // difference of two temperatures is a delta, correctly the base (kelvin) gap
  if (isTempDim(a) && isTempDim(b) && (isOffsetTemp(a) || isOffsetTemp(b))) return num(a.n - b.n, { temp: 1 }, lookupUnit('k'));
  if (bothPercent(a, b)) return percent((a.n - b.n) * 100);
  requireSame(a, b, 'subtract');
  return { n: a.n - b.n, dims: a.dims, display: a.display || b.display, kind: 'number' };
}

export function mul(a, b) {
  if (a.kind === 'date' || b.kind === 'date') throw new RErr("can't multiply a date");
  if (isOffsetTemp(a) || isOffsetTemp(b)) throw new RErr("can't multiply an absolute temperature — convert to K first");
  const dims = mulDims(a.dims, b.dims);
  const display = pickDisplay(a, b, dims);
  return { n: a.n * b.n, dims, display, kind: 'number' };
}

export function div(a, b) {
  if (b.n === 0) throw new RErr('division by zero');
  if (a.kind === 'date' || b.kind === 'date') throw new RErr("can't divide a date");
  if (isOffsetTemp(a) || isOffsetTemp(b)) throw new RErr("can't divide an absolute temperature — convert to K first");
  const dims = divDims(a.dims, b.dims);
  const display = pickDisplay(a, b, dims);
  return { n: a.n / b.n, dims, display, kind: 'number' };
}

export function pow(a, b) {
  if (!isDimless(b.dims) || b.kind === 'date') throw new RErr('exponent must be a plain number');
  // keep the display unit only for the identity power; m^2 must not render as "m"
  const display = (isDimless(a.dims) || b.n !== 1) ? null : a.display;
  return { n: Math.pow(a.n, b.n), dims: powDims(a.dims, b.n), display, kind: 'number' };
}

export function neg(a) {
  if (a.kind === 'date') throw new RErr("can't negate a date");
  return { ...a, n: -a.n };
}

// Percentage application: "100 + 20%" = 120, "100 - 10%" = 90, "20% of 50" = 10.
export function applyPercentOf(base, pct) {           // pct of base
  const scaled = mul(base, num(pct.n));               // 50 * 0.2
  return scaled;
}
export function addPercent(base, pct) {               // base + its own pct
  return add(base, applyPercentOf(base, pct));
}
export function subPercent(base, pct) {
  return sub(base, applyPercentOf(base, pct));
}

// Convert a value into `unit` (by name), enforcing matching dimensions.
export function convertTo(v, unitName) {
  const unit = lookupUnit(unitName);
  if (!unit) throw new RErr(`unknown unit "${unitName}"`);
  if (v.kind === 'percent') {
    // "0.2 as x" isn't meaningful; only allow percent→number identity display.
    throw new RErr('cannot convert a percentage to a unit');
  }
  if (!eqDims(v.dims, unit.dims)) throw new RErr(`cannot convert ${dimName(v.dims)} to ${unit.sym}`);
  return { n: v.n, dims: v.dims, display: unit, kind: 'number' };
}

function requireSame(a, b, what) {
  const ka = a.kind === 'percent' ? {} : a.dims;
  const kb = b.kind === 'percent' ? {} : b.dims;
  if (!eqDims(ka, kb)) throw new RErr(`cannot ${what} ${dimName(a.dims)} and ${dimName(b.dims)}`);
}

// After a mul/div, keep a sensible display unit: if the result shares the
// dimension of one operand and that operand had a display unit, reuse it
// (so "$50 × 2" stays "$100").
function pickDisplay(a, b, dims) {
  if (a.display && eqDims(a.display.dims, dims)) return a.display;
  if (b.display && eqDims(b.display.dims, dims)) return b.display;
  return null;
}

const DIM_NAMES = {
  length: 'length', mass: 'mass', time: 'time', temp: 'temperature',
  currency: 'money', data: 'data', angle: 'angle',
};
export function dimName(dims) {
  const keys = Object.keys(dims);
  if (keys.length === 0) return 'a number';
  if (keys.length === 1 && dims[keys[0]] === 1) return DIM_NAMES[keys[0]] || keys[0];
  return keys.map(k => `${DIM_NAMES[k] || k}${dims[k] !== 1 ? `^${dims[k]}` : ''}`).join('·');
}
