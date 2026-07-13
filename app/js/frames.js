// Device frame geometry + vector drawing. No image assets — every frame is
// drawn programmatically so it stays crisp at any export scale.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Chrome proportions relative to framed width.
const K = {
  macos:   { bar: 0.052, barMin: 26, barMax: 76 },
  browser: { bar: 0.075, barMin: 34, barMax: 96 },
  phone:   { bezel: 0.03, bezelMin: 8, bezelMax: 26 },
};

// Compute geometry for the framed image fitted inside (availW × availH),
// honoring the user scale multiplier. Returns frame-local geometry in
// logical px. Chrome (title bar / bezel) size depends on the fitted width,
// so we fit twice: once with an estimate, once with the real chrome.
export function measureFrame(frameType, imgW, imgH, availW, availH, scale) {
  const aspect = imgW / imgH;

  const chromeFor = (w) => {
    if (frameType === 'macos' || frameType === 'browser') {
      const k = K[frameType];
      return { top: clamp(w * k.bar, k.barMin, k.barMax), bezel: 0 };
    }
    if (frameType === 'phone') {
      const k = K.phone;
      return { top: 0, bezel: clamp(w * k.bezel, k.bezelMin, k.bezelMax) };
    }
    return { top: 0, bezel: 0 };
  };

  // Fit a frame with the given chrome into the available box, width-first.
  const fit = ({ top, bezel }) => {
    let w = availW;
    let h = (w - bezel * 2) / aspect + bezel * 2 + top;
    if (h > availH) {
      h = availH;
      w = (h - top - bezel * 2) * aspect + bezel * 2;
    }
    return { w, h };
  };

  let box = fit(chromeFor(availW));
  const chrome = chromeFor(box.w);
  box = fit(chrome);

  // Apply user scale to the whole frame, chrome included.
  const w = box.w * scale;
  const top = chrome.top * scale;
  const bezel = chrome.bezel * scale;
  const h = (w - bezel * 2) / aspect + bezel * 2 + top;

  return {
    w, h, chromeTop: top, bezel,
    imgX: bezel,
    imgY: top + bezel,
    imgW: w - bezel * 2,
    imgH: h - top - bezel * 2,
  };
}

// Draw the full framed content with rounded clipping. (x, y) is the frame's
// top-left. `radius` is the user's corner radius; phone frames enforce a
// larger device-like radius.
export function drawFramedImage(ctx, frame, x, y, geom, image, radius) {
  const { w, h, chromeTop, bezel } = geom;
  const type = frame.type;
  const light = frame.theme === 'light';
  const r = type === 'phone' ? Math.max(radius, w * 0.085) : radius;

  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.clip();

  if (type === 'phone') {
    // Bezel body
    ctx.fillStyle = light ? '#e5e5ea' : '#101013';
    ctx.fillRect(x, y, w, h);
    // Screen
    ctx.save();
    roundRectPath(ctx, x + bezel, y + bezel, w - bezel * 2, h - bezel * 2, Math.max(r - bezel, 4));
    ctx.clip();
    drawImageCover(ctx, image, x + bezel, y + bezel, w - bezel * 2, h - bezel * 2);
    ctx.restore();
    // Dynamic island
    const iw = w * 0.28, ih = Math.max(h * 0.022, 10);
    ctx.fillStyle = '#000';
    roundRectPath(ctx, x + (w - iw) / 2, y + bezel + ih * 0.7, iw, ih, ih / 2);
    ctx.fill();
  } else if (type === 'macos' || type === 'browser') {
    // Title / toolbar
    ctx.fillStyle = light ? '#ececee' : '#1d1d21';
    ctx.fillRect(x, y, w, chromeTop);
    // Traffic lights
    const lr = clamp(chromeTop * 0.15, 4, 9);
    const cy = y + chromeTop / 2;
    const colors = ['#ff5f57', '#febc2e', '#28c840'];
    colors.forEach((c, i) => {
      ctx.beginPath();
      ctx.arc(x + chromeTop * 0.55 + i * lr * 2.9, cy, lr, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
    });
    if (type === 'browser') {
      // URL pill
      const pw = w * 0.46, ph = chromeTop * 0.58;
      const px = x + (w - pw) / 2, py = y + (chromeTop - ph) / 2;
      ctx.fillStyle = light ? '#ffffff' : '#101014';
      roundRectPath(ctx, px, py, pw, ph, ph / 2);
      ctx.fill();
      // Padlock + URL text
      const fs = clamp(ph * 0.42, 8, 15);
      ctx.fillStyle = light ? '#6b7280' : '#8b8b96';
      ctx.font = `${fs}px "Geist Mono", ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const url = frame.url || 'moonshot.app';
      ctx.fillText(lockGlyph() + url, px + pw / 2, py + ph / 2 + fs * 0.06, pw - fs * 2);
      ctx.textAlign = 'left';
    } else if ((frame.title || '').trim()) {
      // Centered macOS window title, clipped so it never overlaps the lights.
      const fs = clamp(chromeTop * 0.38, 9, 15);
      ctx.fillStyle = light ? '#3f3f46' : '#c4c4cc';
      ctx.font = `500 ${fs}px "Schibsted Grotesk", -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lightsRight = x + chromeTop * 0.55 + 3 * clamp(chromeTop * 0.15, 4, 9) * 2.9;
      const safe = (lightsRight - x) + 8;           // keep clear of the traffic lights
      const maxW = w - safe * 2;
      ctx.fillText(frame.title.trim(), x + w / 2, y + chromeTop / 2 + fs * 0.06, maxW);
      ctx.textAlign = 'left';
    }
    // Hairline under bar
    ctx.fillStyle = light ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.07)';
    ctx.fillRect(x, y + chromeTop - 1, w, 1);
    // Content
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y + chromeTop, w, h - chromeTop);
    ctx.clip();
    drawImageCover(ctx, image, x, y + chromeTop, w, h - chromeTop);
    ctx.restore();
  } else {
    drawImageCover(ctx, image, x, y, w, h);
  }

  // Inner hairline ring for definition against similar backgrounds
  ctx.restore();
  ctx.save();
  roundRectPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function lockGlyph() {
  // Simple tune-able prefix; a vector padlock is overkill at this size.
  return '● '; // small filled circle reads as a secure-dot
}

function drawImageCover(ctx, image, x, y, w, h) {
  // Cover-fit: fill the rect, cropping overflow, never stretching.
  const iw = image.width, ih = image.height;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale, dh = ih * scale;
  ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

export function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, rr);
  } else {
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
}
