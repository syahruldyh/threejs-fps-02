// bots.js — one job: the nine bots that make it a 5v5. Each bot walks a
// waypoint route to its site, holds and peeks, and fights what it sees:
// line of sight, a field of view, a reaction delay, burst fire with the
// same spread model as the player, and a response to sound. Attackers
// plant; defenders rotate and defuse. They call out what they do on radio.

import * as THREE from 'three';
import { createFighter, moveFighter, eyePos, updateHitboxes } from './player.js';
import { createLoadout, fire, updateReload, WEAPONS } from './weapon.js';
import { clamp, wrapAngle } from './util.js';

const BOT_NAMES_EMBER = ['Ferro', 'Klink', 'Ashford', 'Mara'];
const BOT_NAMES_ASH = ['Dross', 'Clinker', 'Soot', 'Grate', 'Pell'];
const REACT_MIN = 0.5, REACT_MAX = 1.0;
const SEE_RANGE = 46, FOV_COS = 0.55;

export function createBot(game, team, name, spawn, role) {
  const fighter = createFighter(game.world, spawn.x, spawn.z, team === 'ember' ? 0 : Math.PI);
  const bot = {
    fighter, load: createLoadout(), team, name, role,
    route: [], routeIdx: 0, hold: null,
    target: null, lastSeen: null, lastSeenT: -9, reactAt: 0,
    burst: 0, burstPause: 0, scanT: Math.random() * 0.15,
    strafeDir: 1, strafeT: 0, plantT: 0, defuseT: 0,
    mesh: null, dead: false, money: 800,
  };
  // Bots buy like players: rifle from round 2, SMG round 1, armour later.
  bot.load.owned.shiv = true;
  bot.load.mag.shiv = WEAPONS.shiv.mag; bot.load.reserve.shiv = WEAPONS.shiv.reserve;
  bot.load.current = 'shiv';
  bot.mesh = buildBotMesh(game.scene, team);
  return bot;
}

function buildBotMesh(scene, team) {
  const g = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: team === 'ember' ? 0x8a5a2e : 0x2e4a5a });
  const accent = new THREE.MeshLambertMaterial({ color: team === 'ember' ? 0xff8a3c : 0x59b7ff });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc9a37e });
  const add = (w, h, d, x, y, z, m) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z); mesh.castShadow = true; g.add(mesh); return mesh;
  };
  add(0.62, 0.85, 0.34, 0, 1.05, 0, body);          // torso
  add(0.64, 0.1, 0.36, 0, 1.5, 0, accent);          // shoulder stripe
  add(0.34, 0.34, 0.34, 0, 1.68, 0, skin);          // head
  add(0.36, 0.12, 0.36, 0, 1.88, 0, accent);        // helm
  add(0.24, 0.75, 0.24, -0.18, 0.38, 0, body);      // legs
  add(0.24, 0.75, 0.24, 0.18, 0.38, 0, body);
  add(0.09, 0.09, 0.7, 0.3, 1.25, -0.35, new THREE.MeshLambertMaterial({ color: 0x23262b })); // gun
  scene.add(g);
  return g;
}

// Assign a route (array of node ids) and reset progress.
export function assignRoute(game, bot, routeIds) {
  bot.route = routeIds;
  bot.routeIdx = 0;
  bot.hold = null;
}

// One bot, one fixed step. game: {world, fighters, time, rng, ctx...}.
const _eye = new THREE.Vector3();
const _to = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _chest = new THREE.Vector3();

export function updateBot(game, bot, dt) {
  const f = bot.fighter;
  if (!f.alive) {
    if (bot.mesh) { bot.mesh.rotation.x = Math.PI / 2; bot.mesh.position.y = 0.25; }
    return;
  }
  // --- perception, staggered so nine bots never scan on the same step ---
  // During freeze nobody fights: bots walk to their lanes, guns down.
  const frozen = game.rounds.phase === 'freeze';
  if (frozen) bot.target = null;
  bot.scanT -= dt;
  if (bot.scanT <= 0 && !frozen) {
    bot.scanT = 0.15;
    scan(game, bot);
  }
  const target = bot.target;
  const now = game.time;
  // --- objective channels: plant / defuse ---
  if (bot.plantT > 0 || bot.defuseT > 0) {
    if (target) { bot.plantT = 0; bot.defuseT = 0; } // interrupted by contact
    else {
      if (bot.plantT > 0) {
        bot.plantT -= dt;
        if (bot.plantT <= 0) game.plantDone(bot);
      } else {
        bot.defuseT -= dt;
        if (bot.defuseT <= 0) game.defuseDone(bot);
      }
      moveFighter(game.world, f, 0, 0, false, dt);
      syncMesh(bot);
      return;
    }
  }
  // --- decide movement ---
  let wishX = 0, wishZ = 0;
  if (target && now >= bot.reactAt) {
    // Combat: strafe while shooting, keep ~8-18 m.
    const dx = target.pos.x - f.pos.x, dz = target.pos.z - f.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const wantYaw = Math.atan2(-dx, -dz);
    f.yaw += wrapAngle(wantYaw - f.yaw) * Math.min(1, dt * 8);
    // Aim at the chest with an error that grows with distance.
    const err = 0.035 + dist * 0.0013;
    f.pitch = clamp(Math.atan2(1.2 - (f.pos.y + f.eye), dist) + (game.rng() - 0.5) * err * 2, -1.2, 1.2);
    bot.strafeT -= dt;
    if (bot.strafeT <= 0) { bot.strafeDir *= -1; bot.strafeT = 0.7 + game.rng() * 0.8; }
    const approach = dist > 18 ? 1 : dist < 7 ? -0.6 : 0;
    const fx = -Math.sin(f.yaw), fz = -Math.cos(f.yaw);
    wishX = fx * approach + -fz * bot.strafeDir * 0.7;
    wishZ = fz * approach + fx * bot.strafeDir * 0.7;
    // Burst fire.
    if (bot.burstPause > 0) bot.burstPause -= dt;
    else if (bot.burst > 0) {
      const r = fire(bot.load, f, game.fireCtx);
      if (r === 'shot') bot.burst--;
      if (bot.burst <= 0) bot.burstPause = 0.6 + game.rng() * 0.5;
    } else bot.burst = 3 + Math.floor(game.rng() * 3);
  } else if (target) {
    // Seen but still reacting: freeze and stare.
    const dx = target.pos.x - f.pos.x, dz = target.pos.z - f.pos.z;
    f.yaw += wrapAngle(Math.atan2(-dx, -dz) - f.yaw) * Math.min(1, dt * 10);
  } else if (bot.hold) {
    // Holding a position: slow peek strafe, watch the lane.
    bot.strafeT -= dt;
    if (bot.strafeT <= 0) { bot.strafeDir *= -1; bot.strafeT = 1.2 + game.rng(); }
    const hx = bot.hold.x - f.pos.x, hz = bot.hold.z - f.pos.z;
    const hd = Math.hypot(hx, hz);
    if (hd > 1.5) { wishX = hx / hd; wishZ = hz / hd; }
    else { wishX = -Math.cos(f.yaw) * bot.strafeDir * 0.25; wishZ = Math.sin(f.yaw) * bot.strafeDir * 0.25; }
    f.yaw += wrapAngle(bot.hold.yaw - f.yaw) * Math.min(1, dt * 4);
  } else if (bot.route.length > 0) {
    // Walk the route.
    const node = game.world.nodes.get(bot.route[bot.routeIdx]);
    if (!node) { bot.routeIdx++; }
    else {
      const dx = node.x - f.pos.x, dz = node.z - f.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.3) {
        bot.routeIdx++;
        if (bot.routeIdx >= bot.route.length) {
          bot.hold = { x: node.x, z: node.z, yaw: f.yaw };
          bot.route = [];
        }
      } else { wishX = dx / d; wishZ = dz / d; f.yaw += wrapAngle(Math.atan2(-dx, -dz) - f.yaw) * Math.min(1, dt * 6); }
    }
  }
  // Separation: never stack on a teammate.
  for (const other of game.fighters) {
    if (other === f || !other.alive) continue;
    const dx = f.pos.x - other.pos.x, dz = f.pos.z - other.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 0.64 && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      wishX += (dx / d) * 0.8; wishZ += (dz / d) * 0.8;
    }
  }
  const wl = Math.hypot(wishX, wishZ);
  if (wl > 1) { wishX /= wl; wishZ /= wl; }
  moveFighter(game.world, f, wishX, wishZ, false, dt);
  updateReload(bot.load, dt);
  if (bot.load.bloom > 0) bot.load.bloom = Math.max(0, bot.load.bloom - dt * 0.05);
  syncMesh(bot);
}

function syncMesh(bot) {
  const f = bot.fighter, m = bot.mesh;
  if (!m) return;
  m.position.set(f.pos.x, f.pos.y, f.pos.z);
  m.rotation.y = f.yaw;
  m.rotation.x = 0;
}

function scan(game, bot) {
  const f = bot.fighter;
  eyePos(f, _eye);
  _fwd.set(-Math.sin(f.yaw), 0, -Math.cos(f.yaw));
  let best = null, bestD = Infinity;
  for (const other of game.fighters) {
    if (other === f || !other.alive) continue;
    if (other.team === f.team) continue;
    _to.set(other.pos.x - _eye.x, other.pos.y + 1.2 - _eye.y, other.pos.z - _eye.z);
    const dist = _to.length();
    if (dist > SEE_RANGE || dist < 0.5) continue;
    _to.divideScalar(dist);
    if (_to.x * _fwd.x + _to.z * _fwd.z < FOV_COS) continue;
    // Wall between us? Smoke between us?
    _chest.set(other.pos.x, other.pos.y + 1.2, other.pos.z);
    if (game.world.ray(_eye, _chest) >= 0) continue;
    if (game.effects.blocked(_eye, _chest)) continue;
    if (dist < bestD) { bestD = dist; best = other; }
  }
  if (best) {
    const isNew = bot.target !== best;
    bot.target = best;
    bot.lastSeen = { x: best.pos.x, z: best.pos.z };
    bot.lastSeenT = game.time;
    if (isNew) {
      bot.reactAt = game.time + REACT_MIN + game.rng() * (REACT_MAX - REACT_MIN);
      bot.burst = 0; bot.burstPause = 0;
      if (game.rng() < 0.4) game.radio(bot, 'contact');
    }
  } else if (bot.target && game.time - bot.lastSeenT > 3) {
    bot.target = null;
  }
}

// Hear a gunshot: turn toward it, and sometimes rotate to investigate.
export function hearShot(game, bot, pos) {
  if (!bot.fighter.alive || bot.target) return;
  const dx = pos.x - bot.fighter.pos.x, dz = pos.z - bot.fighter.pos.z;
  if (dx * dx + dz * dz > 30 * 30) return;
  bot.fighter.yaw = Math.atan2(-dx, -dz);
  if (game.rng() < 0.25 && bot.hold) {
    bot.hold = null;
    bot.route = [nearestNode(game, bot.fighter.pos)];
    game.radio(bot, 'rotating');
  }
}

function nearestNode(game, pos) {
  let best = 'mid', bestD = Infinity;
  for (const [id, n] of game.world.nodes) {
    const d = (n.x - pos.x) ** 2 + (n.z - pos.z) ** 2;
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}
