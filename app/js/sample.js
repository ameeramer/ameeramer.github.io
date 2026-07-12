// First-run demo screenshot, drawn programmatically so the editor is never
// empty and ships zero image assets. A tasteful fake analytics dashboard.

export function makeSampleImage() {
  const W = 1440, H = 900;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  // Base
  ctx.fillStyle = '#0e0f13';
  ctx.fillRect(0, 0, W, H);

  // Sidebar
  ctx.fillStyle = '#13141a';
  ctx.fillRect(0, 0, 232, H);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(231, 0, 1, H);

  // Logo dot + name
  ctx.fillStyle = '#f5b841';
  ctx.beginPath(); ctx.arc(36, 40, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8e6df';
  ctx.font = '600 17px -apple-system, sans-serif';
  ctx.fillText('Orbit Analytics', 56, 46);

  // Nav items
  const nav = ['Overview', 'Revenue', 'Customers', 'Funnels', 'Reports', 'Settings'];
  nav.forEach((label, i) => {
    const y = 96 + i * 46;
    if (i === 0) {
      ctx.fillStyle = 'rgba(245,184,65,0.12)';
      rr(ctx, 14, y - 20, 204, 36, 8); ctx.fill();
      ctx.fillStyle = '#f5b841';
    } else {
      ctx.fillStyle = 'rgba(232,230,223,0.55)';
    }
    ctx.font = '500 14px -apple-system, sans-serif';
    ctx.fillText(label, 34, y + 2);
  });

  // Header
  ctx.fillStyle = '#e8e6df';
  ctx.font = '600 24px -apple-system, sans-serif';
  ctx.fillText('Overview', 272, 56);
  ctx.fillStyle = 'rgba(232,230,223,0.45)';
  ctx.font = '400 14px -apple-system, sans-serif';
  ctx.fillText('Last 30 days · Updated just now', 272, 82);

  // Stat cards
  const cards = [
    ['MRR', '$12,840', '+18.2%', '#4ade80'],
    ['Active users', '3,412', '+7.4%', '#4ade80'],
    ['Churn', '1.8%', '-0.4%', '#4ade80'],
    ['Trials', '286', '+31%', '#f5b841'],
  ];
  cards.forEach((card, i) => {
    const x = 272 + i * 288, y = 112, w = 264, h = 118;
    ctx.fillStyle = '#15161d';
    rr(ctx, x, y, w, h, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 12); ctx.stroke();
    ctx.fillStyle = 'rgba(232,230,223,0.5)';
    ctx.font = '500 13px -apple-system, sans-serif';
    ctx.fillText(card[0], x + 20, y + 34);
    ctx.fillStyle = '#e8e6df';
    ctx.font = '600 28px -apple-system, sans-serif';
    ctx.fillText(card[1], x + 20, y + 72);
    ctx.fillStyle = card[3];
    ctx.font = '500 13px -apple-system, sans-serif';
    ctx.fillText(card[2], x + 20, y + 98);
  });

  // Chart card
  const cx0 = 272, cy0 = 258, cw = 1128, ch = 400;
  ctx.fillStyle = '#15161d';
  rr(ctx, cx0, cy0, cw, ch, 12); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  rr(ctx, cx0 + 0.5, cy0 + 0.5, cw - 1, ch - 1, 12); ctx.stroke();
  ctx.fillStyle = '#e8e6df';
  ctx.font = '600 16px -apple-system, sans-serif';
  ctx.fillText('Recurring revenue', cx0 + 24, cy0 + 38);

  // Gridlines
  for (let i = 1; i <= 4; i++) {
    const y = cy0 + 60 + (i * (ch - 110)) / 4;
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.fillRect(cx0 + 24, y, cw - 48, 1);
  }

  // Area chart path (hand-tuned growth curve)
  const pts = [0.42, 0.40, 0.45, 0.43, 0.50, 0.48, 0.55, 0.53, 0.60, 0.58,
               0.66, 0.63, 0.70, 0.74, 0.72, 0.80, 0.78, 0.86, 0.90, 0.95];
  const px0 = cx0 + 24, pw = cw - 48;
  const py0 = cy0 + 60, ph = ch - 110;
  const toXY = (v, i) => [px0 + (i / (pts.length - 1)) * pw, py0 + ph - v * ph];

  const grad = ctx.createLinearGradient(0, py0, 0, py0 + ph);
  grad.addColorStop(0, 'rgba(245,184,65,0.32)');
  grad.addColorStop(1, 'rgba(245,184,65,0)');
  ctx.beginPath();
  pts.forEach((v, i) => {
    const [x, y] = toXY(v, i);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(px0 + pw, py0 + ph); ctx.lineTo(px0, py0 + ph); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath();
  pts.forEach((v, i) => {
    const [x, y] = toXY(v, i);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#f5b841';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Highlight dot on last point
  const [lx, ly] = toXY(pts[pts.length - 1], pts.length - 1);
  ctx.beginPath(); ctx.arc(lx, ly, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#0e0f13'; ctx.fill();
  ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#f5b841'; ctx.fill();

  // Bottom row: two half-cards
  const half = (cw - 24) / 2;
  [['Top plans', 0], ['Recent signups', 1]].forEach(([title, i]) => {
    const x = cx0 + i * (half + 24), y = 682, h2 = 178;
    ctx.fillStyle = '#15161d';
    rr(ctx, x, y, half, h2, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    rr(ctx, x + 0.5, y + 0.5, half - 1, h2 - 1, 12); ctx.stroke();
    ctx.fillStyle = '#e8e6df';
    ctx.font = '600 15px -apple-system, sans-serif';
    ctx.fillText(title, x + 20, y + 32);
    // rows
    for (let r = 0; r < 3; r++) {
      const ry = y + 58 + r * 36;
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      rr(ctx, x + 20, ry, 22, 22, 6); ctx.fill();
      ctx.fillStyle = 'rgba(232,230,223,0.34)';
      rr(ctx, x + 54, ry + 4, half * (0.34 + r * 0.08), 6, 3); ctx.fill();
      ctx.fillStyle = 'rgba(232,230,223,0.16)';
      rr(ctx, x + 54, ry + 15, half * 0.22, 5, 2.5); ctx.fill();
    }
  });

  return c;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
