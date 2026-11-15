// world.js — one job: the SLAGWORKS map. An original furnace-works yard:
// two bomb sites (A Furnace Hall, B Slag Yard), three lanes (A Long west,
// Mid Pump Link, B Tunnel east), a north rotate lane, crates and containers
// as cover. Everything is boxes: colliders, meshes and the minimap share
// one list, so what you see is what you collide with and what the map shows.
//
// Layout (x east, z south toward the EMBER spawn; y up):
//   ASH spawn z=-18 ......... A site (-20,-13) .... B site (20,-13)
//   mid z=0 ................. Pump Link crates
//   EMBER spawn z=+18 ....... A Long x=-26, B Tunnel x=+26

import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { segBoxes } from './util.js';

const MAT = {};
function mat(color, opts = {}) {
  const key = color + '|' + (opts.emissive || 0);
  if (!MAT[key]) {
    MAT[key] = new THREE.MeshLambertMaterial({
      color, emissive: opts.emissive || 0x000000,
      emissiveIntensity: opts.ei ?? 1,
    });
  }
  return MAT[key];
}

// One canvas texture for hazard stripes (procedural, no asset files).
let hazardTex = null;
function hazardTexture() {
  if (hazardTex) return hazardTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#e8b400'; g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#1c1a18';
  for (let x = -32; x < 160; x += 32) {
    g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 16, 0); g.lineTo(x + 32, 0); g.lineTo(x + 16, 32); g.fill();
  }
  hazardTex = new THREE.CanvasTexture(c);
  hazardTex.wrapS = hazardTex.wrapT = THREE.RepeatWrapping;
  return hazardTex;
}

// box(x, z, w, d, h, material, y0): a solid block. Returns its collider.
function box(list, x, z, w, d, h, material, y0 = 0) {
  const b = { min: { x: x - w / 2, y: y0, z: z - d / 2 }, max: { x: x + w / 2, y: y0 + h, z: z + d / 2 }, mat: material };
  list.push(b);
  return b;
}

// Dusk sky dome: a vertical gradient (violet zenith, ember horizon) on a
// big inverted sphere, so the map reads as a place at sunset, not a void.
function skyDome(scene) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#1c1430');
  grad.addColorStop(0.45, '#4a2b55');
  grad.addColorStop(0.72, '#a34a3c');
  grad.addColorStop(0.88, '#ff9a4d');
  grad.addColorStop(1, '#ff7a1a');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(120, 24, 16),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }),
  );
  scene.add(dome);
}

// Worn concrete floor: speckle + faint stains, tiled over the yard.
function floorTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#8d8578'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = Math.random();
    g.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.07)';
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    g.beginPath();
    let x = Math.random() * 256, y = Math.random() * 256;
    g.moveTo(x, y);
    for (let j = 0; j < 4; j++) { x += (Math.random() - 0.5) * 90; y += (Math.random() - 0.5) * 90; g.lineTo(x, y); }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 6);
  return tex;
}

export function createWorld(scene, rng) {
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);
  skyDome(scene);
  const geoBox = new THREE.BoxGeometry(1, 1, 1);
  const geoCyl = new THREE.CylinderGeometry(1, 1.2, 1, 10);

  // --- ground ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(64, 48),
    new THREE.MeshLambertMaterial({ map: floorTexture() }),
  );
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  group.add(ground);

  // --- perimeter walls (h 6) ---
  box(colliders, 0, -23, 64, 2, 6, PALETTE.brick);
  box(colliders, 0, 23, 64, 2, 6, PALETTE.brick);
  box(colliders, -31, 0, 2, 48, 6, PALETTE.brick);
  box(colliders, 31, 0, 2, 48, 6, PALETTE.brick);

  // --- site A: Furnace Hall (NW). Big furnace block + chimney + side walls ---
  box(colliders, -24, -16, 8, 6, 5, PALETTE.brickDark);            // furnace body
  box(colliders, -24, -19.5, 3, 3, 9, PALETTE.steelDark);          // chimney base
  box(colliders, -14, -18, 6, 2, 4, PALETTE.concrete);             // A hall wall
  box(colliders, -27, -8, 2, 8, 4, PALETTE.brick);                 // A long end wall
  // --- site B: Slag Yard (NE). Container stacks + slag heap base ---
  box(colliders, 24, -16, 8, 6, 3.2, PALETTE.containerGreen);      // container stack
  box(colliders, 24, -12, 4, 3, 2.4, PALETTE.containerRust);
  box(colliders, 15, -18, 6, 2, 4, PALETTE.concrete);              // B yard wall
  box(colliders, 27, -8, 2, 8, 4, PALETTE.brick);

  // --- mid: Pump Link. Crates, pump block, low walls ---
  box(colliders, -3, 2, 3, 3, 1.2, PALETTE.crate);
  box(colliders, 3, -2, 3, 3, 1.2, PALETTE.crate);
  box(colliders, 0, 6, 4, 2, 2.2, PALETTE.steel);                  // pump block
  box(colliders, -8, -4, 2, 6, 1.1, PALETTE.crateDark);            // low cover
  box(colliders, 8, 4, 2, 6, 1.1, PALETTE.crateDark);
  // --- lane dividers: mid connectors to A and B ---
  box(colliders, -12, -6, 6, 1.5, 3.5, PALETTE.concrete);
  box(colliders, 12, -6, 6, 1.5, 3.5, PALETTE.concrete);
  box(colliders, -12, 2, 4, 1.5, 2.4, PALETTE.crate);
  box(colliders, 12, -2, 4, 1.5, 2.4, PALETTE.crate);
  // --- A Long / B Tunnel cover ---
  box(colliders, -26, 4, 3, 3, 1.3, PALETTE.crate);
  box(colliders, -26, -4, 3, 3, 1.3, PALETTE.crateDark);
  box(colliders, 26, 4, 3, 3, 1.3, PALETTE.containerRust);
  box(colliders, 26, -4, 3, 3, 1.3, PALETTE.containerGreen);
  // --- spawn cover + north rotate wall ---
  box(colliders, -6, 14, 4, 2, 1.2, PALETTE.crate);
  box(colliders, 6, 14, 4, 2, 1.2, PALETTE.crate);
  box(colliders, 0, -19.5, 20, 1.5, 3.5, PALETTE.brickDark);       // rotate wall (gap at both ends)
  box(colliders, -18, 12, 3, 3, 2.2, PALETTE.steel);
  box(colliders, 18, 12, 3, 3, 2.2, PALETTE.steel);

  // --- meshes for every collider + furnace dressing ---
  const meshFor = (b) => {
    const w = b.max.x - b.min.x, h = b.max.y - b.min.y, d = b.max.z - b.min.z;
    const m = new THREE.Mesh(geoBox, mat(b.mat));
    m.position.set((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
    m.scale.set(w, h, d);
    m.castShadow = h > 2; m.receiveShadow = true;
    return m;
  };
  for (const b of colliders) group.add(meshFor(b));
  // Furnace mouth glow (emissive, animated) + chimney cylinder + hazard strip.
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.6, 0.4),
    new THREE.MeshBasicMaterial({ color: PALETTE.ember }));
  mouth.position.set(-24, 1.1, -12.9); group.add(mouth);
  const chimney = new THREE.Mesh(geoCyl, mat(PALETTE.steelDark));
  chimney.scale.set(1.4, 4, 1.4); chimney.position.set(-24, 11, -19.5); group.add(chimney);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 0.1),
    new THREE.MeshBasicMaterial({ map: hazardTexture() }));
  strip.position.set(-20, 0.35, -11.9); group.add(strip);
  // Distant skyline silhouettes outside the walls (depth, no collision).
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Mesh(geoBox, mat(0x241a33));
    const side = i % 2 === 0 ? -1 : 1;
    s.position.set(side * (36 + rng() * 14), 4 + rng() * 8, -30 + i * 7);
    s.scale.set(6 + rng() * 6, 8 + rng() * 14, 6);
    group.add(s);
  }
  // Sun + sky.
  const sun = new THREE.DirectionalLight(PALETTE.sun, PALETTE.sunIntensity);
  sun.position.set(-18, 26, 14); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, PALETTE.hemiIntensity));
  const emberLight = new THREE.PointLight(PALETTE.ember, 30, 18, 1.8);
  emberLight.position.set(-24, 2, -12); scene.add(emberLight);

  // --- sites, spawns, waypoints ---
  const sites = {
    A: { name: 'Furnace Hall', center: { x: -20, z: -13 }, r: 6 },
    B: { name: 'Slag Yard', center: { x: 20, z: -13 }, r: 6 },
  };
  const spawns = {
    ember: [{ x: -6, z: 18 }, { x: -2, z: 19 }, { x: 2, z: 18 }, { x: 6, z: 19 }, { x: 0, z: 16 }],
    ash: [{ x: -6, z: -18 }, { x: -2, z: -19 }, { x: 2, z: -18 }, { x: 6, z: -19 }, { x: 0, z: -16 }],
  };
  // Waypoint graph: id -> {x, z, next: [ids]}. Routes are walks on it.
  const N = (id, x, z, next) => [id, { x, z, next }];
  const nodes = new Map([
    N('atk', 0, 18, ['midS', 'aLS', 'bTS']),
    N('midS', 0, 10, ['atk', 'mid', 'aLS', 'bTS']),
    N('mid', 0, 0, ['midS', 'midN', 'aML', 'bML']),
    N('midN', 0, -8, ['mid', 'aH1', 'bH1', 'north']),
    N('aLS', -26, 12, ['atk', 'aLM', 'midS']),
    N('aLM', -26, 0, ['aLS', 'aLN']),
    N('aLN', -26, -10, ['aLM', 'aSite']),
    N('aSite', -20, -13, ['aLN', 'aH2', 'north']),
    N('bTS', 26, 12, ['atk', 'bTM', 'midS']),
    N('bTM', 26, 0, ['bTS', 'bTN']),
    N('bTN', 26, -10, ['bTM', 'bSite']),
    N('bSite', 20, -13, ['bTN', 'bH2', 'north']),
    N('aML', -12, -2, ['mid', 'aH1', 'aSite']),
    N('bML', 12, -2, ['mid', 'bH1', 'bSite']),
    N('aH1', -14, -8, ['aML', 'aSite', 'midN']),
    N('aH2', -24, -17, ['aSite', 'north']),
    N('bH1', 14, -8, ['bML', 'bSite', 'midN']),
    N('bH2', 24, -17, ['bSite', 'north']),
    N('north', 0, -19, ['aH2', 'bH2', 'midN', 'def']),
    N('def', 0, -18, ['north', 'aH1', 'bH1']),
  ]);
  const routes = {
    atkA: ['atk', 'aLS', 'aLM', 'aLN', 'aSite'],
    atkB: ['atk', 'bTS', 'bTM', 'bTN', 'bSite'],
    atkMid: ['atk', 'midS', 'mid', 'aML', 'aSite'],
    atkMidB: ['atk', 'midS', 'mid', 'bML', 'bSite'],
    defA: ['def', 'aH1', 'aSite'],
    defB: ['def', 'bH1', 'bSite'],
    defMid: ['def', 'midN', 'mid'],
    rotateA: ['north', 'aH2', 'aSite'],
    rotateB: ['north', 'bH2', 'bSite'],
  };

  const hit = { t: -1, box: null };
  const world = {
    colliders, sites, spawns, nodes, routes, group,
    // Nearest world hit along segment p0->p1 (for bullets and sight).
    ray(p0, p1) { return segBoxes(p0, p1, colliders, hit) ? hit.t : -1; },
    inSite(p, site) {
      const s = sites[site];
      const dx = p.x - s.center.x, dz = p.z - s.center.z;
      return dx * dx + dz * dz < s.r * s.r;
    },
    // Furnace glow flicker; called once a frame with elapsed seconds.
    update(t) {
      emberLight.intensity = 26 + Math.sin(t * 7.3) * 4 + Math.sin(t * 13.7) * 2;
    },
  };
  return world;
}
