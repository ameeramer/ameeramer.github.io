// Evaluator: AST → Value, against an environment of variables, the previous
// line's answer, and the running list of prior results (for "sum above").

import {
  num, percent, dateVal, withUnit, add, sub, mul, div, pow, neg,
  applyPercentOf, addPercent, subPercent, convertTo, RErr,
} from './value.js';
import { lookupUnit, isDimless } from './units.js';
import { FUNCTIONS, isFunction } from './functions.js';

const CONSTVALS = {
  pi: Math.PI, tau: Math.PI * 2, e: Math.E, phi: (1 + Math.sqrt(5)) / 2,
  half: 0.5, quarter: 0.25, third: 1 / 3, dozen: 12, score: 20,
};
const DAY = 86400;

export function evaluate(node, env) {
  if (node == null) return null;
  switch (node.t) {
    case 'num': return num(node.v);

    case 'const': return num(CONSTVALS[node.name]);

    case 'pctify': {
      const v = evaluate(node.e, env);
      if (v.kind === 'percent') return v;
      if (!isDimless(v.dims) || v.kind === 'date') throw new RErr('percent needs a plain number');
      return percent(v.n);
    }

    case 'unit': {
      const v = evaluate(node.expr, env);
      const unit = lookupUnit(node.unit);
      if (!unit) throw new RErr(`unknown unit "${node.unit}"`);
      if (v.kind !== 'number' || !isDimless(v.dims)) {
        // allow applying currency to a dimensionless value only
        throw new RErr(`can't apply ${unit.sym} here`);
      }
      return withUnit(v.n, unit);
    }

    case 'neg': return neg(evaluate(node.e, env));

    case 'bin': {
      const a = evaluate(node.a, env);
      const b = evaluate(node.b, env);
      switch (node.op) {
        case '+': return b.kind === 'percent' && a.kind !== 'percent' ? addPercent(a, b) : add(a, b);
        case '-': return b.kind === 'percent' && a.kind !== 'percent' ? subPercent(a, b) : sub(a, b);
        case '*': return mul(a, b);
        case '/': return div(a, b);
        case '^': return pow(a, b);
        case 'mod': {
          if (b.n === 0) throw new RErr('mod by zero');
          return { ...a, n: ((a.n % b.n) + b.n) % b.n };
        }
      }
      throw new RErr(`bad operator ${node.op}`);
    }

    case 'of': {
      const a = evaluate(node.a, env);
      const b = evaluate(node.b, env);
      if (a.kind === 'percent') return applyPercentOf(b, a);   // "20% of 50"
      return mul(a, b);                                        // "half of 200" (a=0.5)
    }

    case 'onoff': {
      const pct = evaluate(node.pct, env);
      const base = evaluate(node.base, env);
      if (pct.kind === 'percent') {
        return node.op === 'off' ? subPercent(base, pct) : addPercent(base, pct);
      }
      return node.op === 'off' ? sub(base, pct) : add(base, pct); // absolute "$5 off $50"
    }

    case 'convert': {
      const v = evaluate(node.expr, env);
      return convertTo(v, node.unit);
    }

    case 'var': {
      const key = node.name.toLowerCase();
      if (env.vars.has(key)) return env.vars.get(key);
      // a bare unit word inside an expression ("$140 per week") means 1 of it,
      // so rates work; a user variable of the same name always wins above.
      const unit = lookupUnit(node.name);
      if (unit) return withUnit(1, unit);
      throw new RErr(`unknown value "${node.name}"`);
    }

    case 'prev': {
      if (env.prev == null) throw new RErr('nothing above to reference');
      return env.prev;
    }

    case 'date': return dateNode(node.name, env);

    case 'agg': return aggregate(node.fn, env);

    case 'call': {
      if (!isFunction(node.name)) throw new RErr(`unknown function "${node.name}"`);
      const args = node.args.map(a => evaluate(a, env));
      if (args.length === 0) throw new RErr(`${node.name}() needs arguments`);
      return FUNCTIONS[node.name](args);
    }
  }
  throw new RErr('cannot evaluate');
}

function dateNode(name, env) {
  const nowSec = env.now != null ? env.now : Math.floor(Date.now() / 1000);
  const startOfDay = Math.floor(nowSec / DAY) * DAY;
  switch (name) {
    case 'now': return { ...dateVal(nowSec), time: true };
    case 'today': return dateVal(startOfDay);
    case 'tomorrow': return dateVal(startOfDay + DAY);
    case 'yesterday': return dateVal(startOfDay - DAY);
  }
  throw new RErr(`unknown date "${name}"`);
}

function aggregate(fn, env) {
  // Scope to the current section: the results since the most recent blank line.
  // Comments/headings don't break a section; a blank line does. This makes
  // "sum above" total the visible block rather than the whole document.
  const arr = env.results;
  const blank = env.blank || [];
  let start = 0;
  for (let i = arr.length - 1; i >= 0; i--) { if (blank[i]) { start = i + 1; break; } }
  const vals = arr.slice(start).filter(Boolean);
  if (vals.length === 0) throw new RErr('nothing above to aggregate');
  switch (fn) {
    case 'sum': case 'total': return vals.reduce((a, v) => add(a, v));
    case 'average': case 'avg': case 'mean':
      return div(vals.reduce((a, v) => add(a, v)), num(vals.length));
    case 'count': return num(vals.length);
    case 'min': case 'minimum': return vals.reduce((a, v) => (v.n < a.n ? v : a));
    case 'max': case 'maximum': return vals.reduce((a, v) => (v.n > a.n ? v : a));
  }
  throw new RErr(`unknown aggregate "${fn}"`);
}
