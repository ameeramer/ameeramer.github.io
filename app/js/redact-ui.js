// Redact overlay. Shows the pristine image at a uniform scale, lets the user
// drag boxes over sensitive areas, previews the real effect live, and returns
// a redacted bitmap. Coordinates are trivial: one scale factor between the
// displayed canvas and image pixels — no frame/rotation transforms involved.

import { redactImage } from './redact.js';

const $ = (s) => document.querySelector(s);

let modal, stage, canvas, ctx;
let img = null;                 // pristine source
let rects = [];                 // committed rects in IMAGE-space {x,y,w,h}
let mode = 'pixelate';
let scale = 1;                  // display px per image px
let drag = null;                // {x0,y0,x1,y1} in display space
let onApplyCb = null;
let wired = false;

function fit() {
  // Fit the image into the available stage while capping the backing store.
  const maxW = Math.min(stage.clientWidth || 900, 1100);
  const maxH = Math.min(stage.clientHeight || 560, 700);
  scale = Math.min(maxW / img.width, maxH / img.height, 1);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function redraw() {
  const dispW = img.width * scale, dispH = img.height * scale;
  // Base: the image with committed redactions already baked in (real effect).
  const baked = rects.length ? redactImage(img, rects, mode) : img;
  ctx.clearRect(0, 0, dispW, dispH);
  ctx.drawImage(baked, 0, 0, dispW, dispH);
  // Committed regions get a subtle marker so they're visible even when the
  // underlying content blends in.
  ctx.strokeStyle = 'rgba(245,184,65,0.9)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 3]);
  for (const r of rects) {
    ctx.strokeRect(r.x * scale, r.y * scale, r.w * scale, r.h * scale);
  }
  ctx.setLineDash([]);
  // In-progress drag box.
  if (drag) {
    const { x, y, w: dw, h: dh } = norm(drag);
    ctx.fillStyle = 'rgba(245,184,65,0.18)';
    ctx.fillRect(x, y, dw, dh);
    ctx.strokeStyle = 'rgba(245,184,65,0.95)';
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x, y, dw, dh);
    ctx.setLineDash([]);
  }
}

const norm = (d) => ({
  x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1),
  w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0),
});

function localPoint(e) {
  const r = canvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(r.width, (e.clientX - r.left)));
  const y = Math.max(0, Math.min(r.height, (e.clientY - r.top)));
  return { x, y };
}

function onDown(e) {
  e.preventDefault();
  const p = localPoint(e);
  drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  canvas.setPointerCapture?.(e.pointerId);
}
function onMove(e) {
  if (!drag) return;
  const p = localPoint(e);
  drag.x1 = p.x; drag.y1 = p.y;
  redraw();
}
function onUp() {
  if (!drag) return;
  const d = norm(drag);
  drag = null;
  if (d.w > 6 && d.h > 6) {
    // Convert display-space box to image-space and commit.
    rects.push({ x: d.x / scale, y: d.y / scale, w: d.w / scale, h: d.h / scale });
  }
  redraw();
}

function wire() {
  modal = $('#redact-modal');
  stage = $('#redact-stage');
  canvas = $('#redact-canvas');
  ctx = canvas.getContext('2d');

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  $('#redact-mode').addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn');
    if (!b) return;
    mode = b.dataset.rmode;
    $('#redact-mode').querySelectorAll('.seg-btn')
      .forEach(x => x.classList.toggle('active', x === b));
    redraw();
  });
  $('#btn-redact-clear').addEventListener('click', () => { rects = []; redraw(); });
  $('#btn-redact-cancel').addEventListener('click', () => modal.close());
  $('#btn-redact-apply').addEventListener('click', () => {
    const result = rects.length ? redactImage(img, rects, mode) : img;
    onApplyCb?.(result, { rects: rects.slice(), mode });
    modal.close();
  });
  wired = true;
}

// Open the redactor. `state` = { rects, mode } to restore a prior session.
export function openRedactor(pristine, state, onApply) {
  if (!wired) wire();
  img = pristine;
  rects = (state && state.rects) ? state.rects.map(r => ({ ...r })) : [];
  mode = (state && state.mode) || 'pixelate';
  onApplyCb = onApply;
  $('#redact-mode').querySelectorAll('.seg-btn')
    .forEach(x => x.classList.toggle('active', x.dataset.rmode === mode));
  modal.showModal();
  // Size immediately (fit() tolerates a not-yet-measured stage via its
  // fallbacks) so the canvas is never left at the 300×150 default, then
  // refine on the next frame once real layout dimensions are available.
  fit(); redraw();
  requestAnimationFrame(() => { fit(); redraw(); });
}
