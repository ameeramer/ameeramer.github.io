// Procedural textures — cork, wood, paper, sticky, tape. Everything is drawn
// on canvas at boot: no image assets, nothing fetched, keeps the "fully local"
// promise and gives the board its tactile, imperfect character.

import * as THREE from '../vendor/three.module.min.js';

// Small deterministic PRNG so the board looks the same every visit.
function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// ── Cork ── layered speckle: base wash, thousands of grain flecks in light and
// dark, a few larger chips, and soft vignetted mottling.
export function corkTexture(size = 1024) {
  const [c, x] = canvas(size, size);
  const rnd = mulberry(1917);
  x.fillStyle = '#a97e52';
  x.fillRect(0, 0, size, size);

  // broad mottle
  for (let i = 0; i < 260; i++) {
    const g = x.createRadialGradient(rnd() * size, rnd() * size, 0, rnd() * size, rnd() * size, 40 + rnd() * 140);
    const tone = rnd() < 0.5 ? '169,126,82' : '154,110,70';
    g.addColorStop(0, `rgba(${tone},${0.05 + rnd() * 0.09})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
  }
  // fine flecks
  for (let i = 0; i < 9000; i++) {
    const s = 0.6 + rnd() * 2.6;
    const dark = rnd() < 0.55;
    x.fillStyle = dark
      ? `rgba(${96 + rnd() * 40},${62 + rnd() * 30},${34 + rnd() * 22},${0.12 + rnd() * 0.25})`
      : `rgba(${205 + rnd() * 30},${170 + rnd() * 30},${120 + rnd() * 30},${0.10 + rnd() * 0.20})`;
    x.beginPath();
    x.ellipse(rnd() * size, rnd() * size, s * (0.7 + rnd()), s, rnd() * Math.PI, 0, Math.PI * 2);
    x.fill();
  }
  // chips
  for (let i = 0; i < 130; i++) {
    x.fillStyle = `rgba(${70 + rnd() * 40},${45 + rnd() * 25},${25 + rnd() * 18},${0.10 + rnd() * 0.18})`;
    x.beginPath();
    const px = rnd() * size, py = rnd() * size, r = 3 + rnd() * 9;
    x.ellipse(px, py, r * (0.6 + rnd() * 0.8), r, rnd() * Math.PI, 0, Math.PI * 2);
    x.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Bump map derived the same way (luminance speckle) so the light rakes across
// real-feeling grain.
export function corkBump(size = 512) {
  const [c, x] = canvas(size, size);
  const rnd = mulberry(1953);
  x.fillStyle = '#808080';
  x.fillRect(0, 0, size, size);
  for (let i = 0; i < 6000; i++) {
    const s = 0.6 + rnd() * 2.2;
    const up = rnd() < 0.5;
    x.fillStyle = up ? `rgba(255,255,255,${0.05 + rnd() * 0.16})` : `rgba(0,0,0,${0.05 + rnd() * 0.16})`;
    x.beginPath();
    x.ellipse(rnd() * size, rnd() * size, s, s * (0.6 + rnd()), rnd() * Math.PI, 0, Math.PI * 2);
    x.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ── Wood ── long-grain streaks for the frame.
export function woodTexture(size = 512) {
  const [c, x] = canvas(size, size);
  const rnd = mulberry(1907);
  const g = x.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, '#4b3320');
  g.addColorStop(0.5, '#5a3d26');
  g.addColorStop(1, '#46301e');
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    const y0 = rnd() * size;
    x.strokeStyle = rnd() < 0.5
      ? `rgba(30,18,10,${0.08 + rnd() * 0.22})`
      : `rgba(120,86,52,${0.06 + rnd() * 0.16})`;
    x.lineWidth = 0.5 + rnd() * 2.2;
    x.beginPath();
    x.moveTo(0, y0);
    for (let px = 0; px <= size; px += 16) {
      x.lineTo(px, y0 + Math.sin(px * 0.02 + i) * (1 + rnd() * 3));
    }
    x.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── Paper grain ── subtle fiber noise reused by photos/cards/notes.
export function paperTexture(base = '#f4efe3', size = 256, seed = 7) {
  const [c, x] = canvas(size, size);
  const rnd = mulberry(seed);
  x.fillStyle = base;
  x.fillRect(0, 0, size, size);
  for (let i = 0; i < 2200; i++) {
    x.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${rnd() * 0.03})` : `rgba(255,255,255,${rnd() * 0.05})`;
    x.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 2, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── Dust mote sprite ── soft radial dot for the floating-dust particle field.
export function dustSprite(size = 64) {
  const [c, x] = canvas(size, size);
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,232,190,0.85)');
  g.addColorStop(0.4, 'rgba(255,225,175,0.25)');
  g.addColorStop(1, 'rgba(255,220,170,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── Yarn strand texture ── faint twisted-fiber stripes wrapped around ropes.
export function yarnTexture(hex = '#b3202a', size = 128) {
  const [c, x] = canvas(size, size);
  x.fillStyle = hex;
  x.fillRect(0, 0, size, size);
  const rnd = mulberry(1929);
  for (let i = 0; i < 46; i++) {
    x.strokeStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.12)';
    x.lineWidth = 0.8 + rnd() * 1.6;
    x.beginPath();
    const off = rnd() * size;
    // diagonal twist lines; texture wraps around the tube circumference
    x.moveTo(-10, off);
    x.lineTo(size + 10, off - size * 0.8);
    x.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
