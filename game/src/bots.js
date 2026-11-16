// Bots: stylised operators with name tags, team colours and a visible gun.
// AI runs on the fixed-step sim: waypoint lanes, hold positions, LOS scans,
// burst fire, coordinated site pushes on a radio call, rotations, and a
// douse channel when the keg is lit. `env` (injected by main.js) supplies
// LOS, movement, firing and radio so this module stays sim-only.
import * as THREE from 'three';
import { nameTex } from './tex.js';
import { clamp, mulberry32 } from './util.js';

const TEAM_COLOR = { smug: 0x2fa8a0, ward: 0xc65a2e };
const SKIN = 0xc99a72;

export class Fighter {
  constructor(name, team, weapon, x, z, scene) {
    this.name = name; this.team = team; this.weapon = weapon;
    this.pos = new THREE.Vector3(x, 0, z);
    this.yaw = team === 'smug' ? -Math.PI / 2 : Math.PI / 2;
    this.hp = 100; this.armour = 0; this.alive = true;
    this.state = 'hold'; this.wp = 0; this.lane = 'mid';
    this.thinkT = Math.random() * 0.2; this.burst = 0; this.burstT = 0;
    this.fireT = 0; this.strafeDir = 1; this.strafeT = 0;
    this.douseP = 0; this.holdP = null; this.speed = 3.1;
    this.group = new THREE.Group();
    const tc = TEAM_COLOR[team];
    const torsoMat = new THREE.MeshStandardMaterial({ color: tc, roughness: 0.8 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b2620, roughness: 0.85 });
    const skinMat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.75 });
    const add = (geo, mat, x, y, z, part = 'body') => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.castShadow = true;
      m.userData.fighter = this; m.userData.part = part;
      this.group.add(m); return m;
    };
    add(new THREE.BoxGeometry(0.52, 0.62, 0.3), torsoMat, 0, 1.12, 0);            // torso
    add(new THREE.BoxGeometry(0.34, 0.3, 0.3), skinMat, 0, 1.62, 0, 'head');     // head
    add(new THREE.BoxGeometry(0.38, 0.12, 0.34), torsoMat, 0, 1.82, 0, 'head');  // cap/helmet
    add(new THREE.BoxGeometry(0.16, 0.62, 0.18), darkMat, -0.32, 0.72, 0);       // arm L
    add(new THREE.BoxGeometry(0.16, 0.62, 0.18), darkMat, 0.32, 0.72, 0);        // arm R
    add(new THREE.BoxGeometry(0.2, 0.5, 0.22), darkMat, -0.14, 0.28, 0);         // leg L
    add(new THREE.BoxGeometry(0.2, 0.5, 0.22), darkMat, 0.14, 0.28, 0);          // leg R
    add(new THREE.BoxGeometry(0.07, 0.09, 0.72), new THREE.MeshStandardMaterial({ color: 0x1e1c1a, roughness: 0.5, metalness: 0.4 }), 0.3, 1.18, 0.25); // gun
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTex(name, team), transparent: true, depthWrite: false }));
    tag.scale.set(1.5, 0.38, 1); tag.position.y = 2.15;
    this.group.add(tag);
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    scene.add(this.group);
    this.tag = tag;
  }
  chestPos(out) { return out.set(this.pos.x, 1.25, this.pos.z); }
  headPos(out) { return out.set(this.pos.x, 1.62, this.pos.z); }
  die() {
    this.alive = false;
    this.group.rotation.x = -Math.PI / 2;
    this.group.position.y = 0.35;
    this.tag.visible = false;
  }
}

const _v = new THREE.Vector3();
// One AI tick (called at 10 Hz per bot from the sim; movement every step).
export function botThink(bot, env, dt) {
  if (!bot.alive) return;
  bot.thinkT -= dt;
  // Nearest visible enemy.
  let target = null, bestD = 30;
  for (const f of env.fighters) {
    if (!f.alive || f.team === bot.team) continue;
    const dx = f.pos.x - bot.pos.x, dz = f.pos.z - bot.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < bestD && env.los(bot.pos.x, bot.pos.z, f.pos.x, f.pos.z)) { target = f; bestD = d; }
  }
  bot.target = target;
  if (bot.thinkT > 0) return;
  bot.thinkT = 0.25;
  if (target) {
    if (bot.state !== 'engage') {
      bot.state = 'engage';
      if (env.rng() < 0.4) env.say(bot.name, env.contactLine());
    }
    return;
  }
  // No target: follow the round plan.
  if (env.kegLit && bot.team === 'ward') { bot.state = 'douse'; return; }
  if (env.kegLit && bot.team === 'smug') { bot.state = 'defend'; return; }
  if (bot.team === 'smug') {
    bot.state = bot.wp >= env.laneLen(bot.lane) ? 'hold' : 'push';
  } else {
    bot.state = 'hold';
  }
}

export function botStep(bot, env, dt) {
  if (!bot.alive) return;
  botThink(bot, env, dt);
  // Stuck detection while pushing: if a wall blocks the lane for 1.5 s,
  // sidestep perpendicular for 0.9 s instead of grinding against it.
  bot.stuckT = (bot.stuckT || 0) + dt;
  if (bot.stuckT >= 1.5) {
    bot.stuckT = 0;
    const lx = bot.lastX ?? bot.pos.x, lz = bot.lastZ ?? bot.pos.z;
    if (bot.state === 'push' && Math.hypot(bot.pos.x - lx, bot.pos.z - lz) < 0.4) {
      bot.sideT = 0.9; bot.sideDir = -(bot.sideDir || 1);
    }
    bot.lastX = bot.pos.x; bot.lastZ = bot.pos.z;
  }
  const t = bot.target;
  if (t && t.alive) {
    // Face the target, strafe, fire in bursts.
    const dx = t.pos.x - bot.pos.x, dz = t.pos.z - bot.pos.z;
    bot.yaw = Math.atan2(dx, dz);
    bot.strafeT -= dt;
    if (bot.strafeT <= 0) { bot.strafeDir *= -1; bot.strafeT = 0.7 + env.rng() * 0.9; }
    const d = Math.hypot(dx, dz);
    if (d > 16) env.move(bot, dx / d, dz / d, dt, 3.0);
    else if (d < 5) env.move(bot, -dx / d, -dz / d, dt, 2.0);
    else env.move(bot, -dz / d * bot.strafeDir, dx / d * bot.strafeDir, dt, 1.6);
    bot.fireT -= dt;
    if (bot.fireT <= 0 && env.los(bot.pos.x, bot.pos.z, t.pos.x, t.pos.z)) {
      if (bot.burst <= 0) { bot.burst = 3 + ((env.rng() * 3) | 0); bot.burstT = 0.12; }
      if (bot.burst > 0) {
        bot.burstT -= dt;
        if (bot.burstT <= 0) {
          bot.burstT = 0.13;
          bot.burst--;
          env.fire(bot, t);
          if (bot.burst <= 0) bot.fireT = 0.55 + env.rng() * 0.7;
        }
      }
    }
  } else if (bot.state === 'push') {
    const lane = bot.lanePts || env.lane(bot.lane);
    const p = lane[Math.min(bot.wp, lane.length - 1)];
    const dx = p[0] - bot.pos.x, dz = p[1] - bot.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.2) { bot.wp++; }
    else {
      bot.yaw = Math.atan2(dx, dz);
      if (bot.sideT > 0) { bot.sideT -= dt; env.move(bot, -dz / d * bot.sideDir, dx / d * bot.sideDir, dt, bot.speed); }
      else env.move(bot, dx / d, dz / d, dt, bot.speed);
    }
  } else if (bot.state === 'douse') {
    // Wardens converge on the lit relay and channel the douse.
    const s = env.litSite();
    if (s) {
      const dx = s.x - bot.pos.x, dz = s.z - bot.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 2.2) { bot.yaw = Math.atan2(dx, dz); env.move(bot, dx / d, dz / d, dt, 3.4); }
      else { bot.yaw = Math.atan2(dx, dz); env.douse(bot, dt); }
    }
  } else if (bot.state === 'defend') {
    const s = env.litSite();
    if (s) {
      const dx = s.x - bot.pos.x, dz = s.z - bot.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 9) { bot.yaw = Math.atan2(dx, dz); env.move(bot, dx / d, dz / d, dt, 3.0); }
      else bot.yaw += Math.sin(performance.now() * 0.0004 + bot.wp) * 0.002;
    }
  } else if (bot.holdP) {
    // Hold position: idle scan, small yaw drift.
    bot.yaw = bot.holdP.yaw + Math.sin(performance.now() * 0.0005 + bot.wp * 1.7) * 0.5;
  }
  bot.group.position.set(bot.pos.x, bot.group.position.y, bot.pos.z);
  bot.group.rotation.y = bot.yaw;
  bot.group.rotation.x = bot.alive ? 0 : -Math.PI / 2;
}

// Assign the round plan: allies push one site together, wardens hold sites.
export function assignPlan(bots, site, rng, lanes) {
  const allies = bots.filter((b) => b.team === 'smug');
  const wardens = bots.filter((b) => b.team === 'ward');
  const lane = site === 'A' ? 'A' : 'B';
  allies.forEach((b, i) => {
    b.lane = i === 3 ? 'low' : i === 4 ? 'mid' : lane;
    b.wp = 0; b.state = 'push';
    // Jitter each ally's lane so the push does not stack on one point.
    const base = lanes[b.lane];
    b.lanePts = base.map((p, j) => [p[0] + (rng() - 0.5) * (j === base.length - 1 ? 5 : 1.5), p[1] + (rng() - 0.5) * (j === base.length - 1 ? 5 : 1.5)]);
  });
  // Wardens: two hold A, two hold B, one roams mid.
  const holds = [
    { x: 19, z: -10, yaw: -Math.PI / 2 }, { x: 27, z: -17, yaw: -Math.PI / 2 },
    { x: 19, z: 10, yaw: -Math.PI / 2 }, { x: 27, z: 18, yaw: -Math.PI / 2 },
    { x: 2, z: 0, yaw: -Math.PI / 2 },
  ];
  wardens.forEach((b, i) => {
    const h = holds[i % holds.length];
    b.holdP = h; b.pos.set(h.x, 0, h.z); b.yaw = h.yaw; b.state = 'hold';
  });
  return lane;
}
export function makeRng(seed) { return mulberry32(seed); }
export { clamp };
