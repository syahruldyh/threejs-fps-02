// weapon.js — one job: guns and grenades. Every weapon is a row in WEAPONS:
// damage, headshot rule, rate, magazine, spread, price. Firing is hitscan
// with a spread cone that grows while moving or firing and shrinks while
// still or crouched, so stopping to aim pays. Grenades are thrown
// projectiles with gravity and bounce; smoke blocks sight, HE hurts.

import * as THREE from 'three';
import { clamp, segBox, segBoxes } from './util.js';
import { eyePos, hurt, addRecoil } from './player.js';

export const WEAPONS = {
  wren:   { name: 'Wren-9',   slot: 2, price: 0,    dmg: 28, auto: false, interval: 0.28, mag: 12, reserve: 36, reload: 1.3, spread: 0.011, bloom: 0.010, kick: 0.011, falloff: 26, desc: 'reliable sidearm' },
  shiv:   { name: 'Shiv SMG', slot: 3, price: 1200, dmg: 24, auto: true,  interval: 0.08, mag: 32, reserve: 96, reload: 1.9, spread: 0.017, bloom: 0.011, kick: 0.009, falloff: 18, desc: 'close-quarters shredder' },
  lancer: { name: 'Lancer AR', slot: 1, price: 2500, dmg: 32, auto: true,  interval: 0.10, mag: 30, reserve: 90, reload: 2.2, spread: 0.010, bloom: 0.012, kick: 0.013, falloff: 30, desc: 'the all-rounder' },
  boomstick: { name: 'Boomstick-8', slot: 5, price: 1150, dmg: 14, pellets: 6, auto: false, interval: 0.85, mag: 8, reserve: 32, reload: 2.4, spread: 0.030, bloom: 0.022, kick: 0.045, falloff: 14, desc: 'room clearer, six pellets' },
  napier: { name: 'Napier DMR', slot: 4, price: 3500, dmg: 78, auto: false, interval: 0.75, mag: 10, reserve: 30, reload: 2.6, spread: 0.004, bloom: 0.020, kick: 0.035, falloff: 60, zoom: true, desc: 'long-lane marksman' },
  mule:   { name: 'Mule-60 LMG', slot: 6, price: 3600, dmg: 26, auto: true, interval: 0.09, mag: 60, reserve: 120, reload: 3.4, spread: 0.016, bloom: 0.008, kick: 0.012, falloff: 26, desc: 'a hundred rounds of suppression' },
};

export const GRENADES = {
  charge: { name: 'Charge HE', price: 300, radius: 6, dmg: 90, fuse: 1.8, desc: 'burst damage through a doorway' },
  smoke:  { name: 'Smoke', price: 250, radius: 4.5, fuse: 1.6, smoke: true, desc: 'a wall that breaks sight lines' },
  flash:  { name: 'Sunset Flash', price: 200, radius: 25, fuse: 1.4, flash: true, desc: 'blinds anyone looking at it' },
  molotov: { name: 'Ember Jar', price: 400, radius: 3, fuse: 1.2, molotov: true, desc: 'a pool of fire that denies ground' },
  decoy:  { name: 'Decoy Whistle', price: 150, radius: 30, fuse: 1.0, decoy: true, desc: 'fake gunfire that pulls rotations' },
};

// One fighter's loadout: owned weapons, current, ammo, bloom, grenades.
export function createLoadout() {
  return {
    owned: { wren: true },
    current: 'wren',
    mag: { wren: 12 },
    reserve: { wren: 36 },
    grenades: { charge: 0, smoke: 0, flash: 0, molotov: 0, decoy: 0 },
    reloading: 0, lastShot: -9, bloom: 0, scoped: false,
    throwAnim: 0, armourBought: false, helmetBought: false,
  };
}

export function buyWeapon(load, id, funds) {
  const def = WEAPONS[id];
  if (!def || load.owned[id] || funds < def.price) return funds;
  load.owned[id] = true;
  load.mag[id] = def.mag; load.reserve[id] = def.reserve;
  load.current = id;
  return funds - def.price;
}

export function buyGrenade(load, id, funds) {
  const def = GRENADES[id];
  if (!def || funds < def.price || load.grenades[id] >= 2) return funds;
  load.grenades[id]++;
  return funds - def.price;
}

// Current spread (radians) for a fighter standing/moving/crouched/airborne.
export function spreadOf(load, def, speed, crouch, airborne, scoped) {
  let s = def.spread + load.bloom;
  s *= 1 + speed * 0.28;
  if (crouch) s *= 0.7;
  if (airborne) s *= 1.8;
  if (scoped) s *= 0.45;
  return s;
}

const _dir = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _end = new THREE.Vector3();
const _hp = new THREE.Vector3();
const _hit = { t: -1, box: null };

// Fire one hitscan shot. ctx: {world, fighters, self, rng, time, onHit,
// onKill, tracer, sound}. Returns 'shot' | 'dry' | 'reload' | 'wait'.
// A weapon with `pellets` (the Boomstick) fires that many rays per shot,
// each with its own spread jitter — a real spread, not a slug.
export function fire(load, fighter, ctx) {
  const def = WEAPONS[load.current];
  if (!def) return 'wait';
  if (load.reloading > 0) return 'wait';
  if (ctx.time - load.lastShot < def.interval) return 'wait';
  if ((load.mag[load.current] ?? 0) <= 0) { startReload(load, fighter, ctx); return 'dry'; }
  load.lastShot = ctx.time;
  load.mag[load.current]--;
  load.bloom = clamp(load.bloom + def.bloom, 0, 0.09);

  const speed = Math.hypot(fighter.vel.x, fighter.vel.z);
  const spread = spreadOf(load, def, speed, fighter.crouch, !fighter.onGround, load.scoped);
  eyePos(fighter, _eye);
  ctx.onShot?.(fighter, load.current);
  const pellets = def.pellets || 1;
  for (let p = 0; p < pellets; p++) {
    // Direction: view + random cone + recoil is applied to the view itself.
    const a = ctx.rng() * Math.PI * 2, r = spread * Math.sqrt(ctx.rng());
    const yaw = fighter.yaw + Math.cos(a) * r;
    const pitch = fighter.pitch + Math.sin(a) * r;
    _dir.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    _end.copy(_eye).addScaledVector(_dir, 90);

    // Nearest hit: world first, then every other fighter's head/torso.
    const wallT = ctx.world.ray(_eye, _end);
    let bestT = wallT >= 0 ? wallT : 2, bestF = null, bestHead = false;
    for (const other of ctx.fighters) {
      if (other === fighter || !other.alive) continue;
      const th = segBox(_eye, _end, other.head);
      const tb = segBox(_eye, _end, other.torso);
      const t = th >= 0 ? th : tb;
      if (t >= 0 && t < bestT) { bestT = t; bestF = other; bestHead = th >= 0 && th <= tb; }
    }
    _hp.copy(_eye).addScaledVector(_dir, bestT * 90);
    ctx.tracer(_eye, _hp);
    if (bestF) {
      const dist = bestT * 90;
      let dmg = dist > def.falloff ? def.dmg * 0.65 : def.dmg;
      // Bot duels last longer than human ones, so the human matters more
      // than the nine bots fighting among themselves.
      if (fighter.bot && bestF.bot) dmg *= 0.7;
      const killed = hurt(bestF, dmg, bestHead);
      ctx.onHit(fighter, bestF, bestHead, killed, _hp, dmg);
    } else {
      ctx.onWall(_hp);
    }
  }
  // Recoil lands on the view after the shot, so it shapes the next shot.
  addRecoil(fighter, def.kick, (ctx.rng() - 0.5) * def.kick * 0.7);
  return 'shot';
}

export function startReload(load, fighter, ctx) {
  const def = WEAPONS[load.current];
  if (!def || load.reloading > 0) return;
  const need = def.mag - (load.mag[load.current] ?? 0);
  if (need <= 0 || (load.reserve[load.current] ?? 0) <= 0) return;
  load.reloading = def.reload;
  ctx.sound('reload');
}

export function updateReload(load, dt) {
  if (load.reloading <= 0) return;
  load.reloading -= dt;
  if (load.reloading <= 0) {
    const def = WEAPONS[load.current];
    const need = def.mag - load.mag[load.current];
    const take = Math.min(need, load.reserve[load.current]);
    load.mag[load.current] += take;
    load.reserve[load.current] -= take;
    load.reloading = 0;
  }
}

// --- Grenade projectiles. One array, updated by main; no allocation. ---
export function createProjectiles() { return []; }

export function throwGrenade(load, kind, fighter, ctx) {
  if ((load.grenades[kind] ?? 0) <= 0) return false;
  load.grenades[kind]--;
  load.throwAnim = 0.45;
  const def = GRENADES[kind];
  eyePos(fighter, _eye);
  const dir = new THREE.Vector3(-Math.sin(fighter.yaw) * Math.cos(fighter.pitch), Math.sin(fighter.pitch) + 0.25, -Math.cos(fighter.yaw) * Math.cos(fighter.pitch)).normalize();
  ctx.projectiles.push({
    kind, def, pos: _eye.clone(), vel: dir.multiplyScalar(13),
    fuse: def.fuse, owner: fighter, alive: true,
  });
  ctx.sound('throwSnd');
  return true;
}

const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3();
export function updateProjectiles(list, ctx, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const g = list[i];
    if (!g.alive) { list.splice(i, 1); continue; }
    g.vel.y -= 14 * dt;
    _p0.copy(g.pos);
    g.pos.addScaledVector(g.vel, dt);
    _p1.copy(g.pos);
    // Bounce off the world (cheap: clamp to floor + wall ray).
    if (g.pos.y < 0.15) { g.pos.y = 0.15; g.vel.y = Math.abs(g.vel.y) * 0.45; g.vel.x *= 0.7; g.vel.z *= 0.7; }
    if (ctx.world.ray(_p0, _p1) >= 0) { g.vel.multiplyScalar(-0.35); g.pos.copy(_p0); }
    g.fuse -= dt;
    if (g.fuse <= 0) {
      g.alive = false;
      if (g.def.smoke) ctx.smokeAt(g.pos.clone(), g.def.radius);
      else if (g.def.flash) ctx.flashAt?.(g.pos.clone(), g.def.radius);
      else if (g.def.molotov) ctx.molotovAt?.(g.pos.clone(), g.def.radius);
      else if (g.def.decoy) ctx.decoyAt?.(g.pos.clone(), g.def.radius);
      else ctx.explodeAt(g.pos.clone(), g.def.radius, g.def.dmg, g.owner);
      list.splice(i, 1);
    }
  }
}
