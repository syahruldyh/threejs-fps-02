// Shared helpers: seeded RNG, math, time format, AABB collision. No per-frame allocation in hot paths.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const fmtTime = (s) => {
  s = Math.max(0, Math.ceil(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};
// Circle (x,z,r) vs AABB {x0,z0,x1,z1}: push out, return true on hit.
export function collideCircle(box, x, z, r) {
  const cx = clamp(x, box.x0, box.x1), cz = clamp(z, box.z0, box.z1);
  const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    return { x: cx + (dx / d) * r, z: cz + (dz / d) * r };
  }
  // Centre inside the box: push out along the smallest penetration axis.
  const pl = x - box.x0 + r, pr = box.x1 - x + r, pt = z - box.z0 + r, pb = box.z1 - z + r;
  const m = Math.min(pl, pr, pt, pb);
  if (m === pl) return { x: box.x0 - r, z };
  if (m === pr) return { x: box.x1 + r, z };
  if (m === pt) return { x, z: box.z0 - r };
  return { x, z: box.z1 + r };
}
export function segHitsCircle(ax, az, bx, bz, cx, cz, r) {
  const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
  let t = len2 ? ((cx - ax) * dx + (cz - az) * dz) / len2 : 0;
  t = clamp(t, 0, 1);
  const px = ax + dx * t - cx, pz = az + dz * t - cz;
  return px * px + pz * pz < r * r;
}
