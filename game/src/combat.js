// Combat feedback + resolution: tracers, muzzle flashes, smoke, grenades.
// Player shots are hitscan raycasts against bot hitboxes and walls (head =
// more damage). Bot shots resolve by hit chance (distance, movement) so the
// sim stays cheap at 60 Hz. No new objects in hot loops: tracer and smoke
// sprites are pooled and reused.
import * as THREE from 'three';
import { WEAPONS } from './data.js';
import { segHitsCircle } from './util.js';

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3();
export class Effects {
  constructor(scene, smokeTex, flashTex) {
    this.scene = scene;
    this.smokes = [];   // {x, z, r, t, sprites[]}
    this.tracers = [];
    for (let i = 0; i < 14; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 }));
      line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    this.tracerI = 0;
    this.smokePool = [];
    for (let i = 0; i < 24; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0, depthWrite: false }));
      s.scale.set(3, 3, 1);
      scene.add(s);
      this.smokePool.push(s);
    }
    this.smokeI = 0;
    this.flashTex = flashTex;
  }
  tracer(from, to) {
    const t = this.tracers[this.tracerI++ % this.tracers.length];
    const p = t.line.geometry.attributes.position;
    p.setXYZ(0, from.x, from.y, from.z);
    p.setXYZ(1, to.x, to.y, to.z);
    p.needsUpdate = true;
    t.line.material.opacity = 0.9;
    t.life = 0.09;
  }
  smokeCloud(x, z, r = 4.5, dur = 12) {
    const sprites = [];
    for (let i = 0; i < 5; i++) {
      const s = this.smokePool[this.smokeI++ % this.smokePool.length];
      const a = (i / 5) * Math.PI * 2;
      s.position.set(x + Math.cos(a) * r * 0.4, 1 + (i % 2) * 0.7, z + Math.sin(a) * r * 0.4);
      s.scale.set(r * 1.1, r * 0.9, 1);
      s.material.opacity = 0.75;
      sprites.push(s);
    }
    this.smokes.push({ x, z, r, t: dur, dur, sprites });
  }
  blocksLos(ax, az, bx, bz) {
    for (const s of this.smokes) if (segHitsCircle(ax, az, bx, bz, s.x, s.z, s.r * 0.8)) return true;
    return false;
  }
  update(dt) {
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
      }
    }
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.t -= dt;
      const a = Math.min(0.75, (s.t / s.dur) * 1.4) * Math.min(1, (s.dur - s.t) * 2);
      for (const sp of s.sprites) sp.material.opacity = Math.max(0, a);
      if (s.t <= 0) this.smokes.splice(i, 1);
    }
  }
}

// Player hitscan: one ray, pellets loop for the shotgun. Returns hit info.
export function playerShoot(game, raycaster, origin, dir, weaponId) {
  const w = WEAPONS[weaponId];
  const pellets = w.pellets || 1;
  let hitAny = null;
  for (let p = 0; p < pellets; p++) {
    _d.copy(dir);
    if (pellets > 1) {
      _d.x += (Math.random() - 0.5) * w.spread * 3;
      _d.y += (Math.random() - 0.5) * w.spread * 3;
      _d.z += (Math.random() - 0.5) * w.spread * 3;
      _d.normalize();
    }
    raycaster.set(origin, _d);
    raycaster.far = w.range;
    const hits = raycaster.intersectObjects(game.shotTargets, false);
    if (!hits.length) {
      game.fx.tracer(game.muzzlePos(_o), _t.copy(origin).addScaledVector(_d, w.range));
      continue;
    }
    const h = hits[0];
    game.fx.tracer(game.muzzlePos(_o), h.point);
    const f = h.object.userData.fighter;
    if (f && f.alive) {
      const head = h.object.userData.part === 'head';
      const dmg = w.dmg * (head ? w.head : 1);
      hitAny = { fighter: f, head, dmg, point: h.point.clone() };
      game.damageFighter(f, dmg, head, 'player');
    } else {
      // Wall hit: spark puff of dust at the impact point.
      game.impactDust(h.point);
    }
    if (pellets === 1) break;
  }
  return hitAny;
}

// Bot shot: probability by distance and movement, tracer to the victim.
export function botShoot(game, att, victim) {
  const w = WEAPONS[att.weapon] || WEAPONS.corsa;
  const d = Math.hypot(victim.pos.x - att.pos.x, victim.pos.z - att.pos.z);
  const moving = game.playerMoving && victim === game.playerFighter ? game.playerMoving : false;
  let chance = 0.62 - d * 0.013 - (moving ? 0.14 : 0) - (att.movedLastStep ? 0.07 : 0);
  chance = Math.max(0.08, Math.min(0.85, chance));
  att.chestPos(_o);
  victim.chestPos(_t);
  if (Math.random() < 0.25) { _t.x += (Math.random() - 0.5) * 1.6; _t.y += (Math.random() - 0.5) * 1.2; _t.z += (Math.random() - 0.5) * 1.6; }
  game.fx.tracer(_o, _t);
  game.audioShot(att.weapon, d);
  if (Math.random() > chance) return false;
  const head = Math.random() < 0.16;
  game.damageFighter(victim, w.dmg * (head ? w.head : 1), head, att);
  return true;
}

// Thrown grenades: gravity arc, one ground bounce, fuse, then the effect.
export class Grenades {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a2a24, roughness: 0.6 }));
  }
  throwFrom(pos, dir, type) {
    const m = this.mesh.clone();
    m.position.copy(pos);
    this.scene.add(m);
    this.list.push({ m, vx: dir.x * 13, vy: dir.y * 13 + 3.5, vz: dir.z * 13, type, fuse: type === 'cracker' ? 1.2 : 0.9, bounced: false });
  }
  step(game, dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      g.vy -= 14 * dt;
      g.m.position.x += g.vx * dt;
      g.m.position.y += g.vy * dt;
      g.m.position.z += g.vz * dt;
      if (g.m.position.y < 0.1) {
        if (!g.bounced && Math.abs(g.vy) > 2) { g.vy = -g.vy * 0.35; g.vx *= 0.6; g.vz *= 0.6; g.bounced = true; }
        else { g.m.position.y = 0.1; g.vy = 0; g.vx *= 0.9; g.vz *= 0.9; }
      }
      g.fuse -= dt;
      if (g.fuse > 0) continue;
      const p = g.m.position;
      if (g.type === 'cracker') {
        game.audio.explosion();
        game.fx.smokeCloud(p.x, p.z, 2.2, 1.2);
        for (const f of game.fighters) {
          if (!f.alive) continue;
          const d = Math.hypot(f.pos.x - p.x, f.pos.z - p.z);
          if (d < 6) game.damageFighter(f, 95 * (1 - d / 7), false, 'player');
        }
        if (game.playerFighter.alive) {
          const d = Math.hypot(game.playerFighter.pos.x - p.x, game.playerFighter.pos.z - p.z);
          if (d < 6) game.damagePlayer(95 * (1 - d / 7));
        }
      } else if (g.type === 'glare') {
        game.flashPlayer(p);
      } else {
        game.fx.smokeCloud(p.x, p.z, 4.5, 12);
      }
      this.scene.remove(g.m);
      this.list.splice(i, 1);
    }
  }
}
