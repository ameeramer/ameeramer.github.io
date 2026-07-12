// The single render pipeline. Preview and export both call render() —
// there is no second code path, so what you see is exactly what ships.

import { paintBackground, backgroundIsLight } from './backgrounds.js';
import { measureFrame, drawFramedImage, roundRectPath } from './frames.js';
import { CANVAS_PRESETS } from './presets.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Logical output size in px (before pixelScale multiplication).
export function outputSize(state) {
  if (state.canvas.preset === 'custom') {
    return {
      w: clamp(state.canvas.w || 1400, 320, 4096),
      h: clamp(state.canvas.h || 900, 320, 4096),
    };
  }
  const preset = CANVAS_PRESETS.find(p => p.id === state.canvas.preset);
  if (preset && preset.w) return { w: preset.w, h: preset.h };
  // Auto: image at natural-ish size + breathing room. Width AND height are
  // capped so a full-page screenshot can't push the canvas past browser
  // bitmap limits.
  const { w: iw, h: ih } = state.imageMeta;
  const pad = state.layout.padding;
  const scale = Math.min(1, 1680 / iw, 2800 / ih);
  return {
    w: Math.round(iw * scale + pad * 2),
    h: Math.round(ih * scale + pad * 2),
  };
}

export function render(state, canvas, pixelScale = 1) {
  const { w: W, h: H } = outputSize(state);
  canvas.width = Math.round(W * pixelScale);
  canvas.height = Math.round(H * pixelScale);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 1 — Background
  paintBackground(ctx, W, H, state.background);

  if (!state.image) return;

  const pad = state.layout.padding;
  const light = backgroundIsLight(state.background);

  // 2 — Optional text band
  const { heading, sub, position } = state.text;
  const hasText = heading.trim() || sub.trim();
  let bandH = 0, headingSize = 0, subSize = 0;
  if (hasText) {
    headingSize = clamp(W * 0.048, 22, 72);
    subSize = headingSize * 0.46;
    bandH = (heading.trim() ? headingSize * 1.25 : 0)
          + (sub.trim() ? subSize * 1.6 : 0)
          + pad * 0.35;
  }

  // 3 — Fit framed content into the remaining area
  const availW = Math.max(W - pad * 2, 40);
  const availH = Math.max(H - pad * 2 - bandH, 40);
  const geom = measureFrame(
    state.frame.type,
    state.imageMeta.w, state.imageMeta.h,
    availW, availH,
    state.layout.scale,
  );

  const cx = W / 2;
  const bandTop = position === 'top';
  const freeTop = pad + (bandTop ? bandH : 0);
  const freeH = H - pad * 2 - bandH;
  // Math.abs keeps the nudge direction stable when content overflows the
  // free area (scale > 1 makes freeH - geom.h negative).
  let cy = freeTop + freeH / 2
         + (state.layout.offsetY / 100) * Math.abs(freeH - geom.h) / 2;

  // 4 — Framed content, composited offscreen first so the drop shadow is
  // cast by the true alpha silhouette (transparent screenshot regions stay
  // transparent instead of revealing a shadow card behind them).
  const off = document.createElement('canvas');
  off.width = Math.max(1, Math.ceil(geom.w * pixelScale));
  off.height = Math.max(1, Math.ceil(geom.h * pixelScale));
  const octx = off.getContext('2d');
  octx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  drawFramedImage(octx, state.frame, 0, 0, geom, state.image, state.layout.radius);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((state.layout.rotation * Math.PI) / 180);
  const s = state.layout.shadow;
  if (s > 0) {
    // Canvas shadow params live in device space (unaffected by the CTM),
    // so they must scale with pixelScale to keep exports identical to the
    // preview.
    ctx.shadowColor = `rgba(0,0,0,${clamp(0.18 + s * 0.005, 0, 0.72)})`;
    ctx.shadowBlur = s * 1.4 * pixelScale;
    ctx.shadowOffsetY = s * 0.55 * pixelScale;
  }
  ctx.drawImage(off, -geom.w / 2, -geom.h / 2, geom.w, geom.h);
  ctx.restore();

  // 5 — Text
  if (hasText) {
    const color = state.text.color === 'auto'
      ? (light ? '#16130c' : '#f7f5f0')
      : state.text.color;
    ctx.textAlign = 'center';
    let ty = bandTop
      ? pad * 0.9
      : cy + geom.h / 2 + pad * 0.45;
    // Keep the band inside the canvas when content is tall.
    ty = clamp(ty, pad * 0.4, H - bandH - pad * 0.2);

    if (heading.trim()) {
      ctx.font = `400 ${headingSize}px "Instrument Serif", Georgia, serif`;
      ctx.textBaseline = 'top';
      ctx.fillStyle = color;
      ctx.fillText(heading.trim(), W / 2, ty, W - pad);
      ty += headingSize * 1.25;
    }
    if (sub.trim()) {
      ctx.font = `400 ${subSize}px "Schibsted Grotesk", -apple-system, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.72;
      ctx.fillText(sub.trim(), W / 2, ty, W - pad);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left';
  }

  // 6 — Watermark (free tier)
  if (!state.pro) {
    const fs = clamp(W * 0.014, 11, 18);
    ctx.font = `500 ${fs}px "Schibsted Grotesk", -apple-system, sans-serif`;
    const label = '✦ Made with Moonshot';
    const tw = ctx.measureText(label).width;
    const px = fs * 0.9, py = fs * 0.55;
    const bx = W - tw - px * 2 - fs, by = H - fs - py * 2 - fs * 0.8;
    ctx.fillStyle = light ? 'rgba(20,17,10,0.55)' : 'rgba(10,10,14,0.55)';
    roundRectPath(ctx, bx, by, tw + px * 2, fs + py * 2, (fs + py * 2) / 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(245,184,65,0.95)';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + px, by + (fs + py * 2) / 2 + fs * 0.05);
  }
}
