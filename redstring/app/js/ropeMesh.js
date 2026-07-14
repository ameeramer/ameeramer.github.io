// Rope rendering: each Rope (physics chain) drives a fixed-topology tube whose
// vertices are rewritten in place every frame — no geometry rebuilds. Frames
// are parallel-transported along the chain so the yarn texture doesn't spin,
// radius varies subtly along the length (hand-spun, not machine-perfect), and
// new ropes GROW from pin to pin via an index draw-range sweep.

import * as THREE from '../vendor/three.module.min.js';
import { yarnTexture } from './textures.js';

export const YARN_COLORS = {
  red: '#b3202a', blue: '#27519e', gold: '#c99b2e', black: '#26221e', white: '#ded8ca',
};

const RADIAL = 6;
const BASE_RADIUS = 0.085;

const texCache = new Map();
function yarnMat(colorKey) {
  if (!texCache.has(colorKey)) {
    const hex = YARN_COLORS[colorKey] || YARN_COLORS.red;
    // a touch of emissive keeps yarn reading as *colored yarn* even where the
    // lamp light falls off — otherwise tone mapping crushes it to black thread
    texCache.set(colorKey, new THREE.MeshStandardMaterial({
      map: yarnTexture(hex),
      emissive: new THREE.Color(hex), emissiveIntensity: 0.38,
      roughness: 0.92, metalness: 0,
    }));
    texCache.get(colorKey).map.repeat.set(6, 1);
  }
  return texCache.get(colorKey);
}

const selCache = new Map();
function selectedMat(colorKey) {
  if (!selCache.has(colorKey)) {
    const m = yarnMat(colorKey).clone();
    m.emissiveIntensity = 0.95;
    selCache.set(colorKey, m);
  }
  return selCache.get(colorKey);
}

export class RopeMesh {
  constructor(rope, colorKey = 'red') {
    this.rope = rope;
    const n = rope.n;
    const rings = n;
    const verts = rings * RADIAL;

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(verts * 3), 3);
    this.normAttr = new THREE.BufferAttribute(new Float32Array(verts * 3), 3);
    const uv = new Float32Array(verts * 2);
    const index = [];
    for (let i = 0; i < rings; i++) {
      for (let r = 0; r < RADIAL; r++) {
        uv[(i * RADIAL + r) * 2] = i / (rings - 1) * 6;
        uv[(i * RADIAL + r) * 2 + 1] = r / RADIAL;
      }
    }
    for (let i = 0; i < rings - 1; i++) {
      for (let r = 0; r < RADIAL; r++) {
        const a = i * RADIAL + r, b = i * RADIAL + (r + 1) % RADIAL;
        const c = a + RADIAL, d = b + RADIAL;
        index.push(a, c, b, b, c, d);
      }
    }
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('normal', this.normAttr);
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(index);

    this.mesh = new THREE.Mesh(geo, yarnMat(colorKey));
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;      // vertices move every frame
    this.colorKey = colorKey;

    // per-rope character: slight thickness wobble baked once
    this.radii = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.radii[i] = BASE_RADIUS * (1 + Math.sin(i * 1.7) * 0.10 + Math.sin(i * 0.53 + 2) * 0.07);
    }

    this.growth = 1;                       // 0..1, drawRange sweep
    this._normal = new THREE.Vector3(0, 0, 1);
    this.update(true);
  }

  setColor(colorKey) {
    this.colorKey = colorKey;
    this.mesh.material = this._selected ? selectedMat(colorKey) : yarnMat(colorKey);
  }

  // Selection glow: a per-rope brighter clone so the shared material (and every
  // other rope of this color) stays untouched.
  setSelected(on) {
    this._selected = on;
    this.mesh.material = on ? selectedMat(this.colorKey) : yarnMat(this.colorKey);
  }

  // Nearest distance from a world point to the chain — forgiving hit-testing,
  // because nobody can click a 0.08-unit tube exactly.
  distanceTo(x, y) {
    const P = this.rope.pos;
    let best = Infinity;
    for (let i = 0; i < this.rope.n; i++) {
      const dx = P[i * 3] - x, dy = P[i * 3 + 1] - y;
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  setGrowth(t) {
    this.growth = Math.min(1, Math.max(0, t));
    const rings = this.rope.n;
    const visible = Math.max(1, Math.floor((rings - 1) * this.growth));
    this.mesh.geometry.setDrawRange(0, visible * RADIAL * 6);
  }

  update(force = false) {
    const rope = this.rope;
    if (rope.sleeping && !force && this._sleptDrawn) return;
    this._sleptDrawn = rope.sleeping;

    const n = rope.n, P = rope.pos;
    const pos = this.posAttr.array, nor = this.normAttr.array;
    const tan = new THREE.Vector3(), nrm = this._normal.clone(), bin = new THREE.Vector3();
    const tmp = new THREE.Vector3();

    for (let i = 0; i < n; i++) {
      const k = i * 3;
      // tangent: central difference
      const kp = Math.max(0, i - 1) * 3, kn = Math.min(n - 1, i + 1) * 3;
      tan.set(P[kn] - P[kp], P[kn + 1] - P[kp + 1], P[kn + 2] - P[kp + 2]).normalize();
      // parallel transport: remove tangent component from previous normal
      nrm.sub(tmp.copy(tan).multiplyScalar(nrm.dot(tan))).normalize();
      if (!Number.isFinite(nrm.x) || nrm.lengthSq() < 0.5) nrm.set(0, 0, 1).sub(tmp.copy(tan).multiplyScalar(tan.z)).normalize();
      bin.crossVectors(tan, nrm);

      const R = this.radii[i];
      for (let r = 0; r < RADIAL; r++) {
        const a = (r / RADIAL) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const vi = (i * RADIAL + r) * 3;
        const nx = nrm.x * ca + bin.x * sa;
        const ny = nrm.y * ca + bin.y * sa;
        const nz = nrm.z * ca + bin.z * sa;
        pos[vi] = P[k] + nx * R;
        pos[vi + 1] = P[k + 1] + ny * R;
        pos[vi + 2] = P[k + 2] + nz * R;
        nor[vi] = nx; nor[vi + 1] = ny; nor[vi + 2] = nz;
      }
    }
    this.posAttr.needsUpdate = true;
    this.normAttr.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
  }
}
