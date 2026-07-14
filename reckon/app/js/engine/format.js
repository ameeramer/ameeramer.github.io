// Formatter: Value → human string. Handles unit display, currency, percent,
// dates and durations, and cleans up binary-floating-point noise.

import { isDimless, eqDims } from './units.js';
import { CURRENCIES } from './units.js';

// Round to 10 significant figures (kills 0.1+0.2 noise), snap tiny residue to
// zero, cap at 8 decimals, strip trailing zeros.
function cleanNumber(x, maxFrac = 8) {
  if (!Number.isFinite(x)) return x > 0 ? '∞' : (x < 0 ? '-∞' : 'NaN');
  if (x === 0) return '0';
  const rounded = Number(x.toPrecision(10));
  if (Math.abs(rounded) < 1e-10) return '0';          // FP residue → 0
  const abs = Math.abs(rounded);
  if (abs >= 1e15 || abs < 1e-8) {                    // extreme scale → exponential
    return rounded.toExponential(6).replace(/\.?0+e/, 'e').replace('e+', 'e');
  }
  let s = rounded.toFixed(Math.min(maxFrac, 12));
  s = s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return s;
}

function withThousands(s) {
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  const [int, frac] = s.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + grouped + (frac ? '.' + frac : '');
}

function formatCurrency(baseUsd, code) {
  const meta = CURRENCIES[code];
  const amount = baseUsd / (meta ? meta.factor : 1);
  const sym = meta ? meta.sym : '';
  const crypto = code === 'BTC' || code === 'ETH';
  const neg = amount < 0;                             // sign goes before the symbol: -$50.00
  const abs = Math.abs(amount);
  let s;
  if (crypto) {
    s = withThousands(abs.toFixed(6).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''));
  } else {
    s = abs < 1e12 ? withThousands(abs.toFixed(2)) : withThousands(cleanNumber(abs));
  }
  const showCode = code !== 'USD';
  return `${neg ? '-' : ''}${sym}${s}${showCode ? ' ' + code : ''}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatDate(epochSec, withTime) {
  // Locale-independent + consistent (UTC-based on the stored epoch).
  const d = new Date(epochSec * 1000);
  const date = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  if (withTime) {
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${date}, ${hh}:${mm}`;
  }
  return date;
}

// Humanise a bare duration (time dimension, no display unit) into a compact
// "1d 2h 30m" form.
function humanizeDuration(seconds) {
  const neg = seconds < 0; seconds = Math.abs(seconds);
  const units = [['y', 31557600], ['mo', 2629800], ['d', 86400], ['h', 3600], ['min', 60], ['s', 1]];
  const parts = [];
  let rem = seconds;
  for (const [sym, sec] of units) {
    if (rem >= sec && parts.length < 2) {
      const q = Math.floor(rem / sec);
      if (q > 0) { parts.push(`${q}${sym}`); rem -= q * sec; }
    }
  }
  if (!parts.length) return cleanNumber(seconds) + ' s';
  // append a fractional remainder to the smallest shown unit if meaningful
  return (neg ? '-' : '') + parts.join(' ');
}

export function formatValue(v) {
  if (v == null) return '';
  if (v.kind === 'date') return formatDate(v.n, v.time);

  if (v.kind === 'percent') {
    return cleanNumber(v.n * 100) + '%';
  }

  // currency
  if (v.display && v.display.currency) {
    return formatCurrency(v.n, v.display.currency);
  }
  if (eqDims(v.dims, { currency: 1 }) && !v.display) {
    return formatCurrency(v.n, 'USD');
  }

  // has an explicit display unit
  if (v.display) {
    const u = v.display;
    const shown = (v.n - (u.offset || 0)) / u.factor;
    return `${withThousands(cleanNumber(shown))} ${u.sym}`;
  }

  // plain dimensionless number
  if (isDimless(v.dims)) {
    return withThousands(cleanNumber(v.n));
  }

  // dimensioned but no display unit
  if (eqDims(v.dims, { time: 1 })) return humanizeDuration(v.n);

  // fallback: base unit name
  const base = baseSymbol(v.dims);
  return `${withThousands(cleanNumber(v.n))}${base ? ' ' + base : ''}`;
}

function baseSymbol(dims) {
  const BASESYM = { length: 'm', mass: 'kg', time: 's', temp: 'K', currency: '$', data: 'B', angle: 'rad' };
  const parts = [];
  for (const [d, e] of Object.entries(dims)) {
    parts.push(BASESYM[d] + (e !== 1 ? `^${e}` : ''));
  }
  return parts.join('·');
}
