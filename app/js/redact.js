// Image-space redaction. Bakes blurred/pixelated boxes into a copy of the
// source bitmap BEFORE it enters the render pipeline, so renderer.js is
// untouched and redaction survives every frame/gradient/export unchanged.
//
// rects are in source-image pixel coordinates: { x, y, w, h }.
// mode: 'pixelate' (mosaic, always available) | 'blur' (ctx.filter, with a
// pixelate fallback where unsupported).

function drawBaseline(src) {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0);
  return { c, ctx };
}

const clampRect = (r, W, H) => {
  const x = Math.max(0, Math.min(W, Math.round(r.x)));
  const y = Math.max(0, Math.min(H, Math.round(r.y)));
  const w = Math.max(0, Math.min(W - x, Math.round(r.w)));
  const h = Math.max(0, Math.min(H - y, Math.round(r.h)));
  return { x, y, w, h };
};

function pixelateRegion(ctx, src, r) {
  // Mosaic: shrink the region to a few blocks, draw it back scaled up.
  const blocks = Math.max(4, Math.round(Math.min(r.w, r.h) / 12));
  const tmp = document.createElement('canvas');
  tmp.width = blocks;
  tmp.height = Math.max(1, Math.round(blocks * (r.h / r.w)));
  const tctx = tmp.getContext('2d');
  // Average pixels when shrinking (each block = mean colour) so fine detail
  // like text is genuinely destroyed, not just sub-sampled.
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, tmp.width, tmp.height);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, r.x, r.y, r.w, r.h);
  ctx.restore();
}

function blurRegion(ctx, src, r) {
  if (typeof ctx.filter === 'undefined') { pixelateRegion(ctx, src, r); return; }
  const radius = Math.max(6, Math.round(Math.min(r.w, r.h) / 6));
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.filter = `blur(${radius}px)`;
  // Draw the whole image (blurred) but clipped to the region, so the blur
  // samples neighbouring pixels instead of hard edges.
  ctx.drawImage(src, 0, 0);
  ctx.restore();
  ctx.filter = 'none';
}

// Returns a new canvas with the redactions baked in. If there are no rects,
// returns a plain copy (callers can treat the result uniformly).
export function redactImage(src, rects = [], mode = 'pixelate') {
  const { c, ctx } = drawBaseline(src);
  for (const raw of rects) {
    const r = clampRect(raw, c.width, c.height);
    if (r.w < 2 || r.h < 2) continue;
    if (mode === 'blur') blurRegion(ctx, src, r);
    else pixelateRegion(ctx, src, r);
  }
  return c;
}
