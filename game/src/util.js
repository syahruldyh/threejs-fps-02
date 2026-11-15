// util.js — one job: deterministic randomness and small math helpers shared
// by every system. No allocations in the hot paths: callers pass scratch
// objects in and read results out of them.

export function mulberry32(initial) {
  let a = initial >>> 0;
  return function random() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
// Frame-rate independent approach: how far value moves toward target in dt.
export const damp = (v, target, rate, dt) => lerp(v, target, 1 - Math.exp(-rate * dt));
export const TAU = Math.PI * 2;

// Wrap an angle to [-PI, PI].
export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

// Segment (p0->p1) vs axis-aligned box {min:{x,y,z}, max:{x,y,z}}.
// Returns the hit distance along the segment in [0,1], or -1. Slab method.
export function segBox(p0, p1, b) {
  const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
  let t0 = 0, t1 = 1;
  const axes = [['x', dx, b.min.x, b.max.x], ['y', dy, b.min.y, b.max.y], ['z', dz, b.min.z, b.max.z]];
  for (let i = 0; i < 3; i++) {
    const o = axes[i][0], d = axes[i][1], mn = axes[i][2], mx = axes[i][3];
    const origin = p0[o];
    if (Math.abs(d) < 1e-9) {
      if (origin < mn || origin > mx) return -1;
    } else {
      let ta = (mn - origin) / d, tb = (mx - origin) / d;
      if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return -1;
    }
  }
  return t0;
}

// Does segment p0->p1 hit any box in list? Returns {t, box} of the nearest.
export function segBoxes(p0, p1, boxes, out) {
  let best = -1, bestBox = null;
  for (let i = 0; i < boxes.length; i++) {
    const t = segBox(p0, p1, boxes[i]);
    if (t >= 0 && (best < 0 || t < best)) { best = t; bestBox = boxes[i]; }
  }
  out.t = best; out.box = bestBox;
  return best >= 0;
}

// Point-in-box test (for smoke / site checks).
export function pointInBox(p, b) {
  return p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y && p.z >= b.min.z && p.z <= b.max.z;
}

// Segment vs sphere (smoke puffs): true when the segment passes within r.
export function segSphere(p0, p1, c, r) {
  const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
  const len2 = dx * dx + dy * dy + dz * dz;
  let t = len2 > 0 ? ((c.x - p0.x) * dx + (c.y - p0.y) * dy + (c.z - p0.z) * dz) / len2 : 0;
  t = clamp(t, 0, 1);
  const cx = p0.x + dx * t - c.x, cy = p0.y + dy * t - c.y, cz = p0.z + dz * t - c.z;
  return cx * cx + cy * cy + cz * cz < r * r;
}
