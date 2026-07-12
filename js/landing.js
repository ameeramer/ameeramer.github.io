// Live hero demo — renders through the actual product pipeline, cycling
// tasteful preset combinations. The marketing image IS the product output.

import { render } from '../app/js/renderer.js';
import { makeSampleImage } from '../app/js/sample.js';

const canvas = document.getElementById('hero-canvas');
const caption = document.getElementById('demo-caption');

const LOOKS = [
  { gradientId: 'lunar-gold',   frame: 'macos',   label: 'Lunar Gold · macOS frame',   rotation: 0,  padding: 64 },
  { gradientId: 'deep-space',   frame: 'browser', label: 'Deep Space · browser frame', rotation: -2, padding: 80 },
  { gradientId: 'aurora',       frame: 'macos',   label: 'Aurora · macOS frame',       rotation: 2,  padding: 72 },
  { gradientId: 'porcelain',    frame: 'browser', label: 'Porcelain · light frame',    rotation: 0,  padding: 76 },
  { gradientId: 'ember',        frame: 'macos',   label: 'Ember · macOS frame',        rotation: -1.5, padding: 68 },
  { gradientId: 'midnight-oil', frame: 'browser', label: 'Midnight Oil · browser',     rotation: 1.5, padding: 84 },
];

const sample = makeSampleImage();

function stateFor(look) {
  return {
    image: sample,
    imageMeta: { w: sample.width, h: sample.height, name: 'demo' },
    canvas: { preset: 'custom', w: 1400, h: 820 },
    background: { mode: 'gradient', gradientId: look.gradientId, solid: '#111', noise: 0.1 },
    frame: {
      type: look.frame,
      theme: look.gradientId === 'porcelain' ? 'light' : 'dark',
      url: 'moonshot.app',
    },
    layout: {
      padding: look.padding, scale: 1, radius: 12,
      rotation: look.rotation, shadow: 60, offsetY: 0,
    },
    text: { heading: '', sub: '', position: 'top', color: 'auto' },
    pro: true, // hero shows Pro-quality output (no watermark)
  };
}

let i = 0;
function paint() {
  const look = LOOKS[i % LOOKS.length];
  render(stateFor(look), canvas, Math.min(window.devicePixelRatio || 1, 1.5));
  caption.textContent = look.label;
}

paint();
if (document.fonts?.ready) document.fonts.ready.then(paint);

setInterval(() => {
  i++;
  canvas.style.opacity = '0';
  setTimeout(() => {
    paint();
    canvas.style.opacity = '1';
  }, 260);
}, 3600);
