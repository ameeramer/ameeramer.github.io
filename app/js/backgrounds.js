// Background painters. All draw into a ctx already scaled to logical units.

import { GRADIENTS } from './presets.js';

let noiseTile = null;

function getNoiseTile() {
  if (noiseTile) return noiseTile;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const nctx = c.getContext('2d');
  const img = nctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  nctx.putImageData(img, 0, 0);
  noiseTile = c;
  return c;
}

export function getGradient(id) {
  return GRADIENTS.find(g => g.id === id) || GRADIENTS[0];
}

function angleToLine(angle, w, h) {
  // Convert CSS-style angle (deg, 0 = up, clockwise) to a gradient line
  // through the canvas center that fully covers the rect.
  const rad = ((angle - 90) * Math.PI) / 180;
  const cx = w / 2, cy = h / 2;
  const len = (Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad))) / 2;
  return [
    cx - Math.cos(rad) * len, cy - Math.sin(rad) * len,
    cx + Math.cos(rad) * len, cy + Math.sin(rad) * len,
  ];
}

export function paintBackground(ctx, w, h, bg) {
  if (bg.mode === 'transparent') {
    ctx.clearRect(0, 0, w, h);
    return;
  }

  if (bg.mode === 'solid') {
    ctx.fillStyle = bg.solid;
    ctx.fillRect(0, 0, w, h);
  } else {
    const g = getGradient(bg.gradientId);
    const [x0, y0, x1, y1] = angleToLine(g.angle, w, h);
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [off, color] of g.stops) grad.addColorStop(off, color);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Mesh blobs: soft radial accents that make gradients feel hand-lit.
    if (g.mesh) {
      for (const [px, py, pr, color, alpha] of g.mesh) {
        const cx = (px / 100) * w;
        const cy = (py / 100) * h;
        const r = (pr / 100) * Math.max(w, h);
        const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        rg.addColorStop(0, hexWithAlpha(color, alpha));
        rg.addColorStop(1, hexWithAlpha(color, 0));
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, w, h);
      }
    }
  }

  if (bg.noise > 0.005) {
    const tile = getNoiseTile();
    ctx.save();
    ctx.globalAlpha = bg.noise;
    ctx.globalCompositeOperation = 'overlay';
    const pattern = ctx.createPattern(tile, 'repeat');
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

// Perceptual-ish luminance of the gradient midpoint / solid, used to pick
// auto text + watermark color.
export function backgroundIsLight(bg) {
  let hex;
  if (bg.mode === 'transparent') return false;
  if (bg.mode === 'solid') hex = bg.solid;
  else {
    const g = getGradient(bg.gradientId);
    hex = g.stops[Math.floor(g.stops.length / 2)][1];
  }
  const { r, g: gg, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * gg + 0.114 * b) / 255 > 0.6;
}

export function hexToRgb(hex) {
  const m = hex.replace('#', '');
  const n = m.length === 3 ? m.split('').map(c => c + c).join('') : m;
  const int = parseInt(n, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

export function hexWithAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}
