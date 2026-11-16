// Bootstrap: renderer, camera, input, fixed-step loop, ?shot= staging.
// The sim (sim.js) owns all state; this file only renders it and feeds it
// input. Deterministic staged shots freeze the sim and place the camera,
// bots, kill feed and radio exactly as the reference frames show.
import * as THREE from 'three';
import { buildWorld } from './world.js';
import { Game } from './sim.js';
import { WEAPONS } from './data.js';

const params = new URLSearchParams(location.search);
const shotMode = params.get('shot');
const seed = parseInt(params.get('seed') || '1', 10) || 1;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.08, 400);
camera.rotation.order = 'YXZ';
scene.add(camera);
// Warm fill so the viewmodel and near geometry never read as black.
const fill = new THREE.PointLight(0xffe0b0, 2.5, 4, 2);
fill.position.set(0.3, 0.3, 0.2);
camera.add(fill);

const world = buildWorld(scene);
const game = new Game(scene, camera, world);

// --- input: mouse look (pointer lock), WASD, fire, reload, buy, interact ---
const canvas = renderer.domElement;
let locked = false;
const lockPointer = () => {
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch { /* headless / no gesture: look still works via keys */ }
};
canvas.addEventListener('click', () => {
  if (shotMode || game.phase === 'title') return;
  game.audio.ensure();
  lockPointer();
});
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; });
document.addEventListener('mousemove', (e) => {
  if (!locked || !game.player.alive) return;
  game.player.yaw -= e.movementX * 0.0021;
  game.player.pitch = Math.max(-1.4, Math.min(1.4, game.player.pitch - e.movementY * 0.0021));
});
canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || game.phase === 'title') return;
  game.audio.ensure();
  game.firing = true;
  game.tryFire();
});
addEventListener('mouseup', (e) => { if (e.button === 0) game.firing = false; });
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  game.keys[e.code] = true;
  if (game.phase === 'title') return;
  const w = WEAPONS[game.player.weapon];
  if (e.code === 'KeyR') game.reload();
  if (e.code === 'KeyB' && game.phase === 'buy') {
    game.hud.setBuy(!game.hud.buyOpen, game.st());
    if (game.hud.buyOpen) document.exitPointerLock?.();
  }
  if (game.hud.buyOpen && game.phase === 'buy') {
    const key = e.key.toUpperCase();
    const row = [...document.querySelectorAll('#buy-grid .it')].find((r) => r.dataset.key === key);
    if (row) game.buy(row.dataset.id);
    if (e.code === 'Escape') game.hud.setBuy(false, game.st());
    return;
  }
  if (e.code === 'Digit1') game.cycleWeapon(1);
  if (e.code === 'Digit2') game.cycleWeapon(2);
  if (e.code === 'Digit3') game.cycleWeapon(3);
  if (e.code === 'Digit4') game.cycleWeapon(4);
  if (e.code === 'KeyQ' && game.player.weapon === 'nade') game.cycleWeapon(4);
  void w;
});
addEventListener('keyup', (e) => { game.keys[e.code] = false; });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

document.getElementById('deploy').addEventListener('click', () => {
  game.audio.ensure();
  document.getElementById('overlay').hidden = true;
  lockPointer();
  game.startRound(1);
});

// --- staged shots / normal start ---
if (shotMode) {
  if (shotMode === 'start') {
    // The deploy screen stays up: title, ROUND 3, DEPLOY button.
    document.getElementById('deploy').textContent = 'DEPLOY — ROUND 3';
  } else {
    document.getElementById('overlay').hidden = true;
  }
  game.stage(shotMode, seed);
  // Render a few frames so tracers, smoke and the HUD settle, then signal.
  let frames = 0;
  const settle = () => {
    if (shotMode === 'play') game.vm.flashOn(); // keep the muzzle flash in frame
    renderer.render(scene, camera);
    if (++frames < 6) requestAnimationFrame(settle);
    else window.__shotReady = true;
  };
  requestAnimationFrame(settle);
} else {
  game.hud.banner('BRINE & BLAZE', 'Deploy when ready — Round 1, buy phase 15 seconds');
}

// --- fixed-step loop: sim at 60 Hz, render every rAF ---
let last = performance.now(), acc = 0, frames = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  let n = 0;
  while (acc >= 1 / 60 && n < 5) { game.step(); acc -= 1 / 60; n++; }
  if (n === 5) acc = 0;
  // Camera + viewmodel sway in staged modes still need a render each frame.
  if (game.staged) {
    game._syncCamera();
    if (game.staged === 'play') game.vm.flashOn(); // frozen muzzle flash stays lit
  }
  else if (game.phase === 'title' && !game.matchOver) {
    // Slow title orbit behind the spawn so the deploy screen is alive.
    const t = now * 0.00008;
    camera.position.set(-28 + Math.sin(t) * 2, 2.2, 2 + Math.cos(t) * 2);
    camera.lookAt(-10, 1.2, 0);
  }
  renderer.render(scene, camera);
  if (++frames % 30 === 0) window.__fps = Math.round(1000 / Math.max(1, now - (loop._p || now))) || 0;
  loop._p = now;
}
requestAnimationFrame(loop);

// --- headless verification surface ---
window.__game = {
  get rounds() {
    return {
      phase: game.phase, round: game.round, timer: game.timer,
      score: { smug: game.score.smug, ward: game.score.ward },
      bomb: { state: game.keg.state, site: game.keg.site },
    };
  },
  get player() {
    const p = game.player;
    return {
      hp: p.hp, alive: p.alive, armour: p.armour, money: game.money,
      weapon: p.weapon, mag: p.mag, reserve: p.reserve,
      pos: { x: p.pos.x, y: p.pos.y, z: p.pos.z }, yaw: p.yaw,
    };
  },
  get fighters() {
    return game.fighters.map((f) => ({
      name: f.name, team: f.team, alive: f.alive, hp: Math.round(f.hp),
      pos: { x: f.pos.x, z: f.pos.z }, isPlayer: !!f.isPlayer,
    }));
  },
  get bots() { return game.bots.map((b) => ({ name: b.name, hp: b.hp, alive: b.alive, state: b.state })); },
  game,
};
