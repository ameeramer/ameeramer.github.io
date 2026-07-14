// Interaction: hover lifts a card toward the lamp, dragging tows it with
// inertia and a tilt into the direction of motion, clicking selects, and
// connect-mode chains two pin clicks into a new rope. Empty cork pans the
// camera. All position math happens on the board plane (z≈0).

import * as THREE from '../vendor/three.module.min.js';

export class Interact {
  constructor({ dom, camera, rig, items, callbacks }) {
    this.dom = dom;
    this.camera = camera;
    this.rig = rig;
    this.items = items;                   // Map id → item instance
    this.cb = callbacks;                  // {onMoveEnd, onSelect, onConnectPick, onEdit, isConnectMode}
    this.ray = new THREE.Raycaster();
    this.ptr = new THREE.Vector2();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.3);
    this.drag = null;                     // {item, off, vx, vy, lastX, lastY, moved}
    this.hovered = null;
    this.selected = null;

    dom.addEventListener('pointerdown', e => this.down(e));
    dom.addEventListener('pointermove', e => this.move(e));
    addEventListener('pointerup', e => this.up(e));
    dom.addEventListener('dblclick', e => this.dbl(e));
  }

  worldAt(e) {
    const r = this.dom.getBoundingClientRect();
    this.ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ptr, this.camera);
    const v = new THREE.Vector3();
    this.ray.ray.intersectPlane(this.plane, v);
    return v;
  }

  pick(e) {
    this.worldAt(e); // refreshes this.ray
    const groups = [...this.items.values()].map(i => i.group);
    const hits = this.ray.intersectObjects(groups, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.item) o = o.parent;
      if (o) return o.userData.item;
    }
    return null;
  }

  down(e) {
    if (e.button !== 0) return;
    const item = this.pick(e);
    if (this.cb.isConnectMode()) {
      if (item) this.cb.onConnectPick(item);
      return;
    }
    if (item) {
      const w = this.worldAt(e);
      this.drag = {
        item, moved: false,
        off: new THREE.Vector2(item.group.position.x - w.x, item.group.position.y - w.y),
        vx: 0, vy: 0, lastX: w.x, lastY: w.y,
      };
      this.dom.style.cursor = 'grabbing';
    } else {
      this.rig.startPan(e.clientX, e.clientY);
      this.dom.style.cursor = 'grabbing';
    }
  }

  move(e) {
    if (this.drag) {
      const w = this.worldAt(e);
      const d = this.drag;
      d.target = { x: w.x + d.off.x, y: w.y + d.off.y };
      d.vx = w.x - d.lastX; d.vy = w.y - d.lastY;
      d.lastX = w.x; d.lastY = w.y;
      if (Math.abs(d.vx) + Math.abs(d.vy) > 0.01) d.moved = true;
      return;
    }
    if (this.rig.panning) { this.rig.movePan(e.clientX, e.clientY); return; }
    // hover (only when idle)
    const item = this.pick(e);
    if (item !== this.hovered) {
      this.hovered = item;
      this.dom.style.cursor = item ? 'grab' : 'default';
    }
  }

  up() {
    if (this.drag) {
      const d = this.drag;
      if (!d.moved) this.select(d.item);
      else {
        // the tow-lerp is cosmetic lag — the *logical* drop point is where the
        // hand let go, so a fast flick doesn't strand the card mid-flight
        if (d.target) d.item.group.position.set(d.target.x, d.target.y, d.item.group.position.z);
        this.cb.onMoveEnd(d.item);
      }
      this.drag = null;
    }
    this.rig.endPan();
    this.dom.style.cursor = 'default';
  }

  dbl(e) {
    const item = this.pick(e);
    if (item) this.cb.onEdit(item);
  }

  select(item) {
    if (this.selected) this.selected.setEmissive(false);
    this.selected = item === this.selected ? null : item;
    if (this.selected) this.selected.setEmissive(true);
    this.cb.onSelect(this.selected);
  }

  clearSelection() {
    if (this.selected) this.selected.setEmissive(false);
    this.selected = null;
    this.cb.onSelect(null);
  }

  // called each frame: drag towing + hover/settle animation
  update(dt) {
    for (const item of this.items.values()) {
      const g = item.group;
      const isDragged = this.drag?.item === item;
      const isHover = this.hovered === item || isDragged;

      // hover amount eases toward target
      item.hover += ((isHover ? 1 : 0) - item.hover) * Math.min(1, dt * 8);
      g.position.z = item.baseZ + item.hover * 0.9;

      if (isDragged && this.drag.target) {
        const t = this.drag.target;
        // tow with lag — the paper trails the hand slightly
        g.position.x += (t.x - g.position.x) * Math.min(1, dt * 14);
        g.position.y += (t.y - g.position.y) * Math.min(1, dt * 14);
        // tilt into the motion
        const targetRot = THREE.MathUtils.clamp(-this.drag.vx * 0.55, -0.22, 0.22);
        g.rotation.z += (targetRot + (item.data.rot ?? 0) - g.rotation.z) * Math.min(1, dt * 10);
      } else {
        // settle back to resting rotation
        const rest = item.data.rot ?? 0;
        g.rotation.z += (rest - g.rotation.z) * Math.min(1, dt * 6);
      }
    }
  }
}
