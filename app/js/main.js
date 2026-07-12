// Bootstrap: restore state, wire import paths (file / drop / paste),
// drive preview renders off state changes.

import { state, subscribe, restore, setImage } from './state.js';
import { render, outputSize } from './renderer.js';
import { makeSampleImage } from './sample.js';
import { initUI, toast, syncProUI, markActiveSwatches, openProModal } from './ui.js';

const preview = document.getElementById('preview');
const sizeIndicator = document.getElementById('size-indicator');
const dropOverlay = document.getElementById('drop-overlay');
const fileInput = document.getElementById('file-input');

// ── Render loop: batch state changes into one rAF render ──
// The preview renders at its *displayed* size × devicePixelRatio, not at
// full output resolution — slider drags stay cheap and huge canvases never
// exceed mobile bitmap limits. Exports render separately at full size.
const viewport = document.getElementById('viewport');
let renderQueued = false;
function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    const { w: W, h: H } = outputSize(state);
    const availW = Math.max(viewport.clientWidth - 72, 80);
    const availH = Math.max(viewport.clientHeight - 72, 80);
    const fit = Math.min(availW / W, availH / H, 1);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    render(state, preview, Math.max(fit * dpr, 0.05));
    preview.style.width = `${Math.round(W * fit)}px`;
    preview.style.height = `${Math.round(H * fit)}px`;
    if (state.background.mode === 'transparent') drawCheckerUnder(preview);
    sizeIndicator.textContent = `${W} × ${H}`;
  });
}

// Preview-only transparency indicator; exports keep real alpha because this
// never runs through the export path.
let checkerTile = null;
function drawCheckerUnder(canvas) {
  if (!checkerTile) {
    const s = 12;
    checkerTile = document.createElement('canvas');
    checkerTile.width = checkerTile.height = s * 2;
    const t = checkerTile.getContext('2d');
    t.fillStyle = '#26262c'; t.fillRect(0, 0, s * 2, s * 2);
    t.fillStyle = '#1a1a1f'; t.fillRect(0, 0, s, s); t.fillRect(s, s, s, s);
  }
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = ctx.createPattern(checkerTile, 'repeat');
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

window.addEventListener('resize', queueRender);
// Re-measure once everything (stylesheets included) has settled, and track
// viewport size changes that don't fire window resize (e.g. rail wrapping).
window.addEventListener('load', queueRender);
if (window.ResizeObserver) new ResizeObserver(queueRender).observe(viewport);

subscribe((scope) => {
  if (scope === 'pro') syncProUI();
  queueRender();
});

// ── Image import ──
async function importFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    toast('That doesn’t look like an image file');
    return;
  }
  try {
    const bitmap = await createImageBitmap(file);
    setImage(bitmap, bitmap.width, bitmap.height, file.name);
    toast(`Imported ${file.name} — ${bitmap.width}×${bitmap.height}`);
  } catch {
    // Fallback for formats createImageBitmap rejects
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImage(img, img.naturalWidth, img.naturalHeight, file.name);
      URL.revokeObjectURL(url);
      toast(`Imported ${file.name}`);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      toast('Couldn’t read that image');
    };
    img.src = url;
  }
}

fileInput.addEventListener('change', () => {
  importFile(fileInput.files[0]);
  fileInput.value = '';
});

// Drag & drop — whole window, with visual overlay
let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  if (e.dataTransfer?.types?.includes('Files')) {
    dragDepth++;
    dropOverlay.hidden = false;
  }
});
window.addEventListener('dragleave', (e) => {
  e.preventDefault();
  if (--dragDepth <= 0) { dragDepth = 0; dropOverlay.hidden = true; }
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropOverlay.hidden = true;
  const file = e.dataTransfer?.files?.[0];
  if (file) importFile(file);
});

// Paste
window.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items || [];
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      importFile(item.getAsFile());
      return;
    }
  }
});

// Keyboard shortcuts. Only text-entry fields swallow the shortcut — focus
// left on a slider or select after adjusting it must not kill ⌘E.
window.addEventListener('keydown', (e) => {
  const el = document.activeElement;
  const inTextField = el && (
    el.tagName === 'TEXTAREA' ||
    (el.tagName === 'INPUT' && /^(text|number|search|url|email)$/.test(el.type))
  );
  if ((e.metaKey || e.ctrlKey) && e.key === 'e' && !inTextField) {
    e.preventDefault();
    document.getElementById('btn-export').click();
  }
});

// ── Share-look links: style (never the image) serialized into the URL ──
function encodeLook() {
  const { canvas, background, frame, layout, text } = state;
  return btoa(encodeURIComponent(JSON.stringify({ canvas, background, frame, layout, text })));
}

function applyLookFromHash() {
  const m = location.hash.match(/^#look=(.+)$/);
  if (!m) return;
  try {
    const look = JSON.parse(decodeURIComponent(atob(m[1])));
    for (const k of ['canvas', 'background', 'frame', 'layout', 'text']) {
      if (look[k]) Object.assign(state[k], look[k]);
    }
  } catch { /* malformed link — keep current state */ }
}

// ── Boot ──
restore();
applyLookFromHash();
initUI();

document.getElementById('btn-share').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}#look=${encodeLook()}`;
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied — it opens Moonshot with this exact look');
  } catch {
    toast('Couldn’t reach the clipboard — copy the URL from the address bar instead');
    location.hash = `look=${encodeLook()}`;
  }
});
markActiveSwatches();

// Sample image so the first paint is beautiful, not blank.
const sample = makeSampleImage();
setImage(sample, sample.width, sample.height, 'sample');

// Landing page pricing links here.
if (location.hash === '#pro' && !state.pro) openProModal();

queueRender();

// Canvas text uses webfonts — re-render once they arrive.
if (document.fonts?.ready) {
  document.fonts.ready.then(queueRender);
}

// Offline support (secure contexts only; failure is non-fatal).
if ('serviceWorker' in navigator &&
    (location.protocol === 'https:' ||
     ['localhost', '127.0.0.1'].includes(location.hostname))) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* optional */ });
}
