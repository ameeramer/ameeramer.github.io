// Evidence items. Every item is a true 3D object: a gently curled paper mesh
// with a canvas-drawn face (photo print, sticky note, index card, newspaper
// clipping, fingerprint card), pinned to the cork with a metallic push-pin.
// The pin head is where ropes attach.

import * as THREE from '../vendor/three.module.min.js';
import { paperTexture } from './textures.js';

const PIN_COLORS = { red: '#c22a2a', blue: '#2a52c2', yellow: '#e0b41f', black: '#2c2c2e', white: '#f0ede6' };

// Deterministic per-item jitter so layouts look hand-pinned, not machine-laid.
function jitter(seed) {
  let s = 0;
  for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) | 0;
  const r = () => { s = (s * 1103515245 + 12345) | 0; return ((s >>> 8) % 1000) / 1000; };
  return { rot: (r() - 0.5) * 0.09, curl: 0.35 + r() * 0.5, lift: r() };
}

// ── Paper mesh: plane with a soft cylindrical bend + corner lift ──
function paperMesh(w, h, faceTex, { curl = 0.5, back = '#e8e2d2' } = {}) {
  const geo = new THREE.PlaneGeometry(w, h, 16, 16);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (w / 2);   // -1..1
    const y = p.getY(i) / (h / 2);
    // gentle horizontal bow + bottom-corner lift, like paper that lived in a file
    const z = (1 - x * x) * 0.06 * curl + Math.max(0, -y) * Math.max(0, Math.abs(x) - 0.5) * 0.10 * curl;
    p.setZ(i, z);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.85, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = mesh.receiveShadow = true;
  // slim backing so edge-on views read as card stock, not zero-width film
  const backMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ color: back, roughness: 1 })
  );
  backMesh.rotation.y = Math.PI;
  backMesh.position.z = -0.012;
  mesh.add(backMesh);
  return mesh;
}

// ── Push-pin: shaft + dome head, PBR metal/plastic ──
function pushPin(colorKey = 'red') {
  const g = new THREE.Group();
  const needle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.015, 0.7, 8),
    new THREE.MeshStandardMaterial({ color: '#c8c8cc', metalness: 0.9, roughness: 0.25 })
  );
  needle.rotation.x = Math.PI / 2;
  needle.position.z = 0.1;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 20, 16),
    new THREE.MeshStandardMaterial({
      color: PIN_COLORS[colorKey] || PIN_COLORS.red,
      metalness: 0.15, roughness: 0.3,
    })
  );
  head.position.z = 0.48;
  head.castShadow = true;
  g.add(needle, head);
  g.userData.head = head;
  return g;
}

// ══ Canvas face painters ══════════════════════════════════════════════
function ctx2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function grain(x, w, h, n = 500, a = 0.04) {
  for (let i = 0; i < n; i++) {
    x.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${Math.random() * a})` : `rgba(255,255,255,${Math.random() * a})`;
    x.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
  }
}
function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Photo print: white border, the image, gloss streak, pin shadow at top.
export function photoFace(img, W = 560, label = '') {
  const aspect = img ? img.height / img.width : 0.75;
  const H = Math.round(W * Math.min(1.4, Math.max(0.55, aspect))) + 76;
  const [c, x] = ctx2d(W, H);
  x.fillStyle = '#f6f3ea';
  x.fillRect(0, 0, W, H);
  const m = 22, iw = W - m * 2, ih = H - m * 2 - 54;
  if (img) {
    // cover-fit
    const s = Math.max(iw / img.width, ih / img.height);
    const sw = iw / s, sh = ih / s;
    x.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, m, m, iw, ih);
  } else {
    x.fillStyle = '#494540';
    x.fillRect(m, m, iw, ih);
  }
  // faint gloss diagonal
  const gl = x.createLinearGradient(0, 0, W, H);
  gl.addColorStop(0.32, 'rgba(255,255,255,0)');
  gl.addColorStop(0.44, 'rgba(255,255,255,0.10)');
  gl.addColorStop(0.5, 'rgba(255,255,255,0)');
  x.fillStyle = gl;
  x.fillRect(m, m, iw, ih);
  if (label) {
    x.fillStyle = '#3a372f';
    x.font = '30px Caveat, cursive';
    x.textAlign = 'center';
    x.fillText(label.slice(0, 40), W / 2, H - 24);
  }
  grain(x, W, H, 350, 0.03);
  return { texture: tex(c), aspect: H / W };
}

// Sticky note with a folded corner.
export function stickyFace(text, color = '#f7e06e', W = 420) {
  const [c, x] = ctx2d(W, W);
  x.fillStyle = color;
  x.fillRect(0, 0, W, W);
  const shade = x.createLinearGradient(0, 0, 0, W);
  shade.addColorStop(0, 'rgba(255,255,255,0.14)');
  shade.addColorStop(1, 'rgba(0,0,0,0.07)');
  x.fillStyle = shade;
  x.fillRect(0, 0, W, W);
  // folded corner (bottom-right)
  x.fillStyle = 'rgba(0,0,0,0.10)';
  x.beginPath(); x.moveTo(W, W - 64); x.lineTo(W, W); x.lineTo(W - 64, W); x.closePath(); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.55)';
  x.beginPath(); x.moveTo(W, W - 64); x.lineTo(W - 64, W); x.lineTo(W - 58, W - 58); x.closePath(); x.fill();
  // handwriting
  x.fillStyle = '#2f2a18';
  x.font = '44px Caveat, cursive';
  x.textAlign = 'left';
  wrap(x, text, 30, 72, W - 60, 50);
  grain(x, W, W, 260, 0.03);
  return { texture: tex(c), aspect: 1 };
}

// Index card — typed, red top rule, for suspects/locations/notes.
export function cardFace(title, body, kind = 'NOTE', W = 620) {
  const H = Math.round(W * 0.64);
  const [c, x] = ctx2d(W, H);
  x.fillStyle = '#f4efe1';
  x.fillRect(0, 0, W, H);
  // ruled lines
  x.strokeStyle = 'rgba(90,120,160,0.25)';
  x.lineWidth = 2;
  for (let y = 120; y < H - 20; y += 44) { x.beginPath(); x.moveTo(24, y); x.lineTo(W - 24, y); x.stroke(); }
  x.strokeStyle = 'rgba(190,60,50,0.55)';
  x.beginPath(); x.moveTo(24, 76); x.lineTo(W - 24, 76); x.stroke();
  // kind stamp
  x.fillStyle = 'rgba(170,40,35,0.75)';
  x.font = '26px "Special Elite", monospace';
  x.textAlign = 'right';
  x.fillText(kind.toUpperCase().slice(0, 12), W - 28, 46);
  // title — measured so it never runs under the stamp
  x.fillStyle = '#242018';
  x.textAlign = 'left';
  x.font = '40px "Special Elite", monospace';
  let t = title;
  const maxTitleW = W - 28 - 180;
  while (t.length > 3 && x.measureText(t).width > maxTitleW) t = t.slice(0, -1);
  x.fillText(t.length < title.length ? t.trimEnd() + '…' : t, 28, 52);
  x.font = '28px "Special Elite", monospace';
  x.fillStyle = '#3a352b';
  wrap(x, body, 28, 112, W - 56, 44);
  grain(x, W, H, 320, 0.035);
  return { texture: tex(c), aspect: H / W };
}

// Newspaper clipping — headline + faux column text, torn edges.
export function clippingFace(headline, W = 560) {
  const H = Math.round(W * 1.18);
  const [c, x] = ctx2d(W, H);
  x.fillStyle = '#e9e2cd';
  x.fillRect(0, 0, W, H);
  // torn edge (top + bottom): jagged white notches
  x.fillStyle = '#17120d';
  for (let px = 0; px < W; px += 12) {
    const nick = Math.random() * 8;
    x.fillRect(px, 0, 12, nick);
    x.fillRect(px, H - Math.random() * 8, 12, 8);
  }
  x.fillStyle = '#1e1a12';
  x.font = `bold 52px Georgia, serif`;
  x.textAlign = 'left';
  wrap(x, headline, 26, 78, W - 52, 56);
  // faux columns
  x.fillStyle = 'rgba(40,35,25,0.75)';
  const colW = (W - 78) / 2;
  for (let col = 0; col < 2; col++) {
    const cx = 26 + col * (colW + 26);
    for (let y = 210; y < H - 40; y += 14) {
      x.fillRect(cx, y, colW * (0.72 + Math.random() * 0.28), 6);
    }
  }
  grain(x, W, H, 420, 0.05);
  return { texture: tex(c), aspect: H / W };
}

// Fingerprint card — procedural concentric whorls with breaks.
export function fingerprintFace(label = 'PRINT #1', W = 460) {
  const H = Math.round(W * 1.22);
  const [c, x] = ctx2d(W, H);
  x.fillStyle = '#f2ede0';
  x.fillRect(0, 0, W, H);
  x.strokeStyle = '#5b544a';
  x.lineWidth = 3;
  x.strokeRect(14, 14, W - 28, H - 28);
  const cx = W / 2, cy = H / 2 - 20;
  x.strokeStyle = 'rgba(30,26,20,0.82)';
  x.lineWidth = 3.4;
  for (let r = 8; r < W * 0.34; r += 8.5) {
    const gaps = 2 + (r / 20 | 0);
    for (let seg = 0; seg < gaps; seg++) {
      const a0 = (seg / gaps) * Math.PI * 2 + r * 0.13;
      const a1 = a0 + (Math.PI * 2 / gaps) * (0.55 + Math.random() * 0.3);
      x.beginPath();
      x.ellipse(cx, cy, r * (1 + Math.sin(r) * 0.05), r * 0.82, 0.3, a0, a1);
      x.stroke();
    }
  }
  x.fillStyle = '#8c2f28';
  x.font = '30px "Special Elite", monospace';
  x.textAlign = 'center';
  x.fillText(label.slice(0, 20), W / 2, H - 40);
  grain(x, W, H, 260, 0.04);
  return { texture: tex(c), aspect: H / W };
}

function wrap(x, text, left, top, maxW, lineH) {
  const words = String(text || '').split(/\s+/);
  let line = '', y = top;
  for (const w of words) {
    const probe = line ? line + ' ' + w : w;
    if (x.measureText(probe).width > maxW && line) {
      x.fillText(line, left, y);
      line = w; y += lineH;
      if (y > top + lineH * 7) { x.fillText(line + '…', left, y); return; }
    } else line = probe;
  }
  if (line) x.fillText(line, left, y);
}

// ══ Item factory ══════════════════════════════════════════════════════
// data: { id, type, x, y, rot?, pin?, text?, title?, body?, kind?, img? (dataURL), label? }
const WIDTHS = { photo: 7.4, sticky: 4.4, card: 7.0, clipping: 5.8, fingerprint: 4.6 };

export async function createItem(data) {
  let face;
  if (data.type === 'photo') {
    const img = data.img ? await loadImage(data.img) : null;
    face = photoFace(img, 560, data.label || '');
  } else if (data.type === 'sticky') {
    face = stickyFace(data.text || '', data.color || '#f7e06e');
  } else if (data.type === 'clipping') {
    face = clippingFace(data.title || 'HEADLINE MISSING');
  } else if (data.type === 'fingerprint') {
    face = fingerprintFace(data.label || 'PRINT');
  } else {
    face = cardFace(data.title || 'Untitled', data.body || '', data.kind || 'note');
  }

  const w = WIDTHS[data.type] || 6;
  const h = w * face.aspect;
  const j = jitter(data.id);
  const group = new THREE.Group();

  const paper = paperMesh(w, h, face.texture, { curl: j.curl });
  group.add(paper);

  const pin = pushPin(data.pin || 'red');
  pin.position.set(0, h / 2 - 0.35, 0.14);
  group.add(pin);

  group.position.set(data.x, data.y, 0.30 + j.lift * 0.05);
  group.rotation.z = data.rot != null ? data.rot : j.rot;

  const item = {
    id: data.id, type: data.type, data, group, w, h,
    baseZ: group.position.z,
    hover: 0,            // animated 0..1 by interact.js
    // world position of the pin head — rope endpoints live here
    pinWorld() {
      const v = new THREE.Vector3();
      pin.userData.head.getWorldPosition(v);
      return [v.x, v.y, v.z];
    },
    setEmissive(on) {
      paper.material.emissive = new THREE.Color(on ? '#5a4a1a' : '#000000');
      paper.material.emissiveIntensity = on ? 0.35 : 0;
    },
    dispose() {
      face.texture.dispose();
      paper.geometry.dispose();
      paper.material.dispose();
    },
  };
  group.userData.item = item;
  return item;
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}
