// Built-in function library. Unit-aware where it makes sense (abs/round keep
// units; trig takes an angle; sqrt halves the dimension exponents).

import { num, mul, div, add, RErr, dimName } from './value.js';
import { powDims, isDimless, eqDims } from './units.js';

const dimless = (v, name) => {
  if (!isDimless(v.dims) || v.kind === 'date') throw new RErr(`${name}() needs a plain number`);
  return v.n;
};
const keepUnit = (v, fn) => ({ ...v, n: fn(v.n), kind: v.kind === 'date' ? 'number' : v.kind });

function angleRadians(v) {
  if (eqDims(v.dims, { angle: 1 })) return v.n;   // already base radians
  if (isDimless(v.dims)) return v.n;
  throw new RErr('expected an angle');
}

function factorial(n) {
  if (n < 0 || !Number.isInteger(n)) throw new RErr('factorial needs a non-negative integer');
  let r = 1; for (let i = 2; i <= n; i++) r *= i; return r;
}
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }

export const FUNCTIONS = {
  sqrt: (a) => ({ n: Math.sqrt(a[0].n), dims: powDims(a[0].dims, 0.5), display: null, kind: 'number' }),
  cbrt: (a) => ({ n: Math.cbrt(a[0].n), dims: powDims(a[0].dims, 1 / 3), display: null, kind: 'number' }),
  abs: (a) => keepUnit(a[0], Math.abs),
  round: (a) => a.length > 1 ? roundTo(a[0], dimless(a[1], 'round')) : keepUnit(a[0], Math.round),
  roundto: (a) => roundTo(a[0], dimless(a[1], 'roundto')),
  floor: (a) => keepUnit(a[0], Math.floor),
  ceil: (a) => keepUnit(a[0], Math.ceil),
  trunc: (a) => keepUnit(a[0], Math.trunc),
  sign: (a) => num(Math.sign(a[0].n)),
  int: (a) => keepUnit(a[0], Math.trunc),

  min: (a) => reduceSame(a, 'min', (x, y) => Math.min(x, y)),
  max: (a) => reduceSame(a, 'max', (x, y) => Math.max(x, y)),
  sum: (a) => a.reduce((acc, v) => add(acc, v)),
  total: (a) => a.reduce((acc, v) => add(acc, v)),
  avg: (a) => div(a.reduce((acc, v) => add(acc, v)), num(a.length)),
  average: (a) => div(a.reduce((acc, v) => add(acc, v)), num(a.length)),
  mean: (a) => div(a.reduce((acc, v) => add(acc, v)), num(a.length)),
  count: (a) => num(a.length),

  sin: (a) => num(Math.sin(angleRadians(a[0]))),
  cos: (a) => num(Math.cos(angleRadians(a[0]))),
  tan: (a) => num(Math.tan(angleRadians(a[0]))),
  asin: (a) => ({ n: Math.asin(dimless(a[0], 'asin')), dims: { angle: 1 }, display: null, kind: 'number' }),
  acos: (a) => ({ n: Math.acos(dimless(a[0], 'acos')), dims: { angle: 1 }, display: null, kind: 'number' }),
  atan: (a) => ({ n: Math.atan(dimless(a[0], 'atan')), dims: { angle: 1 }, display: null, kind: 'number' }),
  atan2: (a) => ({ n: Math.atan2(a[0].n, a[1].n), dims: { angle: 1 }, display: null, kind: 'number' }),

  ln: (a) => num(Math.log(dimless(a[0], 'ln'))),
  log: (a) => a.length > 1 ? num(Math.log(dimless(a[0], 'log')) / Math.log(dimless(a[1], 'log'))) : num(Math.log10(dimless(a[0], 'log'))),
  log10: (a) => num(Math.log10(dimless(a[0], 'log10'))),
  log2: (a) => num(Math.log2(dimless(a[0], 'log2'))),
  exp: (a) => num(Math.exp(dimless(a[0], 'exp'))),
  pow: (a) => num(Math.pow(dimless(a[0], 'pow'), dimless(a[1], 'pow'))),

  fact: (a) => num(factorial(dimless(a[0], 'fact'))),
  factorial: (a) => num(factorial(dimless(a[0], 'factorial'))),
  gcd: (a) => num(gcd(dimless(a[0], 'gcd'), dimless(a[1], 'gcd'))),
  lcm: (a) => { const x = dimless(a[0], 'lcm'), y = dimless(a[1], 'lcm'); return num(Math.abs(x * y) / gcd(x, y)); },
  clamp: (a) => ({ ...a[0], n: Math.min(Math.max(a[0].n, a[1].n), a[2].n) }),
  hypot: (a) => ({ n: Math.hypot(...a.map(v => v.n)), dims: a[0].dims, display: a[0].display, kind: 'number' }),
};

function roundTo(v, places) {
  const f = Math.pow(10, places);
  return { ...v, n: Math.round(v.n * f) / f, kind: v.kind === 'date' ? 'number' : v.kind };
}

function reduceSame(a, name, f) {
  const first = a[0];
  for (const v of a) if (!eqDims(v.dims, first.dims)) throw new RErr(`${name}() needs matching units`);
  return { ...first, n: a.reduce((acc, v) => f(acc, v.n), a[0].n) };
}

export function isFunction(name) { return Object.prototype.hasOwnProperty.call(FUNCTIONS, name); }
