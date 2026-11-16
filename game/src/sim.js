// Simulation: one state object, fixed 60 Hz steps, rendering kept apart.
// Rounds: 15 s buy -> 100 s attack -> keg 35 s; first to 7 over 12 rounds.
// Money: win 3250, loss 1900, kill +300, plant +300. Armour soaks half of
// every hit; a cap halves headshot damage. Bots buy by round money.
import * as THREE from 'three';
import { WEAPONS, SMUGGLERS, WARDENS, RADIO_PLANS, RADIO_CONTACT, SITES } from './data.js';
import { Fighter, botStep, assignPlan, makeRng } from './bots.js';
import { Effects, playerShoot, botShoot, Grenades } from './combat.js';
import { AudioSys } from './audio.js';
import { Hud } from './hud.js';
import { ViewModel } from './viewmodel.js';
import { clamp, mulberry32, collideCircle } from './util.js';
import { smokeTex, flashTex } from './tex.js';

const STEP = 1 / 60;
const BUY_T = 15, LIVE_T = 100, KEG_T = 35;

export class Game {
  constructor(scene, camera, world) {
    this.scene = scene; this.camera = camera; this.world = world;
    this.rng = makeRng((Math.random() * 1e9) | 0);
    this.audio = new AudioSys();
    this.fx = new Effects(scene, smokeTex(), flashTex());
    this.grenades = new Grenades(scene);
    this.hud = new Hud(world);
    this.vm = new ViewModel(camera, flashTex());
    this.raycaster = new THREE.Raycaster();
    this.keys = {};
    this.playerTeam = 'smug';
    this.fighters = []; this.bots = [];
    this.player = null; // fighter-like object, isPlayer
    this.round = 1; this.score = { smug: 0, ward: 0 };
    this.phase = 'title'; this.timer = BUY_T;
    this.money = 800;
    this.keg = { state: 'none', site: null, t: 0 }; // none|lit|exploded|doused
    this.plantP = 0; this.douseP = 0;
    this.firing = false; this.fireCd = 0; this.reloadT = 0;
    this.owned = new Set(['corsa', 'sparrow']);
    this.nades = { cracker: 0, glare: 0, seafog: 0 };
    this.nadeSel = 'cracker';
    this.douseKit = false;
    this.roundEndT = 0; this.matchOver = false;
    this.staged = null; // ?shot= mode: frozen, deterministic
    this.frozen = false;
    this.shotTargets = [];
    this.mmT = 0;
    this.playerMoving = false;
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this.resetFighters('smug');
    this.vm.equip('corsa');
    this.hud.onBuy = (id) => this.buy(id);
    this.hud.update(this.st(), this.player, this.fighters);
  }

  st() {
    return {
      phaseLabel: this.phase === 'buy' ? 'BUY TIME' : this.phase === 'live' ? 'ATTACK'
        : this.phase === 'keg' ? 'KEG LIT' : this.phase === 'roundEnd' ? 'ROUND OVER' : 'DEPLOY',
      round: this.round, timer: this.timer,
      scoreA: this.score[this.playerTeam], scoreB: this.score[this.playerTeam === 'smug' ? 'ward' : 'smug'],
      money: this.money, owned: this.owned, weapon: this.player.weapon,
      armour: this.player.armour, cap: this.player.cap, playerTeam: this.playerTeam,
    };
  }

  resetFighters(team) {
    for (const b of this.bots) this.scene.remove(b.group);
    this.bots = [];
    this.playerTeam = team;
    const names = team === 'smug' ? SMUGGLERS : WARDENS;
    const foes = team === 'smug' ? WARDENS : SMUGGLERS;
    const pSpawn = team === 'smug' ? this.world.spawns.smug[1] : this.world.spawns.ward[1];
    this.player = {
      name: 'You', team, isPlayer: true, alive: true, hp: 100, armour: 0, cap: false,
      pos: new THREE.Vector3(pSpawn[0], 0, pSpawn[1]), yaw: team === 'smug' ? -Math.PI / 2 : Math.PI / 2,
      pitch: 0, weapon: 'corsa', mag: 30, reserve: 90, vel: new THREE.Vector3(),
      crouch: false, sprint: false, movedLastStep: false,
    };
    this.player.chestPos = (o) => o.set(this.player.pos.x, 1.25, this.player.pos.z);
    this.player.headPos = (o) => o.set(this.player.pos.x, 1.62, this.player.pos.z);
    const allySpawns = team === 'smug' ? this.world.spawns.smug : this.world.spawns.ward;
    const foeSpawns = team === 'smug' ? this.world.spawns.ward : this.world.spawns.smug;
    names.forEach((n, i) => {
      if (i === 1) return; // slot 1 is the player
      const s = allySpawns[i];
      const b = new Fighter(n, team, ['corsa', 'tramont', 'cicada', 'brine'][i % 4], s[0], s[1], this.scene);
      this.bots.push(b);
    });
    foes.forEach((n, i) => {
      const s = foeSpawns[i];
      const b = new Fighter(n, team === 'smug' ? 'ward' : 'smug', ['tramont', 'corsa', 'brine', 'cicada', 'meridian'][i % 5], s[0], s[1], this.scene);
      this.bots.push(b);
    });
    this.fighters = [this.player, ...this.bots];
    this.shotTargets = [...this.world.solids];
    for (const b of this.bots) for (const m of b.group.children) if (m.userData.fighter) this.shotTargets.push(m);
    // Bots buy by round money: richer rounds field better rifles.
    for (const b of this.bots) if (this.rng() < 0.5) b.weapon = ['tramont', 'corsa'][this.rng() < 0.5 ? 0 : 1];
  }

  startRound(n) {
    this.round = n;
    this.resetFighters(this.playerTeam);
    this.player.hp = 100; this.player.alive = true;
    if (!this.owned.has(this.player.weapon) && this.player.weapon !== 'blade') this.player.weapon = 'corsa';
    const w = WEAPONS[this.player.weapon];
    this.player.mag = w.mag; this.player.reserve = w.reserve;
    this.keg = { state: 'none', site: null, t: 0 };
    this.plantP = 0; this.douseP = 0;
    this.phase = 'buy'; this.timer = BUY_T;
    const site = this.rng() < 0.5 ? 'A' : 'B';
    this.planSite = site;
    assignPlan(this.bots, site, this.rng, this.world.lanes);
    const plan = RADIO_PLANS[(this.rng() * RADIO_PLANS.length) | 0];
    this.hud.clearRadio();
    this.hud.say(plan[0], plan[1]);
    this.hud.banner('ROUND ' + n, site === 'A' ? 'Light the keg at the Fish Market or the Boathouse' : 'Light the keg at the Boathouse or the Fish Market');
    this.hud.setBuy(false, this.st());
  }

  endRound(winner, reason) {
    if (this.phase === 'roundEnd') return;
    this.score[winner]++;
    const won = winner === this.playerTeam;
    this.money += won ? 3250 : 1900;
    this.phase = 'roundEnd'; this.roundEndT = 3.5;
    this.hud.banner(won ? 'ROUND WON' : 'ROUND LOST', reason + '  ·  ' + this.score.smug + ' — ' + this.score.ward);
    this.audio.horn(won);
    this.hud.setBuy(false, this.st());
    if (this.keg.state === 'lit') this.keg.state = 'done';
  }

  // --- economy ---
  buy(id) {
    if (this.phase !== 'buy' || this.matchOver) return;
    const prices = { mastiff: 700, cicada: 1250, brine: 1500, tramont: 3000, meridian: 4750, jerkin: 650, jerkincap: 1000, cracker: 300, glare: 200, seafog: 300, dousekit: 400 };
    if (id === 'sparrow' || id === 'corsa') { this.equip(id); return; }
    if (id === 'jerkin' || id === 'jerkincap') {
      if (this.player.armour >= 100 && (id === 'jerkin' || this.player.cap)) { this.hud.toast('Armour already full'); return; }
      if (this.money < prices[id]) { this.hud.toast('Not enough cash'); return; }
      this.money -= prices[id];
      this.player.armour = 100;
      if (id === 'jerkincap') this.player.cap = true;
      this.hud.renderBuy(this.st());
      return;
    }
    if (id === 'dousekit') {
      if (this.playerTeam !== 'ward') { this.hud.toast('Wardens only'); return; }
      if (this.douseKit || this.money < 400) { this.hud.toast(this.douseKit ? 'Douse Kit owned' : 'Not enough cash'); return; }
      this.money -= 400; this.douseKit = true; this.hud.renderBuy(this.st()); return;
    }
    if (id === 'cracker' || id === 'glare' || id === 'seafog') {
      if (this.money < prices[id]) { this.hud.toast('Not enough cash'); return; }
      this.money -= prices[id]; this.nades[id]++; this.owned.add(id); this.nadeSel = id;
      this.hud.renderBuy(this.st()); return;
    }
    if (this.owned.has(id)) { this.equip(id); return; }
    if (this.money < prices[id]) { this.hud.toast('Not enough cash'); return; }
    this.money -= prices[id];
    this.owned.add(id);
    this.equip(id);
    this.hud.renderBuy(this.st());
  }
  equip(id) {
    const w = WEAPONS[id];
    if (!w) return;
    this.player.weapon = id;
    if (id !== 'sparrow' && id !== 'blade') this.primary = id;
    this.player.mag = w.mag === Infinity ? Infinity : w.mag;
    this.player.reserve = w.reserve;
    this.vm.equip(id);
    this.fireCd = 0.15;
  }

  // --- damage ---
  damageFighter(f, dmg, head, attacker) {
    if (!f.alive) return;
    if (f.isPlayer) { this.damagePlayer(dmg, head); return; }
    let d = dmg;
    if (f.armour > 0) { const soak = Math.min(f.armour, d * 0.5); f.armour -= soak; d -= soak; }
    if (head && f.cap) d *= 0.5;
    f.hp -= d;
    if (attacker === 'player') {
      this.hud.hitmarker(head);
      this.audio.hit(head);
    }
    if (f.hp <= 0) {
      f.hp = 0; f.die();
      const killer = attacker === 'player' ? 'You' : attacker.name;
      const wname = attacker === 'player' ? WEAPONS[this.player.weapon].name : WEAPONS[attacker.weapon].name;
      this.hud.kill(killer, wname, f.name, head);
      if (attacker === 'player') { this.money += 300; this.audio.kill(); }
      this.checkRoundEnd();
    }
  }
  damagePlayer(dmg, head = false) {
    if (!this.player.alive) return;
    let d = dmg;
    if (this.player.armour > 0) { const soak = Math.min(this.player.armour, d * 0.5); this.player.armour -= soak; d -= soak; }
    if (head && this.player.cap) d *= 0.5;
    this.player.hp -= d;
    this.hud.damageFlash();
    this.audio.hurt();
    if (this.player.hp <= 0) {
      this.player.hp = 0; this.player.alive = false;
      this.hud.banner('YOU ARE DOWN', 'Your crew fights on — spectate the round');
      this.checkRoundEnd();
    }
  }
  checkRoundEnd() {
    if (this.phase === 'roundEnd' || this.matchOver) return;
    const smugAlive = this.fighters.some((f) => f.alive && f.team === 'smug');
    const wardAlive = this.fighters.some((f) => f.alive && f.team === 'ward');
    if (!smugAlive) this.endRound('ward', 'Smugglers eliminated');
    else if (!wardAlive) this.endRound('smug', 'Wardens eliminated');
  }

  // --- LOS / movement helpers for bots ---
  los(ax, az, bx, bz) {
    for (const c of this.world.colliders) {
      if ((c.h ?? 3) < 1.6) continue;
      if (segBlocked(ax, az, bx, bz, c)) return false;
    }
    if (this.fx.blocksLos(ax, az, bx, bz)) return false;
    return true;
  }
  moveFighter(f, dx, dz, dt, speed) {
    const nx = f.pos.x + dx * speed * dt, nz = f.pos.z + dz * speed * dt;
    f.pos.x = this._slide(nx, f.pos.z, 0.45);
    f.pos.z = this._slideZ(f.pos.x, nz, 0.45);
    f.movedLastStep = true;
  }
  _slide(nx, z, r) {
    for (const c of this.world.colliders) {
      const hit = collideCircle(c, nx, z, r);
      if (hit) nx = hit.x;
    }
    return clamp(nx, -31.4, 31.4);
  }
  _slideZ(x, nz, r) {
    for (const c of this.world.colliders) {
      const hit = collideCircle(c, x, nz, r);
      if (hit) nz = hit.z;
    }
    return clamp(nz, -21.4, 21.4);
  }

  // --- input actions (called from main.js event handlers) ---
  tryFire() {
    if (this.phase !== 'live' && this.phase !== 'keg') return;
    if (!this.player.alive || this.reloadT > 0 || this.fireCd > 0) return;
    const w = WEAPONS[this.player.weapon];
    if (this.player.weapon === 'blade') { this._melee(); return; }
    if (this.player.weapon === 'nade') { this._throwNade(); return; }
    if (this.player.mag <= 0) { this.audio.dry(); this.reload(); return; }
    this.fireCd = 60 / w.rpm;
    this.player.mag--;
    const moving = this.playerMoving;
    const spread = (moving ? w.moveSpread : w.spread) * (this.player.crouch ? 0.6 : 1);
    const dir = this._v2.set(
      -Math.sin(this.player.yaw) * Math.cos(this.player.pitch) + (Math.random() - 0.5) * spread,
      Math.sin(this.player.pitch) + (Math.random() - 0.5) * spread,
      -Math.cos(this.player.yaw) * Math.cos(this.player.pitch) + (Math.random() - 0.5) * spread,
    ).normalize();
    const origin = this._v.set(this.player.pos.x, 1.55, this.player.pos.z);
    playerShoot(this, this.raycaster, origin, dir, this.player.weapon);
    this.player.pitch = clamp(this.player.pitch + w.recoil * (moving ? 1.4 : 1), -1.4, 1.4);
    this.vm.recoil(w.recoil * 2.2);
    this.vm.flashOn();
    this.audio.shot(this.player.weapon, 0);
    if (this.player.mag === 0) this.reload();
  }
  _melee() {
    this.fireCd = 0.6;
    const dir = this._v2.set(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw));
    for (const f of this.bots) {
      if (!f.alive || f.team === this.playerTeam) continue;
      const dx = f.pos.x - this.player.pos.x, dz = f.pos.z - this.player.pos.z;
      if (Math.hypot(dx, dz) < 2.2 && Math.abs(Math.atan2(dx, dz) - this.player.yaw) < 0.9) {
        this.damageFighter(f, 40, false, 'player');
        this.vm.recoil(0.05);
        return;
      }
    }
  }
  _throwNade() {
    const type = this.nadeSel;
    if ((this.nades[type] || 0) <= 0) {
      // Cycle to a nade we actually own.
      const owned = ['cracker', 'glare', 'seafog'].filter((n) => (this.nades[n] || 0) > 0);
      if (!owned.length) { this.hud.toast('No grenades — buy at the Counter (B)'); return; }
      this.nadeSel = owned[0];
    }
    this.nades[this.nadeSel]--;
    this.fireCd = 0.7;
    const dir = this._v2.set(-Math.sin(this.player.yaw) * Math.cos(this.player.pitch), Math.sin(this.player.pitch), -Math.cos(this.player.yaw) * Math.cos(this.player.pitch));
    this.grenades.throwFrom(this._v.set(this.player.pos.x, 1.5, this.player.pos.z), dir, this.nadeSel);
    this.audio.reload();
  }
  reload() {
    const w = WEAPONS[this.player.weapon];
    if (!w || w.mag === Infinity || this.player.mag === w.mag || this.player.reserve <= 0 || this.reloadT > 0) return;
    this.reloadT = w.mag > 20 ? 2.2 : 1.6;
    this.audio.reload();
  }
  cycleWeapon(slot) {
    if (slot === 1) this.equip(this.primary || 'corsa');
    if (slot === 2) this.equip('sparrow');
    if (slot === 3) this.equip('blade');
    if (slot === 4) {
      const owned = ['cracker', 'glare', 'seafog'].filter((n) => (this.nades[n] || 0) > 0);
      if (!owned.length) { this.hud.toast('No grenades — buy at the Counter (B)'); return; }
      const i = owned.indexOf(this.nadeSel);
      this.nadeSel = owned[(i + 1) % owned.length];
      this.player.weapon = 'nade';
      this.vm.equip('corsa');
      this.hud.toast('Grenade: ' + this.nadeSel);
    }
  }

  // --- fixed-step sim ---
  step() {
    if (this.frozen) return;
    const dt = STEP;
    this.fx.update(dt);
    this.grenades.step(this, dt);
    if (this.phase === 'title' || this.phase === 'roundEnd' || this.matchOver) {
      if (this.phase === 'roundEnd') {
        this.roundEndT -= dt;
        if (this.roundEndT <= 0) this._nextRound();
      }
      this._botsIdle(dt);
      return;
    }
    this.timer -= dt;
    if (this.phase === 'buy' && this.timer <= 0) {
      this.phase = 'live'; this.timer = LIVE_T;
      this.hud.setBuy(false, this.st());
      this.hud.banner('ATTACK', this.planSite === 'A' ? 'Hit the Fish Market' : 'Hit the Boathouse');
      this.hud.say('Fenn', this.planSite === 'A' ? 'Hit Fish Market now, smokes out' : 'Hit Boathouse now, smokes out');
    } else if (this.phase === 'live' && this.timer <= 0) {
      this.endRound(this.playerTeam === 'smug' ? 'ward' : 'smug', 'Time — the keg never lit');
    } else if (this.phase === 'keg') {
      if (this.timer <= 0) {
        this.keg.state = 'exploded';
        this.audio.explosion();
        this.endRound('smug', 'The keg blew the relay');
      }
      // Keg glow pulse.
      const keg = this.world.sites[this.keg.site]?.keg;
      if (keg) keg.material.emissive.setHSL(0.05, 0.9, 0.25 + 0.2 * Math.sin(performance.now() * 0.008));
    }
    this._playerStep(dt);
    // Bots hold during the buy phase — no fighting before the round starts.
    if (this.phase === 'buy') this._botsIdle(dt);
    else this._botsStep(dt);
    this._interactStep(dt);
    // HUD text + minimap at 10 Hz.
    this.mmT += dt;
    if (this.mmT > 0.1) {
      this.mmT = 0;
      this.hud.update(this.st(), this.player, this.fighters);
      this.hud.drawMinimap(this.player, this.fighters, this.st());
    }
  }
  _nextRound() {
    if (this.score.smug >= 7 || this.score.ward >= 7 || this.round >= 12) {
      this.matchOver = true;
      const won = this.score[this.playerTeam] > this.score[this.playerTeam === 'smug' ? 'ward' : 'smug'];
      this.phase = 'title';
      this.hud.banner(won ? 'QUAY SEVEN IS OURS' : 'THE WARDENS HOLD THE QUAY',
        'Final ' + this.score.smug + ' — ' + this.score.ward + '  ·  refresh to play again');
      return;
    }
    this.startRound(this.round + 1);
  }
  _playerStep(dt) {
    const p = this.player;
    if (!p.alive) return;
    const k = this.keys;
    let ix = 0, iz = 0;
    if (k['KeyW']) iz -= 1;
    if (k['KeyS']) iz += 1;
    if (k['KeyA']) ix -= 1;
    if (k['KeyD']) ix += 1;
    const moving = ix !== 0 || iz !== 0;
    this.playerMoving = moving;
    p.crouch = !!k['ControlLeft'] || !!k['KeyC'];
    p.sprint = !!k['ShiftLeft'] && !p.crouch && iz < 0;
    const speed = p.crouch ? 2.1 : p.sprint ? 5.6 : 4.2;
    // Acceleration + friction (no new objects: reuse vel).
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    // Camera forward is (-sin yaw, -cos yaw); right is (cos yaw, -sin yaw).
    const wx = (ix * cos + iz * sin), wz = (-ix * sin + iz * cos);
    const len = Math.hypot(wx, wz) || 1;
    const tx = moving ? (wx / len) * speed : 0, tz = moving ? (wz / len) * speed : 0;
    p.vel.x += (tx - p.vel.x) * Math.min(1, dt * 10);
    p.vel.z += (tz - p.vel.z) * Math.min(1, dt * 10);
    const nx = p.pos.x + p.vel.x * dt, nz = p.pos.z + p.vel.z * dt;
    p.pos.x = this._slide(nx, p.pos.z, 0.45);
    p.pos.z = this._slideZ(p.pos.x, nz, 0.45);
    if (moving && Math.hypot(p.vel.x, p.vel.z) > 0.8) this.audio.step(p.sprint);
    // Fire / reload timers.
    this.fireCd -= dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const w = WEAPONS[p.weapon];
        const need = w.mag - p.mag, take = Math.min(need, p.reserve);
        p.mag += take; p.reserve -= take;
      }
    }
    if (this.firing) this.tryFire();
    // Camera follows the player.
    const eye = p.crouch ? 1.15 : 1.62;
    this.camera.position.set(p.pos.x, eye, p.pos.z);
    this.camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
    this.vm.update(dt, moving, WEAPONS[p.weapon]?.scope && this.firing);
  }
  _botsIdle(dt) {
    for (const b of this.bots) {
      if (!b.alive) continue;
      b.group.position.set(b.pos.x, b.group.position.y, b.pos.z);
      b.group.rotation.y = b.yaw;
    }
  }
  _botsStep(dt) {
    const env = this._env;
    for (const b of this.bots) {
      b.movedLastStep = false;
      botStep(b, env, dt);
    }
  }
  _interactStep(dt) {
    const p = this.player;
    const nearSite = (s) => Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < 2.6;
    this.hud.interact(false);
    if (!p.alive || (this.phase !== 'live' && this.phase !== 'keg')) return;
    if (p.team === 'smug' && this.phase === 'live' && this.keg.state === 'none') {
      const s = Object.values(SITES).find(nearSite);
      if (s && this.keys['KeyE']) {
        this.plantP += dt / 3;
        this.hud.interact(true, 'Hold E — Lighting the keg', this.plantP);
        if (Math.random() < dt * 2) this.audio.plantBeep();
        if (this.plantP >= 1) {
          this.keg = { state: 'lit', site: s.name === 'FISH MARKET' ? 'A' : 'B', t: KEG_T };
          this.phase = 'keg'; this.timer = KEG_T;
          this.money += 300;
          this.hud.banner('KEG LIT', 'Defend the relay — 35 seconds');
          this.hud.say('Fenn', 'Keg down at ' + (this.keg.site === 'A' ? 'Fish Market' : 'Boathouse') + ' — hold the fountain');
          this.audio.explosion();
        }
      } else this.plantP = 0;
    } else if (p.team === 'ward' && this.phase === 'keg') {
      const s = SITES[this.keg.site];
      if (s && nearSite(s) && this.keys['KeyE']) {
        this.douseP += dt / (this.douseKit ? 2.5 : 5);
        this.hud.interact(true, 'Dousing the keg', this.douseP);
        if (Math.random() < dt * 2) this.audio.douseBeep();
        if (this.douseP >= 1) {
          this.keg.state = 'doused';
          this.endRound('ward', 'The keg was doused');
        }
      } else this.douseP = 0;
    }
  }

  // --- bot environment (closures over this game) ---
  get _env() {
    if (this.__env) return this.__env;
    const g = this;
    this.__env = {
      get fighters() { return g.fighters; },
      get kegLit() { return g.keg.state === 'lit'; },
      rng: () => g.rng(),
      los: (ax, az, bx, bz) => g.los(ax, az, bx, bz),
      move: (f, dx, dz, dt, sp) => g.moveFighter(f, dx, dz, dt, sp),
      fire: (att, victim) => botShoot(g, att, victim),
      say: (n, line) => g.hud.say(n, line),
      contactLine: () => RADIO_CONTACT[(g.rng() * RADIO_CONTACT.length) | 0][1],
      lane: (name) => g.world.lanes[name],
      laneLen: (name) => g.world.lanes[name].length,
      litSite: () => (g.keg.state === 'lit' ? SITES[g.keg.site] : null),
      douse: (bot, dt) => {
        bot.douseP += dt / 5;
        if (bot.douseP >= 1) { g.keg.state = 'doused'; g.endRound('ward', 'A Warden doused the keg'); }
      },
    };
    return this.__env;
  }

  // --- helpers used by combat.js ---
  muzzlePos(out) { return this.vm.muzzleWorld(out); }
  impactDust(p) { this.fx.smokeCloud(p.x, p.z, 0.9, 0.6); }
  audioShot(weapon, dist) { this.audio.shot(weapon, dist); }
  flashPlayer(p) {
    const dx = p.x - this.player.pos.x, dz = p.z - this.player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 22) return;
    const facing = Math.atan2(dx, dz);
    if (Math.abs(facing - this.player.yaw) < 1.1 && this.los(this.player.pos.x, this.player.pos.z, p.x, p.z)) {
      this.hud.flashWhite(Math.max(0.4, 1 - d / 25));
    }
  }

  // --- deterministic staged shots (?shot=) ---
  stage(mode, seed) {
    this.staged = mode;
    this.frozen = true;
    this.rng = makeRng(seed * 7919 + 13);
    const S = SITES;
    if (mode === 'start') {
      this.resetFighters('smug');
      this.round = 3; this.score = { smug: 0, ward: 0 };
      this.phase = 'title'; this.timer = BUY_T;
      this.player.pos.set(-27, 0, 14); this.player.yaw = -Math.PI / 2 + 0.1;
      this._placeAlly(0, -23, 12, Math.PI / 2);
      this._placeAlly(1, -25, 17, Math.PI / 2);
      this.hud.banner('ROUND 3', 'Light the keg at the Fish Market or the Boathouse');
      this._syncCamera();
    } else if (mode === 'buy') {
      this.resetFighters('smug');
      this.round = 3; this.score = { smug: 2, ward: 0 };
      this.phase = 'buy'; this.timer = 4; this.money = 2450;
      this.player.armour = 100; this.player.cap = true;
      this.owned.add('jerkin'); this.owned.add('jerkincap'); this.owned.add('seafog');
      this.nades.seafog = 1;
      this.player.pos.set(-27, 0, 1); this.player.yaw = -Math.PI / 2 + 0.2;
      this._placeAlly(0, -20, 8, Math.PI / 2 + 0.5);
      this.hud.say('Fenn', 'Default, then we hit Boathouse');
      this.hud.setBuy(true, this.st());
      this._syncCamera();
    } else if (mode === 'play') {
      this.resetFighters('smug');
      this.round = 5; this.score = { smug: 0, ward: 4 };
      this.phase = 'live'; this.timer = 89; this.money = 600;
      this.player.pos.set(13, 0, 14); this.player.yaw = -Math.PI / 2; this.player.pitch = 0.02;
      this.player.mag = 22;
      const foes = this.bots.filter((b) => b.team === 'ward');
      this._placeBot(foes[0], 20, 11, -1.17);
      this._placeBot(foes[1], 23, 16.5, -1.82);
      const allies = this.bots.filter((b) => b.team === 'smug');
      this._placeAlly(0, 8, 10, Math.PI / 2);
      this._syncCamera();
      // Frozen mid-firefight: tracer + muzzle flash in frame, kill feed full.
      this._v.set(20, 1.3, 11);
      this.fx.tracer(this.muzzlePos(this._v2), this._v);
      this.vm.flashOn();
      this.hud.clearFeed();
      this.hud.kill('Hale', 'Tramont AR', 'Quill', true);
      this.hud.kill('Marrow', 'Corsa AR', 'Hale', true);
      this.hud.kill('Tamsin', 'Tramont AR', 'Isolde', true);
      this.hud.kill('Tamsin', 'Tramont AR', 'Brannoch', true);
      this.hud.clearRadio();
      this.hud.say('Marrow', 'Contact Bell Square');
      this.hud.say('Fenn', 'Hit Boathouse now, smokes out');
    } else if (mode === 'site') {
      this.resetFighters('ward');
      this.round = 12; this.score = { smug: 5, ward: 6 };
      this.phase = 'keg'; this.timer = 26; this.money = 6300;
      this.player.weapon = 'tramont';
      this.equip('tramont');
      this.player.mag = 25; this.player.reserve = 60;
      this.player.armour = 100; this.player.cap = true;
      this.keg = { state: 'lit', site: 'A', t: 26 };
      this.player.pos.set(18.5, 0, -9); this.player.yaw = -0.8; this.player.pitch = -0.05;
      const foes = this.bots.filter((b) => b.team === 'smug');
      this._placeBot(foes[0], 27, -11, -1.49);
      this._placeBot(foes[1], 28, -12, -1.9);
      this.hud.clearFeed();
      this.hud.kill('Isolde', 'Tramont AR', 'Osric', true);
      this.hud.clearRadio();
      this.hud.interact(true, 'Dousing the keg', 0.45);
      this._syncCamera();
      const keg = this.world.sites.A.keg;
      keg.material.emissive.setHex(0x662200);
    }
    this.hud.update(this.st(), this.player, this.fighters);
    this.hud.drawMinimap(this.player, this.fighters, this.st());
  }
  _placeAlly(i, x, z, yaw) {
    const allies = this.bots.filter((b) => b.team === this.playerTeam);
    if (allies[i]) this._placeBot(allies[i], x, z, yaw);
  }
  _placeBot(b, x, z, yaw) {
    b.pos.set(x, 0, z); b.yaw = yaw;
    b.group.position.set(x, 0, z); b.group.rotation.y = yaw;
  }
  _syncCamera() {
    const p = this.player;
    this.camera.position.set(p.pos.x, 1.62, p.pos.z);
    this.camera.rotation.set(p.pitch || 0, p.yaw, 0, 'YXZ');
    this.vm.update(0.016, false, false);
  }
}

// 2D segment vs AABB test (LOS blocker).
function segBlocked(ax, az, bx, bz, c) {
  const dx = bx - ax, dz = bz - az;
  let tmin = 0, tmax = 1;
  for (const [o, d, lo, hi] of [[ax, dx, c.x0, c.x1], [az, dz, c.z0, c.z1]]) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return false; }
    else {
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return true;
}
