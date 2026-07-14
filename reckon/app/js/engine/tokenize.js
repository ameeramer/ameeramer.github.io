// Lexer. Turns a line of "20% off £1,499.99 in USD" into a token stream.
// Numbers accept thousands separators (1,000 / 1_000), decimals, scientific
// notation, and k/m/b/t magnitude suffixes. Words (keywords, variables,
// units, functions) are emitted as WORD and disambiguated by the parser.

export const TOK = {
  NUM: 'NUM', WORD: 'WORD', OP: 'OP', LP: 'LP', RP: 'RP',
  COMMA: 'COMMA', EQ: 'EQ', PCT: 'PCT', SYM: 'SYM', BANG: 'BANG', EOF: 'EOF',
};

const CURRENCY_SYMS = '$€£¥₹₪₩₽₿Ξ';
const SUFFIX = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };

const isDigit = (c) => c >= '0' && c <= '9';
const isAlpha = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' ||
  c === 'µ' || c === '°' || c === 'Ω';

export function tokenize(src) {
  const toks = [];
  let i = 0;
  const n = src.length;

  const push = (type, value, text, pos) => toks.push({ type, value, text, pos });

  while (i < n) {
    const c = src[i];

    // whitespace
    if (c === ' ' || c === '\t') { i++; continue; }

    // comment to end of line
    if (c === '#' || (c === '/' && src[i + 1] === '/')) break;

    // currency symbol
    if (CURRENCY_SYMS.includes(c)) { push(TOK.SYM, c, c, i); i++; continue; }

    // number
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
      const start = i;
      let s = '';
      // integer part with , or _ grouping (comma only when followed by 3 digits)
      while (i < n) {
        if (isDigit(src[i])) { s += src[i]; i++; }
        else if (src[i] === '_' && isDigit(src[i + 1])) { i++; }
        else if (src[i] === ',' && isDigit(src[i + 1]) && isDigit(src[i + 2]) && isDigit(src[i + 3])
          && !isDigit(src[i + 4])) { s += src[i + 1] + src[i + 2] + src[i + 3]; i += 4; }
        else break;
      }
      // fractional part
      if (src[i] === '.' && isDigit(src[i + 1])) {
        s += '.'; i++;
        while (isDigit(src[i])) { s += src[i]; i++; }
      }
      // scientific notation
      if ((src[i] === 'e' || src[i] === 'E') &&
        (isDigit(src[i + 1]) || ((src[i + 1] === '+' || src[i + 1] === '-') && isDigit(src[i + 2])))) {
        s += 'e'; i++;
        if (src[i] === '+' || src[i] === '-') { s += src[i]; i++; }
        while (isDigit(src[i])) { s += src[i]; i++; }
      }
      let val = parseFloat(s);
      // magnitude suffix (1.5k) — only when not glued into a longer word
      const suf = src[i] ? src[i].toLowerCase() : '';
      if (SUFFIX[suf] && !isAlpha(src[i + 1])) { val *= SUFFIX[suf]; i++; }
      push(TOK.NUM, val, src.slice(start, i), start);
      continue;
    }

    // percent
    if (c === '%') { push(TOK.PCT, '%', '%', i); i++; continue; }

    // factorial
    if (c === '!') { push(TOK.BANG, '!', '!', i); i++; continue; }

    // operators
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '^' || c === '×' || c === '÷') {
      const norm = c === '×' ? '*' : c === '÷' ? '/' : c;
      push(TOK.OP, norm, c, i); i++; continue;
    }
    if (c === '(') { push(TOK.LP, '(', '(', i); i++; continue; }
    if (c === ')') { push(TOK.RP, ')', ')', i); i++; continue; }
    if (c === ',') { push(TOK.COMMA, ',', ',', i); i++; continue; }
    if (c === '=') { push(TOK.EQ, '=', '=', i); i++; continue; }
    if (c === '"' || c === "'") { push(TOK.WORD, c, c, i); i++; continue; } // inch/foot marks

    // word (identifier / keyword / unit / function)
    if (isAlpha(c)) {
      const start = i;
      let w = '';
      while (i < n && (isAlpha(src[i]) || isDigit(src[i]))) { w += src[i]; i++; }
      push(TOK.WORD, w, w, start);
      continue;
    }

    // unknown character — skip so a stray glyph doesn't kill the whole line
    i++;
  }

  push(TOK.EOF, null, '', n);
  return toks;
}
