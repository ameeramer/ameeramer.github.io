// Verlet rope solver — the physical heart of Redstring. Pure math, no DOM,
// no Three.js: each rope is a chain of particles integrated with Verlet and
// bound by distance constraints, endpoints pinned to evidence pins. Slack
// above the straight-line distance is what makes a rope sag like real yarn.
//
// Coordinates are the board's world space (x right, y up, z out of the cork).
// Ropes live just above the cork surface; a soft "z cushion" keeps them from
// clipping into the board while still letting them swing.

export const ROPE_DEFAULTS = {
  particles: 48,        // chain length — 40-100 per the design
  slack: 1.18,          // restLength = straightDistance * slack → natural sag
  gravity: -22,         // world units/s² (board is ~44 units wide)
  damping: 0.985,       // per-step velocity retention — yarn settles, not bounces
  iterations: 5,        // constraint relaxation passes per step
  zLift: 0.55,          // resting height of rope over the cork
  zCushion: 0.18,       // minimum height — soft floor so yarn never clips
  sleepVel: 0.0004,     // below this mean movement the rope naps
  wakeImpulse: 0.02,    // endpoint movement that wakes a sleeping rope
};

export class Rope {
  constructor(a, b, opts = {}) {
    const o = { ...ROPE_DEFAULTS, ...opts };
    this.o = o;
    this.n = Math.max(8, o.particles | 0);
    this.pos = new Float64Array(this.n * 3);
    this.prev = new Float64Array(this.n * 3);
    this.pinA = [...a];
    this.pinB = [...b];
    this.sleeping = false;
    this._sleepFrames = 0;

    // Lay the chain along the segment with a slight initial droop so the
    // first frames already read as "yarn", not "laser".
    const straight = dist(a, b);
    this.restSeg = (straight * o.slack) / (this.n - 1);
    for (let i = 0; i < this.n; i++) {
      const t = i / (this.n - 1);
      const x = a[0] + (b[0] - a[0]) * t;
      const y = a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * straight * 0.08;
      const z = o.zLift;
      this.pos.set([x, y, z], i * 3);
      this.prev.set([x, y, z], i * 3);
    }
  }

  // Move an endpoint (pin follows its evidence item). Wakes the rope if the
  // move is more than a tremor.
  setPinA(p) { this._movePin(this.pinA, p); }
  setPinB(p) { this._movePin(this.pinB, p); }
  _movePin(pin, p) {
    const d = Math.abs(pin[0] - p[0]) + Math.abs(pin[1] - p[1]) + Math.abs(pin[2] - p[2]);
    pin[0] = p[0]; pin[1] = p[1]; pin[2] = p[2];
    if (d > this.o.wakeImpulse) this.wake();
  }

  // Re-derive segment rest length after an endpoint jump (drag ended far away)
  // so the rope relaxes to a natural drape instead of a violin string.
  retension() {
    const straight = dist(this.pinA, this.pinB);
    this.restSeg = (straight * this.o.slack) / (this.n - 1);
    this.wake();
  }

  wake() { this.sleeping = false; this._sleepFrames = 0; }

  step(dt) {
    if (this.sleeping) {
      // pins may drift even while asleep — keep endpoints glued
      this.pos.set(this.pinA, 0);
      this.pos.set(this.pinB, (this.n - 1) * 3);
      return;
    }
    const { gravity, damping, iterations, zCushion, zLift } = this.o;
    const dt2 = dt * dt;
    let movement = 0;

    // Verlet integration
    for (let i = 0; i < this.n; i++) {
      const k = i * 3;
      const x = this.pos[k], y = this.pos[k + 1], z = this.pos[k + 2];
      let vx = (x - this.prev[k]) * damping;
      let vy = (y - this.prev[k + 1]) * damping;
      let vz = (z - this.prev[k + 2]) * damping;
      this.prev[k] = x; this.prev[k + 1] = y; this.prev[k + 2] = z;
      this.pos[k] = x + vx;
      this.pos[k + 1] = y + vy + gravity * dt2;
      // yarn is pushed gently back toward its lift height — reads as the pin
      // holding it a hair off the cork
      this.pos[k + 2] = z + vz + (zLift - z) * 0.02;
      movement += Math.abs(vx) + Math.abs(vy) + Math.abs(vz);
    }

    // Constraints: endpoints pinned, neighbors at restSeg, soft z floor.
    for (let it = 0; it < iterations; it++) {
      this.pos.set(this.pinA, 0);
      this.pos.set(this.pinB, (this.n - 1) * 3);
      for (let i = 0; i < this.n - 1; i++) {
        const k = i * 3, j = k + 3;
        const dx = this.pos[j] - this.pos[k];
        const dy = this.pos[j + 1] - this.pos[k + 1];
        const dz = this.pos[j + 2] - this.pos[k + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
        const diff = (d - this.restSeg) / d * 0.5;
        const ox = dx * diff, oy = dy * diff, oz = dz * diff;
        // interior particles share the correction; pinned ends absorb none
        if (i > 0) { this.pos[k] += ox; this.pos[k + 1] += oy; this.pos[k + 2] += oz; }
        if (i < this.n - 2) { this.pos[j] -= ox; this.pos[j + 1] -= oy; this.pos[j + 2] -= oz; }
      }
      for (let i = 0; i < this.n; i++) {
        const kz = i * 3 + 2;
        if (this.pos[kz] < zCushion) this.pos[kz] = zCushion;
      }
    }
    this.pos.set(this.pinA, 0);
    this.pos.set(this.pinB, (this.n - 1) * 3);

    // Sleep bookkeeping — a settled rope costs nothing.
    if (movement / this.n < this.o.sleepVel) {
      if (++this._sleepFrames > 30) this.sleeping = true;
    } else {
      this._sleepFrames = 0;
    }
  }

  // Mean squared constraint error — used by tests to prove convergence.
  constraintError() {
    let err = 0;
    for (let i = 0; i < this.n - 1; i++) {
      const k = i * 3, j = k + 3;
      const d = Math.hypot(this.pos[j] - this.pos[k], this.pos[j + 1] - this.pos[k + 1], this.pos[j + 2] - this.pos[k + 2]);
      err += (d - this.restSeg) ** 2;
    }
    return err / (this.n - 1);
  }

  // Lowest point of the chain (sag proof) and total kinetic proxy (settle proof).
  lowestY() {
    let m = Infinity;
    for (let i = 0; i < this.n; i++) m = Math.min(m, this.pos[i * 3 + 1]);
    return m;
  }
  kinetic() {
    let e = 0;
    for (let i = 0; i < this.n * 3; i++) e += (this.pos[i] - this.prev[i]) ** 2;
    return e;
  }
}

function dist(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}
