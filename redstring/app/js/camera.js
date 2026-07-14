// Camera controller — Figma-feel pan & zoom with inertia, plus an idle
// "breathing" drift so the board never feels frozen.
//
// Pan: drag empty space (or two-finger scroll). Zoom: wheel/pinch dollies the
// camera toward the cursor so what you point at stays put.

import * as THREE from '../vendor/three.module.min.js';

const MIN_Z = 14, MAX_Z = 95;

export class CameraRig {
  constructor(camera, dom) {
    this.cam = camera;
    this.dom = dom;
    this.vel = new THREE.Vector2();
    this.panning = false;
    this.last = new THREE.Vector2();
    this.idleT = Math.random() * 10;
    this.base = camera.position.clone();

    dom.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
  }

  // world-units-per-pixel at the board plane (z=0) for 1:1 hand feel
  unitsPerPixel() {
    const dist = this.cam.position.z;
    const h = 2 * dist * Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2));
    return h / this.dom.clientHeight;
  }

  startPan(x, y) { this.panning = true; this.last.set(x, y); this.vel.set(0, 0); }
  movePan(x, y) {
    if (!this.panning) return;
    const upp = this.unitsPerPixel();
    const dx = (x - this.last.x) * upp, dy = (y - this.last.y) * upp;
    this.cam.position.x -= dx;
    this.cam.position.y += dy;
    this.vel.set(-dx, dy);
    this.last.set(x, y);
  }
  endPan() { this.panning = false; }

  onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      // dolly toward the cursor
      const rect = this.dom.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const dir = new THREE.Vector3(nx, ny, 0.5).unproject(this.cam).sub(this.cam.position).normalize();
      const amt = (e.ctrlKey ? e.deltaY * 0.35 : e.deltaY) * 0.03;
      const next = this.cam.position.clone().addScaledVector(dir, -amt);
      next.z = THREE.MathUtils.clamp(next.z, MIN_Z, MAX_Z);
      // keep x/y proportional to the clamped dolly so cursor-anchoring holds
      if (next.z !== this.cam.position.z) this.cam.position.copy(next);
    } else {
      const upp = this.unitsPerPixel();
      this.cam.position.x += e.deltaX * upp * 0.9;
      this.cam.position.y -= e.deltaY * upp * 0.9;
    }
    this.clampPan();
  }

  clampPan() {
    this.cam.position.x = THREE.MathUtils.clamp(this.cam.position.x, -40, 40);
    this.cam.position.y = THREE.MathUtils.clamp(this.cam.position.y, -26, 26);
  }

  update(dt) {
    // pan inertia
    if (!this.panning && this.vel.lengthSq() > 1e-8) {
      this.cam.position.x += this.vel.x;
      this.cam.position.y += this.vel.y;
      this.vel.multiplyScalar(0.90);
      this.clampPan();
    }
    // idle breathing — a few millimetres of drift, imperceptible until you look
    this.idleT += dt;
    const b = 0.05;
    this.cam.rotation.z = Math.sin(this.idleT * 0.23) * 0.0016;
    this.cam.position.z += Math.sin(this.idleT * 0.31) * b * dt;
  }
}
