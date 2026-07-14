// Landing page: the hero demo and the showcase ledger are driven by the SAME
// engine the app uses — so every number on this page is genuinely computed, not
// typed by hand. Also handles the typing intro and scroll reveals.

import { evaluateSheet } from '../app/js/engine/sheet.js';

const $ = (s) => document.querySelector(s);

// ── Hero live demo ──
const SEED = `20% off $1,499
$86 + 15%
5 ft 11 in in cm
90 minutes in hours
1 GB / 8 MB
salary = $95,000
salary / 12`;

const input = $('#demo-input');
const results = $('#demo-results');

function renderDemo() {
  const lines = input.value.split('\n');
  const rows = evaluateSheet(lines);
  const frag = document.createDocumentFragment();
  for (const r of rows) {
    const d = document.createElement('div');
    d.className = 'demo-res';
    if (r.kind === 'result' || r.kind === 'assign') { d.textContent = r.text; if (r.kind === 'assign') d.classList.add('assign'); }
    else if (r.kind === 'error') { d.className = 'demo-res err'; d.textContent = r.text; }
    frag.appendChild(d);
  }
  results.replaceChildren(frag);
  // grow the textarea to fit
  input.style.height = 'auto';
  input.style.height = Math.max(300, input.scrollHeight) + 'px';
}

// Reveal the seed line-by-line on load; hand control to the user on first
// interaction. Line-based keeps it snappy and robust to timer throttling.
const SEED_LINES = SEED.split('\n');
let typing = true;
function typeIntro(n = 1) {
  if (!typing) return;
  input.value = SEED_LINES.slice(0, n).join('\n');
  renderDemo();
  if (n < SEED_LINES.length) setTimeout(() => typeIntro(n + 1), 280);
  else typing = false;
}
function takeOver() {
  if (!typing) return;
  typing = false;
  input.value = SEED;
  renderDemo();
}
input.addEventListener('input', () => { typing = false; renderDemo(); });
input.addEventListener('focus', takeOver);
input.addEventListener('pointerdown', takeOver);

// ── Showcase ledger (computed live) ──
const LEDGER = [
  '3 days in hours', '18% of $240',
  '100 km in miles', '1 mile in feet',
  '12 GBP in USD', '10 kg in lb',
  '2^10', '5!',
  'half of 200', '45 min + 1.5 h',
  '100 C in F', 'sqrt(2)',
];
function renderLedger() {
  const el = $('#ledger');
  const frag = document.createDocumentFragment();
  for (const expr of LEDGER) {
    const r = evaluateSheet([expr])[0];
    const row = document.createElement('div'); row.className = 'ledger-row';
    const a = document.createElement('span'); a.className = 'ledger-in'; a.textContent = expr;
    const b = document.createElement('span'); b.className = 'ledger-out'; b.textContent = r.error ? '—' : r.text;
    row.append(a, b); frag.appendChild(row);
  }
  el.replaceChildren(frag);
}

// ── Scroll reveals ── reveal anything within/above the viewport. A plain
// scroll check is robust to fast scrolling (unlike a fire-once observer, which
// can miss elements that whip past before its async callback runs).
function initReveal() {
  const els = [...document.querySelectorAll('.reveal')];
  const reveal = () => {
    const trigger = window.innerHeight * 0.92;
    for (const e of els) if (e.getBoundingClientRect().top < trigger) e.classList.add('in');
  };
  window.addEventListener('scroll', reveal, { passive: true });
  window.addEventListener('resize', reveal);
  reveal();
}

// ── boot ──
renderLedger();
initReveal();
typeIntro();
