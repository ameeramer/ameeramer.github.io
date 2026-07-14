// Parser: token stream → AST. Precedence (low → high):
//   convert (in/to/as) < add/subtract < percent off/on < of < mul/div < unary
//   < power < postfix (unit application, %, magnitude words) < primary
// Natural-language operators (plus, minus, times, divided by, per, of, off,
// on, mod) are recognised as words.

import { tokenize, TOK } from './tokenize.js';
import { lookupUnit, isUnitName } from './units.js';
import { RErr } from './value.js';

const kw = (t, ...words) => t && t.type === TOK.WORD && words.includes(t.value.toLowerCase());

const MAG = { thousand: 1e3, thousands: 1e3, million: 1e6, millions: 1e6, billion: 1e9, billions: 1e9, trillion: 1e12, trillions: 1e12, k: 1e3, grand: 1e3, dozen: 12, dozens: 12, score: 20 };
const DATEWORDS = new Set(['today', 'now', 'tomorrow', 'yesterday']);
const CONSTS = new Set(['pi', 'tau', 'e', 'phi', 'half', 'quarter', 'third', 'dozen', 'score']);
const PREV = new Set(['prev', 'previous', 'last', 'ans', 'answer', 'it']);
const AGG = new Set(['sum', 'total', 'average', 'avg', 'mean', 'count', 'min', 'minimum', 'max', 'maximum']);

export function parseLine(src) {
  const toks = tokenize(src);
  const p = new Parser(toks);
  return p.parseTop();
}

class Parser {
  constructor(toks) { this.toks = toks; this.i = 0; }
  peek(o = 0) { return this.toks[this.i + o]; }
  next() { return this.toks[this.i++]; }
  at(type) { return this.peek().type === type; }
  eof() { return this.at(TOK.EOF); }

  parseTop() {
    if (this.eof()) return null;
    // assignment:  name = expr   (name is a plain identifier, not a keyword/unit)
    if (this.at(TOK.WORD)) {
      // allow multi-word names up to '=' (e.g., "unit price = 3")
      let j = this.i, nameParts = [];
      while (this.toks[j] && this.toks[j].type === TOK.WORD) { nameParts.push(this.toks[j].value); j++; }
      if (this.toks[j] && this.toks[j].type === TOK.EQ) {
        const name = nameParts.join(' ');
        this.i = j + 1;
        const expr = this.parseConvert();
        this.expectEnd();
        return { t: 'assign', name, expr };
      }
    }
    const expr = this.parseConvert();
    this.expectEnd();
    return expr;
  }

  expectEnd() {
    if (!this.eof()) throw new RErr(`unexpected "${this.peek().text || this.peek().value}"`);
  }

  // convert:  add (in|to|as) unit
  parseConvert() {
    let left = this.parseAdd();
    while (kw(this.peek(), 'in', 'to', 'as')) {
      const nxt = this.peek(1);
      // "5 km in miles" → convert; but a bare "in" not followed by a unit is
      // an inch unit already handled in postfix, so require a unit target here.
      if (!nxt || nxt.type !== TOK.WORD || !isUnitName(nxt.value)) break;
      this.next();
      const unit = this.next().value;
      left = { t: 'convert', expr: left, unit };
    }
    return left;
  }

  parseAdd() {
    let left = this.parsePctOnOff();
    for (;;) {
      const t = this.peek();
      if (t.type === TOK.OP && (t.value === '+' || t.value === '-')) {
        this.next(); const right = this.parsePctOnOff();
        left = { t: 'bin', op: t.value, a: left, b: right };
      } else if (kw(t, 'plus', 'minus')) {
        this.next(); const right = this.parsePctOnOff();
        left = { t: 'bin', op: t.value.toLowerCase() === 'plus' ? '+' : '-', a: left, b: right };
      } else break;
    }
    return left;
  }

  // "20% off £50", "10% on 200". Right-associative so a stacked
  // "20% off 20% off 100" reads as "20% off (20% off 100)" = 64, not nonsense.
  parsePctOnOff() {
    const left = this.parseOf();
    if (kw(this.peek(), 'off', 'on')) {
      const op = this.next().value.toLowerCase();
      const base = this.parsePctOnOff();
      return { t: 'onoff', op, pct: left, base };
    }
    return left;
  }

  parseOf() {
    let left = this.parseMul();
    while (kw(this.peek(), 'of')) {
      this.next();
      const right = this.parseMul();
      left = { t: 'of', a: left, b: right };
    }
    return left;
  }

  parseMul() {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t.type === TOK.OP && (t.value === '*' || t.value === '/')) {
        this.next(); left = { t: 'bin', op: t.value, a: left, b: this.parseUnary() };
      } else if (kw(t, 'times')) {
        this.next(); left = { t: 'bin', op: '*', a: left, b: this.parseUnary() };
      } else if (kw(t, 'per')) {
        this.next(); left = { t: 'bin', op: '/', a: left, b: this.parseUnary() };
      } else if (kw(t, 'mod', 'modulo')) {
        this.next(); left = { t: 'bin', op: 'mod', a: left, b: this.parseUnary() };
      } else if (kw(t, 'divided', 'multiplied', 'div')) {
        const word = this.next().value.toLowerCase();
        if (kw(this.peek(), 'by')) this.next();
        left = { t: 'bin', op: word === 'divided' || word === 'div' ? '/' : '*', a: left, b: this.parseUnary() };
      } else break;
    }
    return left;
  }

  parseUnary() {
    const t = this.peek();
    if (t.type === TOK.OP && (t.value === '-' || t.value === '+')) {
      this.next();
      const e = this.parseUnary();
      return t.value === '-' ? { t: 'neg', e } : e;
    }
    return this.parsePow();
  }

  parsePow() {
    const left = this.parsePostfix();
    const t = this.peek();
    if (t.type === TOK.OP && t.value === '^') {
      this.next();
      const right = this.parseUnary();   // right-assoc, allows -2 exponent
      return { t: 'bin', op: '^', a: left, b: right };
    }
    return left;
  }

  parsePostfix() {
    let left = this.parsePrimary();
    for (;;) {
      const t = this.peek();
      if (t.type === TOK.PCT) { this.next(); left = { t: 'pctify', e: left }; continue; }
      if (t.type === TOK.BANG) { this.next(); left = { t: 'call', name: 'fact', args: [left] }; continue; }
      // magnitude words: "3 million"
      if (t.type === TOK.WORD && MAG[t.value.toLowerCase()] != null && !isUnitName(t.value)) {
        this.next(); left = { t: 'bin', op: '*', a: left, b: { t: 'num', v: MAG[t.value.toLowerCase()] } }; continue;
      }
      // unit application: "50 km", "3 h"
      if (t.type === TOK.WORD && isUnitName(t.value)) {
        // don't swallow "in/to/as" that introduce a conversion of a *unit* value
        if (kw(t, 'in', 'to', 'as')) {
          const nxt = this.peek(1);
          if (nxt && nxt.type === TOK.WORD && isUnitName(nxt.value)) break; // leave for convert
        }
        this.next();
        left = { t: 'unit', expr: left, unit: t.value };
        // compound units of same dimension: "5 ft 3 in", "1 h 30 min"
        const a = this.peek(), b = this.peek(1);
        if (a && a.type === TOK.NUM && b && b.type === TOK.WORD && isUnitName(b.value)
          && sameDim(t.value, b.value)) {
          this.next(); this.next();
          left = { t: 'bin', op: '+', a: left, b: { t: 'unit', expr: { t: 'num', v: a.value }, unit: b.value } };
        }
        continue;
      }
      // inch/foot marks: 5' 6"
      if (t.type === TOK.WORD && (t.value === "'" || t.value === '"')) {
        this.next();
        left = { t: 'unit', expr: left, unit: t.value };
        continue;
      }
      break;
    }
    return left;
  }

  parsePrimary() {
    const t = this.peek();

    if (t.type === TOK.NUM) { this.next(); return { t: 'num', v: t.value }; }

    if (t.type === TOK.SYM) {           // currency symbol: $50, £(3+2)
      this.next();
      const code = symToCode(t.value);
      const e = this.parsePostfix();    // allow $ (expr)
      return { t: 'unit', expr: e, unit: code };
    }

    if (t.type === TOK.LP) {
      this.next();
      const e = this.parseConvert();
      if (!this.at(TOK.RP)) throw new RErr('missing )');
      this.next();
      return e;
    }

    if (t.type === TOK.WORD) {
      const w = t.value; const lw = w.toLowerCase();
      // function call
      if (this.peek(1) && this.peek(1).type === TOK.LP) {
        this.next(); this.next();
        const args = [];
        if (!this.at(TOK.RP)) {
          args.push(this.parseConvert());
          while (this.at(TOK.COMMA)) { this.next(); args.push(this.parseConvert()); }
        }
        if (!this.at(TOK.RP)) throw new RErr(`missing ) in ${w}(...)`);
        this.next();
        return { t: 'call', name: lw, args };
      }
      if (DATEWORDS.has(lw)) { this.next(); return { t: 'date', name: lw }; }
      if (CONSTS.has(lw)) { this.next(); return { t: 'const', name: lw }; }
      if (PREV.has(lw)) { this.next(); return { t: 'prev' }; }
      if (AGG.has(lw)) {
        this.next();
        if (kw(this.peek(), 'above')) this.next();
        return { t: 'agg', fn: lw, scope: 'above' };
      }
      // otherwise a variable reference (may be multi-word: "unit price")
      this.next();
      let name = w;
      while (this.at(TOK.WORD) && !isUnitName(this.peek().value) && !isBreakWord(this.peek())) {
        name += ' ' + this.next().value;
      }
      return { t: 'var', name };
    }

    throw new RErr(t.type === TOK.EOF ? 'incomplete expression' : `unexpected "${t.text || t.value}"`);
  }
}

function isBreakWord(t) {
  return kw(t, 'of', 'off', 'on', 'in', 'to', 'as', 'plus', 'minus', 'times', 'per',
    'divided', 'multiplied', 'mod', 'by', 'above') || MAG[t.value?.toLowerCase()] != null;
}

function sameDim(ua, ub) {
  const a = lookupUnit(ua), b = lookupUnit(ub);
  if (!a || !b) return false;
  const ka = Object.keys(a.dims), kb = Object.keys(b.dims);
  return ka.length === kb.length && ka.every(k => a.dims[k] === b.dims[k]);
}

function symToCode(sym) {
  const m = { '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR', '₪': 'ILS', '₩': 'KRW', '₽': 'RUB', '₿': 'BTC', 'Ξ': 'ETH' };
  return m[sym] || 'USD';
}
