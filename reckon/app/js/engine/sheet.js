// Sheet engine: evaluates a whole document top-to-bottom. Variables assigned
// on one line are visible to every line below; "prev" and "sum above" read the
// running result stream. This is the reactive layer — a single edit re-runs
// the document, and because state only flows downward the recompute is linear.

import { parseLine } from './parse.js';
import { evaluate } from './evaluate.js';
import { formatValue } from './format.js';
import { RErr } from './value.js';

// Evaluate one document. `lines` is an array of raw strings.
// Returns an array (one per line) of { kind, text, value, error }.
//   kind: 'result' | 'assign' | 'blank' | 'comment' | 'error'
export function evaluateSheet(lines, opts = {}) {
  // `results`/`blank` are parallel arrays, one entry per input line, feeding the
  // "sum above" aggregates. `blank[i]` marks a blank line, which ends a section.
  const env = { vars: new Map(), prev: null, results: [], blank: [], now: opts.now };
  const push = (v, isBlank = false) => { env.results.push(v); env.blank.push(isBlank); };
  const out = [];

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const trimmed = line.trim();

    if (trimmed === '') { out.push({ kind: 'blank', text: '', value: null, error: null }); push(null, true); continue; }

    // comment / heading line: starts with # or // (and isn't a bare number)
    if (/^(#|\/\/)/.test(trimmed)) { out.push({ kind: 'comment', text: '', value: null, error: null }); push(null); continue; }

    let ast;
    try {
      ast = parseLine(line);
    } catch (e) {
      out.push({ kind: 'error', text: msg(e), value: null, error: msg(e) });
      push(null);
      continue;
    }

    if (ast == null) { out.push({ kind: 'comment', text: '', value: null, error: null }); push(null); continue; }

    if (ast.t === 'assign') {
      try {
        const v = evaluate(ast.expr, env);
        env.vars.set(ast.name.toLowerCase(), v);
        env.prev = v;
        push(v);
        out.push({ kind: 'assign', text: formatValue(v), value: v, error: null, name: ast.name });
      } catch (e) {
        out.push({ kind: 'error', text: msg(e), value: null, error: msg(e) });
        push(null);
      }
      continue;
    }

    // a lone label like "Budget:" parses as a bare variable reference to an
    // undefined name — show it as a heading rather than an error.
    if (ast.t === 'var' && !env.vars.has(ast.name.toLowerCase())) {
      out.push({ kind: 'comment', text: '', value: null, error: null });
      push(null);
      continue;
    }

    try {
      const v = evaluate(ast, env);
      env.prev = v;
      push(v);
      out.push({ kind: 'result', text: formatValue(v), value: v, error: null });
    } catch (e) {
      out.push({ kind: 'error', text: msg(e), value: null, error: msg(e) });
      push(null);
    }
  }
  return out;
}

// Evaluate a single expression string (for the landing-page demo / tests).
export function evalOne(str, opts = {}) {
  const r = evaluateSheet([str], opts);
  return r[0];
}

function msg(e) {
  if (e instanceof RErr) return e.message;
  return (e && e.message) ? e.message : 'error';
}
