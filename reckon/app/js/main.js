// Reckon editor. Live-evaluates the notepad top-to-bottom on every keystroke,
// renders a per-line results gutter that stays pixel-aligned with the input,
// and manages notes, theme, persistence, and the Pro/help modals.

import { evaluateSheet } from './engine/sheet.js';
import { add } from './engine/value.js';
import { formatValue } from './engine/format.js';
import { initPro, isPro, openProModal, onProChange } from './pro.js';

const $ = (s) => document.querySelector(s);
const input = $('#input');
const results = $('#results');
const linenums = $('#linenums');
const tabsEl = $('#tabs');

const FREE_NOTES = 3;
const STORE = 'reckon_docs_v1';
const THEME_KEY = 'reckon_theme';

const SAMPLE = `# Welcome to Reckon — type on the left, read answers on the right.
# Everything runs locally in your browser. Nothing is uploaded.

2 + 2 * 10
sqrt(144) + 3^2
20% off $1,499
3 days in hours
100 km in miles
60 mph * 2 hours in miles

# A monthly budget. "sum above" totals the block right above it:
rent = $1,800
groceries = $600
utilities = $180
transport = $140
sum above

# Variables and rates flow down the page:
coffee = $4.50
coffee * 5 per week * 52 weeks

# Now try your own calculations below…
`;

let state = loadState();

// ── persistence ──
function loadState() {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const s = JSON.parse(raw);
      if (s.docs && s.docs.length) {
        // clamp a corrupt/out-of-range active index so boot can't read undefined
        if (!(s.active >= 0 && s.active < s.docs.length)) s.active = 0;
        return s;
      }
    }
  } catch {}
  return { docs: [{ id: uid(), name: 'Scratchpad', text: SAMPLE }], active: 0 };
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {}
}
function uid() { return 'd' + Math.random().toString(36).slice(2, 9); }

// ── evaluation + render ──
let raf = 0;
function scheduleRecompute() {
  if (raf) return;
  raf = requestAnimationFrame(() => { raf = 0; recompute(); });
}

function recompute() {
  const text = input.value;
  const lines = text.split('\n');
  const rows = evaluateSheet(lines);

  // line numbers
  linenums.textContent = lines.map((_, i) => i + 1).join('\n');

  // results, one aligned line each
  const frag = document.createDocumentFragment();
  const totals = [];
  for (const r of rows) {
    const d = document.createElement('div');
    d.className = 'res-line ' + r.kind;
    if (r.kind === 'result' || r.kind === 'assign') {
      d.textContent = r.text;
      d.dataset.copy = r.text;
      if (r.value && (r.value.kind === 'number' || r.value.kind === 'percent')) totals.push(r.value);
    } else if (r.kind === 'error') {
      d.textContent = r.text;
      d.title = r.text;
    }
    frag.appendChild(d);
  }
  results.replaceChildren(frag);

  // status bar
  $('#stat-lines').textContent = `${lines.length} line${lines.length !== 1 ? 's' : ''}`;
  $('#stat-total').textContent = grandTotal(totals);

  // save current doc text
  state.docs[state.active].text = text;
  autoName();
  save();
  syncScroll();
}

function grandTotal(vals) {
  if (!vals.length) return 'Σ —';
  try {
    let acc = vals[0];
    for (let i = 1; i < vals.length; i++) acc = add(acc, vals[i]);
    return 'Σ ' + formatValue(acc);
  } catch { return 'Σ (mixed units)'; }
}

// ── scroll sync (gutter + results follow the textarea) ──
function syncScroll() {
  const y = input.scrollTop;
  linenums.scrollTop = y;
  results.scrollTop = y;
}

// ── notes / tabs ──
function renderTabs() {
  tabsEl.replaceChildren();
  state.docs.forEach((doc, i) => {
    const t = document.createElement('button');
    t.className = 'tab' + (i === state.active ? ' active' : '');
    const name = document.createElement('span');
    name.className = 'tab-name';
    name.textContent = doc.name || 'Note';
    t.appendChild(name);
    if (state.docs.length > 1) {
      const x = document.createElement('span');
      x.className = 'tab-close';
      x.textContent = '×';
      x.addEventListener('click', (e) => { e.stopPropagation(); closeDoc(i); });
      t.appendChild(x);
    }
    t.addEventListener('click', () => switchDoc(i));
    tabsEl.appendChild(t);
  });
}
function switchDoc(i) {
  state.active = i;
  input.value = state.docs[i].text;
  renderTabs(); recompute(); save();
  input.focus();
}
function newDoc() {
  if (!isPro() && state.docs.length >= FREE_NOTES) {
    toast(`Free notes are capped at ${FREE_NOTES} — unlock Pro for unlimited`, true);
    openProModal();
    return;
  }
  state.docs.push({ id: uid(), name: 'Note ' + (state.docs.length + 1), text: '' });
  state.active = state.docs.length - 1;
  input.value = '';
  renderTabs(); recompute(); save();
  input.focus();
}
function closeDoc(i) {
  if (state.docs.length <= 1) return;
  state.docs.splice(i, 1);
  if (state.active >= state.docs.length) state.active = state.docs.length - 1;
  else if (i < state.active) state.active--;
  input.value = state.docs[state.active].text;
  renderTabs(); recompute(); save();
}
function autoName() {
  const doc = state.docs[state.active];
  const firstLine = (doc.text.split('\n').find(l => l.trim()) || '').trim();
  const label = firstLine.replace(/^#+\s*/, '').slice(0, 24);
  if (label && !/^\d/.test(label)) { doc.name = label; renderTabsName(); }
}
function renderTabsName() {
  const tab = tabsEl.children[state.active];
  if (tab) tab.querySelector('.tab-name').textContent = state.docs[state.active].name;
}

// ── click a result to copy ──
results.addEventListener('click', async (e) => {
  const el = e.target.closest('.res-line');
  if (!el || !el.dataset.copy) return;
  try {
    await navigator.clipboard.writeText(el.dataset.copy);
    el.classList.add('copied');
    setTimeout(() => el.classList.remove('copied'), 700);
    toast('Copied ' + el.dataset.copy);
  } catch {}
});

// ── theme ──
function setTheme(t) {
  document.body.dataset.theme = t;
  try { localStorage.setItem(THEME_KEY, t); } catch {}
  document.querySelector('meta[name=theme-color]').content = t === 'light' ? '#eae6dc' : '#111318';
}
$('#btn-theme').addEventListener('click', () =>
  setTheme(document.body.dataset.theme === 'light' ? 'dark' : 'light'));

// ── toast ──
let toastTimer;
export function toast(msg, accent = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  if (el.showPopover) { try { el.hidePopover(); } catch {} try { el.showPopover(); } catch {} }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show'); if (el.hidePopover) setTimeout(() => { try { el.hidePopover(); } catch {} }, 250); }, 2600);
}

// ── help cheatsheet ──
const CHEATS = [
  ['20% off $1,499', '$1,199.20'], ['3 days in hours', '72 h'],
  ['12 GBP to USD', '$15.24 …'], ['5 ft 6 in in cm', '167.64 cm'],
  ['sqrt(144) + 3^2', '21'], ['1 GB / 8 MB', '125'],
  ['rent = $1,800', '$1,800.00'], ['sum above', 'Σ …'],
  ['100 kph in mph', '(units!)'], ['today + 2 weeks', 'a date'],
  ['15% of 80', '12'], ['1,024 * 8 bits in KB', '…'],
];
$('#btn-help').addEventListener('click', () => {
  const g = $('#cheat-grid');
  g.replaceChildren();
  // compute live so the cheatsheet is honest
  for (const [inp] of CHEATS) {
    const r = evaluateSheet([inp])[0];
    const row = document.createElement('div'); row.className = 'cheat-row';
    const a = document.createElement('span'); a.className = 'cheat-in'; a.textContent = inp;
    const b = document.createElement('span'); b.className = 'cheat-out'; b.textContent = r.error ? '—' : r.text;
    row.append(a, b); g.appendChild(row);
  }
  $('#help-modal').showModal();
});

// ── export current note to .txt (Pro) ──
function exportNote() {
  if (!isPro()) {
    toast('Exporting is a Pro feature', true);
    openProModal();
    return;
  }
  const lines = input.value.split('\n');
  const rows = evaluateSheet(lines);
  // pad the input column so results line up in monospace/plain text
  const width = Math.min(60, Math.max(0, ...lines.map(l => l.length)));
  const body = lines.map((l, i) => {
    const r = rows[i];
    if (r && (r.kind === 'result' || r.kind === 'assign')) return l.padEnd(width) + '  = ' + r.text;
    return l;
  }).join('\n');
  const doc = state.docs[state.active];
  const header = `${doc.name}\nReckon — calculated ${new Date().toISOString().slice(0, 10)}\n${'─'.repeat(40)}\n`;
  const blob = new Blob([header + body + '\n'], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (doc.name || 'reckon').replace(/[^\w.-]+/g, '-').toLowerCase() + '.txt';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Exported ' + a.download);
}

// ── wiring ──
input.addEventListener('input', scheduleRecompute);
input.addEventListener('scroll', syncScroll);
$('#btn-newtab').addEventListener('click', newDoc);
$('#btn-export').addEventListener('click', exportNote);
$('#btn-pro').addEventListener('click', openProModal);
window.addEventListener('resize', syncScroll);

// keep tab key inserting a tab char instead of leaving the field
input.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = input.selectionStart, en = input.selectionEnd;
    input.value = input.value.slice(0, s) + '  ' + input.value.slice(en);
    input.selectionStart = input.selectionEnd = s + 2;
    scheduleRecompute();
  }
});

onProChange((pro) => {
  $('#pro-badge').hidden = !pro;
  $('#btn-pro').hidden = pro;
  recompute();
});

// ── boot ──
// Set the editor content BEFORE initPro(): initPro() emits to onProChange, whose
// listener calls recompute(), which persists input.value — so the textarea must
// already hold the current doc or we'd save an empty note over it.
setTheme((() => { try { return localStorage.getItem(THEME_KEY) || 'dark'; } catch { return 'dark'; } })());
input.value = state.docs[state.active].text;
renderTabs();
initPro();
recompute();
if (location.hash === '#pro') openProModal();
