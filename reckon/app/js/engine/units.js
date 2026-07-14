// Dimensional unit system. Every quantity carries a dimension signature
// (a map of base-dimension → integer exponent). Real dimensional analysis:
// you can multiply metres by metres to get area, divide distance by time to
// get speed, and adding incompatible dimensions is an error — exactly like
// a physics engine, done from scratch.

// Base dimensions. Values are stored internally in these base units.
//   length → metre, mass → kilogram, time → second, temperature → kelvin,
//   currency → USD, data → byte, angle → radian, luminosity → candela-ish (unused base kept simple)
export const BASE = ['length', 'mass', 'time', 'temp', 'currency', 'data', 'angle'];

// A dimension signature is a plain object of { dim: exponent } with the
// zero-exponents omitted. {} means dimensionless.
export function mulDims(a, b) {
  const out = { ...a };
  for (const k in b) { out[k] = (out[k] || 0) + b[k]; if (out[k] === 0) delete out[k]; }
  return out;
}
export function divDims(a, b) {
  const out = { ...a };
  for (const k in b) { out[k] = (out[k] || 0) - b[k]; if (out[k] === 0) delete out[k]; }
  return out;
}
export function powDims(a, p) {
  const out = {};
  for (const k in a) { out[k] = a[k] * p; if (out[k] === 0) delete out[k]; }
  return out;
}
export function eqDims(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if ((a[k] || 0) !== (b[k] || 0)) return false;
  return true;
}
export function isDimless(a) { return Object.keys(a).length === 0; }

const D = (dim, exp = 1) => ({ [dim]: exp });

// A unit: { dims, factor, offset?, sym }. `factor` converts 1 <unit> → base
// units. `offset` (temperature) is applied after scaling: base = value*factor + offset.
function u(dims, factor, sym, offset = 0) { return { dims, factor, sym, offset }; }

// The registry. Keys are canonical lowercase names; aliases added below.
const R = new Map();
function def(names, unit) {
  for (const n of names) R.set(n.toLowerCase(), unit);
}

// ── Length (base: metre) ──
def(['m', 'meter', 'metre', 'meters', 'metres'], u(D('length'), 1, 'm'));
def(['km', 'kilometer', 'kilometre', 'kilometers', 'kilometres'], u(D('length'), 1000, 'km'));
def(['cm', 'centimeter', 'centimetre', 'centimeters'], u(D('length'), 0.01, 'cm'));
def(['mm', 'millimeter', 'millimetre', 'millimeters'], u(D('length'), 0.001, 'mm'));
def(['µm', 'um', 'micron', 'microns', 'micrometer'], u(D('length'), 1e-6, 'µm'));
def(['nm', 'nanometer', 'nanometre'], u(D('length'), 1e-9, 'nm'));
def(['in', 'inch', 'inches', '"'], u(D('length'), 0.0254, 'in'));
def(['ft', 'foot', 'feet', "'"], u(D('length'), 0.3048, 'ft'));
def(['yd', 'yard', 'yards'], u(D('length'), 0.9144, 'yd'));
def(['mi', 'mile', 'miles'], u(D('length'), 1609.344, 'mi'));
def(['nmi', 'nauticalmile'], u(D('length'), 1852, 'nmi'));

// ── Mass (base: kilogram) ──
def(['kg', 'kilogram', 'kilograms', 'kilo', 'kilos'], u(D('mass'), 1, 'kg'));
def(['g', 'gram', 'grams', 'gramme'], u(D('mass'), 0.001, 'g'));
def(['mg', 'milligram', 'milligrams'], u(D('mass'), 1e-6, 'mg'));
def(['t', 'tonne', 'tonnes', 'metricton'], u(D('mass'), 1000, 't'));
def(['lb', 'lbs', 'pound', 'pounds'], u(D('mass'), 0.45359237, 'lb'));
def(['oz', 'ounce', 'ounces'], u(D('mass'), 0.0283495231, 'oz'));
def(['st', 'stone', 'stones'], u(D('mass'), 6.35029318, 'st'));

// ── Time (base: second) ──
def(['s', 'sec', 'secs', 'second', 'seconds'], u(D('time'), 1, 's'));
def(['ms', 'millisecond', 'milliseconds'], u(D('time'), 0.001, 'ms'));
def(['ns', 'nanosecond', 'nanoseconds'], u(D('time'), 1e-9, 'ns'));
def(['min', 'mins', 'minute', 'minutes'], u(D('time'), 60, 'min'));
def(['h', 'hr', 'hrs', 'hour', 'hours'], u(D('time'), 3600, 'h'));
def(['day', 'days', 'd'], u(D('time'), 86400, 'day'));
def(['week', 'weeks', 'wk'], u(D('time'), 604800, 'week'));
def(['month', 'months', 'mo'], u(D('time'), 2629800, 'month'));   // avg Gregorian month
def(['year', 'years', 'yr', 'yrs'], u(D('time'), 31557600, 'year')); // Julian year

// ── Temperature (base: kelvin, with offsets) ──
def(['k', 'kelvin'], u(D('temp'), 1, 'K', 0));
def(['°c', 'c', 'celsius', 'centigrade'], u(D('temp'), 1, '°C', 273.15));
def(['°f', 'f', 'fahrenheit'], u(D('temp'), 5 / 9, '°F', 459.67 * 5 / 9));

// ── Data (base: byte) ──
def(['b', 'byte', 'bytes'], u(D('data'), 1, 'B'));
def(['bit', 'bits'], u(D('data'), 0.125, 'bit'));
def(['kb', 'kilobyte', 'kilobytes'], u(D('data'), 1e3, 'KB'));
def(['mb', 'megabyte', 'megabytes'], u(D('data'), 1e6, 'MB'));
def(['gb', 'gigabyte', 'gigabytes'], u(D('data'), 1e9, 'GB'));
def(['tb', 'terabyte', 'terabytes'], u(D('data'), 1e12, 'TB'));
def(['pb', 'petabyte'], u(D('data'), 1e15, 'PB'));
def(['kib', 'kibibyte'], u(D('data'), 1024, 'KiB'));
def(['mib', 'mebibyte'], u(D('data'), 1024 ** 2, 'MiB'));
def(['gib', 'gibibyte'], u(D('data'), 1024 ** 3, 'GiB'));
def(['tib', 'tebibyte'], u(D('data'), 1024 ** 4, 'TiB'));

// ── Angle (base: radian) ──
def(['rad', 'radian', 'radians'], u(D('angle'), 1, 'rad'));
def(['deg', '°', 'degree', 'degrees'], u(D('angle'), Math.PI / 180, '°'));
def(['turn', 'turns', 'rev'], u(D('angle'), 2 * Math.PI, 'turn'));
def(['grad', 'gradian'], u(D('angle'), Math.PI / 200, 'grad'));

// ── Speed (derived: length/time, base metre-per-second) ──
const VEL = { length: 1, time: -1 };
def(['mps', 'm/s'], u({ ...VEL }, 1, 'm/s'));
def(['kph', 'kmh', 'km/h', 'kmph'], u({ ...VEL }, 1000 / 3600, 'km/h'));
def(['mph'], u({ ...VEL }, 1609.344 / 3600, 'mph'));
def(['fps', 'ft/s'], u({ ...VEL }, 0.3048, 'ft/s'));
def(['knot', 'knots', 'kn', 'kt'], u({ ...VEL }, 1852 / 3600, 'kn'));

// ── Currency (base: USD). factor is USD-per-unit, patched live at runtime. ──
export const CURRENCIES = {
  USD: { sym: '$', factor: 1 },
  EUR: { sym: '€', factor: 1.08 },
  GBP: { sym: '£', factor: 1.27 },
  JPY: { sym: '¥', factor: 0.0067 },
  CNY: { sym: '¥', factor: 0.138 },
  CAD: { sym: 'C$', factor: 0.73 },
  AUD: { sym: 'A$', factor: 0.66 },
  CHF: { sym: 'Fr', factor: 1.12 },
  INR: { sym: '₹', factor: 0.012 },
  BRL: { sym: 'R$', factor: 0.19 },
  ILS: { sym: '₪', factor: 0.27 },
  KRW: { sym: '₩', factor: 0.00073 },
  MXN: { sym: '$', factor: 0.058 },
  SEK: { sym: 'kr', factor: 0.096 },
  NOK: { sym: 'kr', factor: 0.093 },
  PLN: { sym: 'zł', factor: 0.25 },
  RUB: { sym: '₽', factor: 0.011 },
  SGD: { sym: 'S$', factor: 0.74 },
  ZAR: { sym: 'R', factor: 0.055 },
  BTC: { sym: '₿', factor: 62000 },
  ETH: { sym: 'Ξ', factor: 3000 },
};

// Register each currency as a unit (currency dimension). isCurrency flags it
// so the formatter uses a currency symbol + code rather than a unit suffix.
function registerCurrencies() {
  for (const [code, meta] of Object.entries(CURRENCIES)) {
    const unit = u(D('currency'), meta.factor, code);
    unit.currency = code;
    R.set(code.toLowerCase(), unit);
  }
  // Symbol aliases (first currency that claims a symbol wins).
  const symAlias = { '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR', '₪': 'ILS', '₩': 'KRW', '₽': 'RUB', '₿': 'BTC', 'Ξ': 'ETH' };
  for (const [sym, code] of Object.entries(symAlias)) R.set(sym, R.get(code.toLowerCase()));
}
registerCurrencies();

// Patch currency factors with live FX (Pro). rates: { CODE: usdPerUnit }.
export function setCurrencyRates(rates) {
  for (const [code, usdPer] of Object.entries(rates)) {
    const unit = R.get(code.toLowerCase());
    if (unit && Number.isFinite(usdPer) && usdPer > 0) {
      unit.factor = usdPer;
      if (CURRENCIES[code]) CURRENCIES[code].factor = usdPer;
    }
  }
}

// Look up a unit by name. Handles case, trailing 's' plural fallback, and the
// symbol table. Returns the unit object or null.
export function lookupUnit(name) {
  if (!name) return null;
  const key = name.toLowerCase();
  if (R.has(key)) return R.get(key);
  if (R.has(name)) return R.get(name);            // symbols are case-sensitive
  if (key.endsWith('s') && R.has(key.slice(0, -1))) return R.get(key.slice(0, -1));
  return null;
}

export function isUnitName(name) { return lookupUnit(name) != null; }
