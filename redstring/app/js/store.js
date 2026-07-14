// Board state: the connection graph (items + ropes with metadata), an
// undo/redo command stack, and localStorage persistence. Images are stored
// as downscaled dataURLs so a photo-heavy board still fits the quota.
//
// Every rope edge carries metadata (label, confidence, timestamps) so future
// AI agents can annotate/traverse the graph — per the product architecture.

const KEY = 'redstring_board_v1';

export const state = {
  name: 'Case #001',
  items: [],     // plain data objects (see items.js createItem)
  ropes: [],     // { id, a, b, color, label?, confidence?, created }
};

let nextId = 1;
export const uid = (p = 'n') => `${p}${Date.now().toString(36)}${(nextId++).toString(36)}`;

// ── Undo / redo ──
const undoStack = [], redoStack = [];
const MAX_UNDO = 100;

export function execute(cmd) {
  cmd.do();
  undoStack.push(cmd);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
  save();
}
export function undo() {
  const cmd = undoStack.pop();
  if (!cmd) return false;
  cmd.undo();
  redoStack.push(cmd);
  save();
  return true;
}
export function redo() {
  const cmd = redoStack.pop();
  if (!cmd) return false;
  cmd.do();
  undoStack.push(cmd);
  save();
  return true;
}

// ── Persistence ──
let saveT = 0;
export function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ name: state.name, items: state.items, ropes: state.ropes }));
    } catch { /* quota — better to keep running than to crash the board */ }
  }, 250);
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (!Array.isArray(s.items)) return false;
    state.name = s.name || 'Case #001';
    state.items = s.items;
    state.ropes = Array.isArray(s.ropes) ? s.ropes : [];
    return true;
  } catch { return false; }
}

export function clearSaved() {
  try { localStorage.removeItem(KEY); } catch {}
}

// Downscale an uploaded image file to a dataURL that persists comfortably.
export function fileToDataURL(file, maxDim = 720) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const s = Math.min(1, maxDim / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = url;
  });
}
