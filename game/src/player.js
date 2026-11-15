// player.js — one job: a fighter's body. Movement with acceleration,
// crouching and axis-separated AABB collision against the map, plus
// health, armour and recoil. Bots and the human share this code, so the
// gunfight is fair on both sides of the crosshair.

import * as THREE from 'three';
import { clamp, damp } from './util.js';

export const EYE_STAND = 1.55, EYE_CROUCH = 1.1;
const HALF = 0.35, HEIGHT = 1.7;
const GRAVITY = 20, JUMP = 6.4;
const WALK = 4.3, CROUCH = 2.3, ACCEL = 42;

export function createFighter(world, x, z, yaw) {
  const f = {
    pos: new THREE.Vector3(x, 0, z),
    vel: new THREE.Vector3(),
    yaw, pitch: 0,
    crouch: false, onGround: true,
    hp: 100, armour: 0, helmet: false, alive: true,
    eye: EYE_STAND,
    // Hitboxes, recomputed from pos each frame (head + torso).
    head: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
    torso: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
  };
  return f;
}

// Move a fighter by wish direction (world xz, unit) and jump flag, dt fixed.
export function moveFighter(world, f, wishX, wishZ, wantJump, dt) {
  if (!f.alive) return;
  const speed = f.crouch ? CROUCH : WALK;
  const target = { x: wishX * speed, z: wishZ * speed };
  const rate = f.onGround ? 12 : 3.5;
  f.vel.x = damp(f.vel.x, target.x, rate, dt);
  f.vel.z = damp(f.vel.z, target.z, rate, dt);
  if (wantJump && f.onGround) { f.vel.y = JUMP; f.onGround = false; }
  f.vel.y -= GRAVITY * dt;
  // Axis-separated move with AABB slide.
  stepAxis(world, f, 'x', f.vel.x * dt);
  stepAxis(world, f, 'z', f.vel.z * dt);
  stepAxis(world, f, 'y', f.vel.y * dt);
  if (f.pos.y <= 0) { f.pos.y = 0; f.vel.y = 0; f.onGround = true; }
  f.eye = damp(f.eye, f.crouch ? EYE_CROUCH : EYE_STAND, 14, dt);
  updateHitboxes(f);
}

function overlaps(f, b) {
  return f.pos.x + HALF > b.min.x && f.pos.x - HALF < b.max.x
    && f.pos.y + HEIGHT > b.min.y && f.pos.y < b.max.y
    && f.pos.z + HALF > b.min.z && f.pos.z - HALF < b.max.z;
}

function stepAxis(world, f, axis, delta) {
  if (delta === 0) return;
  f.pos[axis] += delta;
  for (const b of world.colliders) {
    if (!overlaps(f, b)) continue;
    if (axis === 'x') {
      f.pos.x = delta > 0 ? b.min.x - HALF : b.max.x + HALF;
      f.vel.x = 0;
    } else if (axis === 'z') {
      f.pos.z = delta > 0 ? b.min.z - HALF : b.max.z + HALF;
      f.vel.z = 0;
    } else {
      if (delta > 0) { f.pos.y = b.min.y - HEIGHT; }
      else { f.pos.y = b.max.y; f.onGround = true; }
      f.vel.y = 0;
    }
    return; // one push-out per axis per step is enough at 60 Hz
  }
}

export function updateHitboxes(f) {
  const { x, y, z } = f.pos;
  const top = y + HEIGHT;
  f.head.min.x = x - 0.18; f.head.max.x = x + 0.18;
  f.head.min.y = top - 0.36; f.head.max.y = top;
  f.head.min.z = z - 0.18; f.head.max.z = z + 0.18;
  f.torso.min.x = x - 0.36; f.torso.max.x = x + 0.36;
  f.torso.min.y = y + 0.15; f.torso.max.y = top - 0.36;
  f.torso.min.z = z - 0.36; f.torso.max.z = z + 0.36;
}

export function eyePos(f, out) {
  out.set(f.pos.x, f.pos.y + f.eye, f.pos.z);
  return out;
}

// Damage: armour absorbs half while it lasts; a helmet softens headshots
// (2x -> 1.5x). Returns true when killed.
export function hurt(f, amount, isHead) {
  if (!f.alive) return false;
  let dmg = isHead ? amount * (f.helmet ? 1.5 : 2) : amount;
  if (f.armour > 0) {
    const absorbed = Math.min(f.armour, dmg * 0.5);
    f.armour -= absorbed;
    dmg -= absorbed;
  }
  f.hp -= dmg;
  if (f.hp <= 0) { f.hp = 0; f.alive = false; return true; }
  return false;
}

// Recoil kick: weapon pushes the view up (and a little sideways).
export function addRecoil(f, pitchKick, yawKick) {
  f.pitch = clamp(f.pitch + pitchKick, -1.45, 1.45);
  f.yaw += yawKick;
}
