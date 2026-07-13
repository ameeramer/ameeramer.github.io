// DOM bindings: controls → state. Rendering is driven by state subscribers
// in main.js; this file never touches the canvas directly.

import { state, set, setPro } from './state.js';
import { CANVAS_PRESETS, GRADIENTS, SOLIDS, STYLE_PRESETS } from './presets.js';
import { exportImage, copyToClipboard } from './export.js';
import { verifyLicense, GUMROAD_URL } from './license.js';
import { PAY_ADDRESS, suggestedEth, verifyPayment, findRecentPayment } from './cryptopay.js';

const $ = (sel) => document.querySelector(sel);

let toastTimer = null, toastHideTimer = null;
export function toast(msg, gold = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('gold', gold);
  el.classList.add('show');
  // Popover puts the toast in the top layer, above <dialog> backdrops.
  if (el.showPopover) {
    try { el.hidePopover(); } catch { /* not open */ }
    try { el.showPopover(); } catch { /* unsupported state */ }
  }
  // Clear both timers — a stale fade-out timer from a previous toast must
  // not hide this one mid-display.
  clearTimeout(toastTimer);
  clearTimeout(toastHideTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    if (el.hidePopover) {
      toastHideTimer = setTimeout(() => {
        try { el.hidePopover(); } catch { /* closed */ }
      }, 250);
    }
  }, 2800);
}

function cssGradient(g) {
  const stops = g.stops.map(([o, c]) => `${c} ${Math.round(o * 100)}%`).join(', ');
  return `linear-gradient(${g.angle}deg, ${stops})`;
}

function syncSeg(container, attr, value) {
  container.querySelectorAll('.seg-btn').forEach(b =>
    b.classList.toggle('active', b.dataset[attr] === value));
}

export function initUI() {
  // ── Canvas presets ──
  const presetSel = $('#canvas-preset');
  for (const p of CANVAS_PRESETS) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.w ? `${p.label} — ${p.w}×${p.h}` : p.label;
    presetSel.appendChild(opt);
  }
  presetSel.value = state.canvas.preset;
  const customRow = $('#custom-size');
  customRow.hidden = state.canvas.preset !== 'custom';
  presetSel.addEventListener('change', () => {
    customRow.hidden = presetSel.value !== 'custom';
    set('canvas', { preset: presetSel.value });
  });
  // Commit on change (blur/Enter), clamped — rendering and persisting
  // half-typed values on every keystroke would thrash the canvas.
  const cw = $('#custom-w'), ch = $('#custom-h');
  cw.value = state.canvas.w; ch.value = state.canvas.h;
  const clampSize = (v, fallback) =>
    Math.min(4096, Math.max(320, Math.round(+v) || fallback));
  for (const input of [cw, ch]) {
    input.addEventListener('change', () => {
      const w = clampSize(cw.value, state.canvas.w);
      const h = clampSize(ch.value, state.canvas.h);
      cw.value = w; ch.value = h;
      set('canvas', { w, h });
    });
  }

  // ── Background: mode tabs ──
  const bgMode = $('#bg-mode');
  syncSeg(bgMode, 'mode', state.background.mode);
  const syncBgVisibility = (mode) => {
    $('#gradient-grid').hidden = mode !== 'gradient';
    $('#solid-grid').hidden = mode !== 'solid';
    $('#noise-row').hidden = mode === 'transparent'; // grain is a no-op there
  };
  bgMode.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    syncSeg(bgMode, 'mode', btn.dataset.mode);
    syncBgVisibility(btn.dataset.mode);
    set('background', { mode: btn.dataset.mode });
  });
  syncBgVisibility(state.background.mode);

  // ── Gradient swatches ──
  const gGrid = $('#gradient-grid');
  for (const g of GRADIENTS) {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.title = g.label + (g.pro ? ' (Pro)' : '');
    b.dataset.id = g.id;
    b.style.background = cssGradient(g);
    if (g.pro) {
      const star = document.createElement('span');
      star.className = 'pro-star';
      star.textContent = '✦';
      b.appendChild(star);
    }
    b.addEventListener('click', () => {
      if (g.pro && !state.pro) {
        toast('✦ Pro background — exports keep the watermark until you unlock Pro', true);
      }
      set('background', { mode: 'gradient', gradientId: g.id });
      syncSeg(bgMode, 'mode', 'gradient');
      syncBgVisibility('gradient');
      markActiveSwatches();
    });
    gGrid.appendChild(b);
  }

  // ── Solid swatches ──
  const sGrid = $('#solid-grid');
  for (const color of SOLIDS) {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.dataset.color = color;
    b.title = color;
    b.style.background = color;
    b.addEventListener('click', () => {
      set('background', { mode: 'solid', solid: color });
      markActiveSwatches();
    });
    sGrid.appendChild(b);
  }
  markActiveSwatches();

  // ── Sliders ──
  bindSlider('#sl-noise', '#out-noise', 'background', 'noise', v => Math.round(v * 100));
  bindSlider('#sl-padding', '#out-padding', 'layout', 'padding', v => Math.round(v));
  bindSlider('#sl-scale', '#out-scale', 'layout', 'scale', v => Math.round(v * 100));
  bindSlider('#sl-radius', '#out-radius', 'layout', 'radius', v => Math.round(v));
  bindSlider('#sl-rotation', '#out-rotation', 'layout', 'rotation', v => v.toFixed(1).replace(/\.0$/, ''));
  bindSlider('#sl-shadow', '#out-shadow', 'layout', 'shadow', v => Math.round(v));
  bindSlider('#sl-offsety', '#out-offsety', 'layout', 'offsetY', v => Math.round(v));

  // ── Frame ──
  const frameType = $('#frame-type');
  syncSeg(frameType, 'frame', state.frame.type);
  const urlInput = $('#frame-url');
  const titleInput = $('#frame-title');
  const syncFrameOpts = () => {
    urlInput.hidden = state.frame.type !== 'browser';
    titleInput.hidden = state.frame.type !== 'macos';
    $('#frame-theme').style.visibility =
      (state.frame.type === 'none') ? 'hidden' : 'visible';
  };
  syncFrameOpts();
  frameType.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    syncSeg(frameType, 'frame', btn.dataset.frame);
    set('frame', { type: btn.dataset.frame });
    syncFrameOpts();
  });

  const frameTheme = $('#frame-theme');
  syncSeg(frameTheme, 'theme', state.frame.theme);
  frameTheme.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    syncSeg(frameTheme, 'theme', btn.dataset.theme);
    set('frame', { theme: btn.dataset.theme });
  });

  urlInput.value = state.frame.url;
  urlInput.addEventListener('input', () => set('frame', { url: urlInput.value }));
  titleInput.value = state.frame.title || '';
  titleInput.addEventListener('input', () => set('frame', { title: titleInput.value }));

  // ── Caption ──
  const heading = $('#text-heading'), sub = $('#text-sub');
  heading.value = state.text.heading; sub.value = state.text.sub;
  heading.addEventListener('input', () => set('text', { heading: heading.value }));
  sub.addEventListener('input', () => set('text', { sub: sub.value }));
  const textPos = $('#text-position');
  syncSeg(textPos, 'pos', state.text.position);
  textPos.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    syncSeg(textPos, 'pos', btn.dataset.pos);
    set('text', { position: btn.dataset.pos });
  });

  // ── Surprise me ──
  let lastPreset = -1;
  $('#btn-surprise').addEventListener('click', () => {
    let i;
    do { i = Math.floor(Math.random() * STYLE_PRESETS.length); } while (i === lastPreset);
    lastPreset = i;
    const p = STYLE_PRESETS[i];
    set('background', { mode: 'gradient', gradientId: p.gradient });
    set('frame', { type: p.frame });
    set('layout', {
      padding: p.padding, radius: p.radius,
      rotation: p.rotation, shadow: p.shadow,
    });
    // reflect in controls
    syncSeg(frameType, 'frame', p.frame);
    syncFrameOpts();
    syncSeg(bgMode, 'mode', 'gradient');
    syncBgVisibility('gradient');
    markActiveSwatches();
    refreshSliders();
  });

  // ── Export ──
  // Remember the user's last output settings across visits (isolated pref;
  // not part of the render state schema).
  const readPref = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
  const writePref = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

  const scaleSel = $('#export-scale');
  const savedScale = readPref('moonshot_export_scale', '2');
  // Don't restore the Pro-only 3× for a free user.
  if (savedScale !== '3' || state.pro) scaleSel.value = savedScale;
  scaleSel.addEventListener('change', () => {
    if (scaleSel.value === '3' && !state.pro) {
      scaleSel.value = '2';
      // Open the modal first: top-layer stacking is insertion-ordered, so
      // the toast must be promoted after the dialog to stay visible.
      openProModal();
      toast('✦ 3× exports are a Pro feature', true);
    }
    writePref('moonshot_export_scale', scaleSel.value);
  });

  const formatSel = $('#export-format');
  formatSel.value = readPref('moonshot_export_format', 'png');
  const syncExportLabel = () => {
    $('#btn-export').textContent =
      `Export ${formatSel.value === 'jpeg' ? 'JPG' : 'PNG'}`;
  };
  formatSel.addEventListener('change', () => {
    writePref('moonshot_export_format', formatSel.value);
    syncExportLabel();
  });
  syncExportLabel();

  $('#btn-export').addEventListener('click', async () => {
    const btn = $('#btn-export');
    btn.disabled = true; btn.textContent = 'Rendering…';
    try {
      const name = await exportImage(+scaleSel.value, formatSel.value);
      toast(`Saved ${name}`);
    } catch (err) {
      toast(err.message || 'Export failed');
    } finally {
      btn.disabled = false; syncExportLabel();
    }
  });

  $('#btn-copy').addEventListener('click', async () => {
    try {
      await copyToClipboard(Math.min(+scaleSel.value, 2));
      toast('Copied to clipboard ✓');
    } catch (err) {
      toast(err.message || 'Copy failed — try Export instead');
    }
  });

  // ── Upload ──
  $('#btn-upload').addEventListener('click', () => $('#file-input').click());

  // ── Pro modal ──
  $('#btn-pro').addEventListener('click', openProModal);
  const modal = $('#pro-modal');

  // Card checkout appears only once Gumroad is wired up.
  const buyBtn = $('#btn-buy');
  if (GUMROAD_URL) { buyBtn.href = GUMROAD_URL; buyBtn.hidden = false; }

  // ETH checkout
  $('#pay-addr').textContent = PAY_ADDRESS;
  $('#btn-copy-addr').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(PAY_ADDRESS);
      $('#btn-copy-addr').textContent = 'Copied ✓';
      setTimeout(() => { $('#btn-copy-addr').textContent = 'Copy'; }, 1600);
    } catch { /* clipboard unavailable — address is selectable */ }
  });
  $('#btn-find-pay').addEventListener('click', async (e) => {
    e.preventDefault();
    const msg = $('#find-msg');
    const btn = $('#btn-find-pay');
    msg.className = 'license-msg';
    msg.textContent = 'Scanning recent payments…';
    btn.disabled = true;
    const result = await findRecentPayment();
    btn.disabled = false;
    if (result.ok) {
      setPro(true, 'eth:auto');
      msg.className = 'license-msg ok';
      msg.textContent = 'Payment found & confirmed ✓ Welcome to Pro.';
      setTimeout(() => modal.close(), 1500);
      toast('✦ Moonshot Pro unlocked — thank you!', true);
    } else {
      msg.className = 'license-msg err';
      msg.textContent = result.reason;
    }
  });

  $('#btn-verify-tx').addEventListener('click', async (e) => {
    e.preventDefault();
    const msg = $('#tx-msg');
    const btn = $('#btn-verify-tx');
    msg.className = 'license-msg';
    msg.textContent = 'Checking the chain…';
    btn.disabled = true;
    const result = await verifyPayment($('#tx-input').value);
    btn.disabled = false;
    if (result.ok) {
      setPro(true, 'eth:' + $('#tx-input').value.trim().toLowerCase());
      msg.className = 'license-msg ok';
      msg.textContent = 'Payment confirmed on-chain ✓ Welcome to Pro.';
      setTimeout(() => modal.close(), 1500);
      toast('✦ Moonshot Pro unlocked — thank you!', true);
    } else {
      msg.className = 'license-msg err';
      msg.textContent = result.reason;
    }
  });
  $('#btn-activate').addEventListener('click', async (e) => {
    e.preventDefault();
    const input = $('#license-input');
    const msg = $('#license-msg');
    msg.className = 'license-msg';
    msg.textContent = 'Checking…';
    const result = await verifyLicense(input.value);
    if (result.ok) {
      setPro(true, input.value.trim());
      msg.className = 'license-msg ok';
      msg.textContent = result.offline
        ? 'Activated ✓ (verified offline)'
        : 'Activated ✓ Welcome to Pro.';
      setTimeout(() => modal.close(), 1200);
      toast('✦ Moonshot Pro unlocked — watermark removed', true);
    } else {
      msg.className = 'license-msg err';
      msg.textContent = result.reason;
    }
  });

  syncProUI();
}

export function openProModal() {
  $('#pro-modal').showModal();
  // Fill the live ETH amount once per open; harmless if it races. Also build
  // an EIP-681 deep-link so mobile users can tap straight into their wallet
  // with the address (and amount) prefilled instead of copy-pasting.
  const walletLink = $('#btn-wallet');
  const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  suggestedEth().then(amount => {
    if (amount) $('#eth-amount').textContent = `${amount} ETH (≈ $29)`;
    if (touch) {
      const wei = amount ? BigInt(Math.round(amount * 1e18)).toString() : '';
      walletLink.href = `ethereum:${PAY_ADDRESS}@1${wei ? `?value=${wei}` : ''}`;
      walletLink.hidden = false;
    }
  }).catch(() => { /* price feeds down — static hint stays */ });
}

export function syncProUI() {
  $('#pro-badge').hidden = !state.pro;
  $('#btn-pro').hidden = state.pro;
}

export function markActiveSwatches() {
  document.querySelectorAll('#gradient-grid .swatch').forEach(b =>
    b.classList.toggle('active',
      state.background.mode === 'gradient' && b.dataset.id === state.background.gradientId));
  document.querySelectorAll('#solid-grid .swatch').forEach(b =>
    b.classList.toggle('active',
      state.background.mode === 'solid' && b.dataset.color === state.background.solid));
}

function bindSlider(slSel, outSel, section, key, format) {
  const sl = $(slSel), out = $(outSel);
  sl.value = state[section][key];
  out.textContent = format(+sl.value);
  sl.addEventListener('input', () => {
    out.textContent = format(+sl.value);
    set(section, { [key]: +sl.value });
  });
}

export function refreshSliders() {
  const map = [
    ['#sl-noise', '#out-noise', state.background.noise, v => Math.round(v * 100)],
    ['#sl-padding', '#out-padding', state.layout.padding, v => Math.round(v)],
    ['#sl-scale', '#out-scale', state.layout.scale, v => Math.round(v * 100)],
    ['#sl-radius', '#out-radius', state.layout.radius, v => Math.round(v)],
    ['#sl-rotation', '#out-rotation', state.layout.rotation, v => v.toFixed(1).replace(/\.0$/, '')],
    ['#sl-shadow', '#out-shadow', state.layout.shadow, v => Math.round(v)],
    ['#sl-offsety', '#out-offsety', state.layout.offsetY, v => Math.round(v)],
  ];
  for (const [slSel, outSel, val, fmt] of map) {
    $(slSel).value = val;
    $(outSel).textContent = fmt(+val);
  }
}
