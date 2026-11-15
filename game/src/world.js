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
    const entry = COLOR_TEX[color];
    const params = {
      color, emissive: opts.emissive || 0x000000,
      emissiveIntensity: opts.ei ?? 1,
    };
    if (entry) {
      params.map = entry.tex();
      // Full-colour textures keep their own colours; the greyscale metal
      // texture is tinted by the palette colour; dark variants are the
      // same texture dimmed.
      params.color = entry.tex === metalTexture ? color
        : (color === PALETTE.brickDark || color === PALETTE.crateDark) ? 0x9a9a9a : 0xffffff;
    }
    MAT[key] = new THREE.MeshLambertMaterial(params);
  }
  return MAT[key];
}

// --- Procedural canvas textures: the "HD" layer. Every wall, crate and
// floor in the map wears one of these instead of a flat colour, so the
// screenshots read as a real place: brick courses with mortar and
// per-brick variation, cobblestones, concrete slabs, wood planks,
// corrugated metal. All drawn once, cached, and tiled to real-world
// scale per mesh (see meshFor) so a brick is a brick on a 64 m wall and
// on a 3 m crate alike.
const TEX = {};
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}
function brickTexture() {
  if (TEX.brick) return TEX.brick;
  TEX.brick = canvasTex(256, 256, (g) => {
    g.fillStyle = '#5d3a2c'; g.fillRect(0, 0, 256, 256); // mortar
    const rows = 8, bh = 256 / rows, bw = 64;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * bw / 2;
      for (let x = -bw; x < 256 + bw; x += bw) {
        const v = 0.75 + Math.random() * 0.5;
        g.fillStyle = shade('#9a4a34', v);
        g.fillRect(x + off + 2, r * bh + 2, bw - 4, bh - 4);
        g.fillStyle = 'rgba(0,0,0,0.18)';
        g.fillRect(x + off + 2, r * bh + bh - 6, bw - 4, 3);
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(x + off + 2, r * bh + 2, bw - 4, 3);
        // speckle on the brick face
        for (let i = 0; i < 14; i++) {
          g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,220,180,0.07)';
          g.fillRect(x + off + 4 + Math.random() * (bw - 10), r * bh + 4 + Math.random() * (bh - 8), 2, 2);
        }
      }
    }
  });
  return TEX.brick;
}
function cobbleTexture() {
  if (TEX.cobble) return TEX.cobble;
  TEX.cobble = canvasTex(256, 256, (g) => {
    g.fillStyle = '#4a4238'; g.fillRect(0, 0, 256, 256);
    const s = 32;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const v = 0.8 + Math.random() * 0.45;
        g.fillStyle = shade('#8d8578', v);
        const px = x * s + (y % 2) * s / 2 - s / 2, py = y * s;
        g.beginPath();
        g.roundRect(px + 2, py + 2, s - 4, s - 4, 7);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.06)';
        g.beginPath(); g.roundRect(px + 4, py + 4, s - 8, 5, 3); g.fill();
      }
    }
  });
  return TEX.cobble;
}
function concreteTexture() {
  if (TEX.concrete) return TEX.concrete;
  TEX.concrete = canvasTex(256, 256, (g) => {
    g.fillStyle = '#9b938a'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2200; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.06)';
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 3;
    g.strokeRect(1, 1, 254, 254);
    g.strokeStyle = 'rgba(0,0,0,0.14)'; g.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      let x = Math.random() * 256, y = Math.random() * 256;
      g.moveTo(x, y);
      for (let j = 0; j < 4; j++) { x += (Math.random() - 0.5) * 80; y += (Math.random() - 0.5) * 80; g.lineTo(x, y); }
      g.stroke();
    }
  });
  return TEX.concrete;
}
function woodTexture() {
  if (TEX.wood) return TEX.wood;
  TEX.wood = canvasTex(256, 256, (g) => {
    g.fillStyle = '#a97c46'; g.fillRect(0, 0, 256, 256);
    for (let p = 0; p < 4; p++) {
      const y0 = p * 64;
      g.fillStyle = shade('#a97c46', 0.85 + Math.random() * 0.3);
      g.fillRect(0, y0 + 2, 256, 60);
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
      g.strokeRect(-2, y0 + 1, 260, 62);
      // grain
      g.strokeStyle = 'rgba(60,35,15,0.35)'; g.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        const gy = y0 + 8 + Math.random() * 48;
        g.moveTo(0, gy);
        g.bezierCurveTo(80, gy + (Math.random() - 0.5) * 8, 170, gy + (Math.random() - 0.5) * 8, 256, gy);
        g.stroke();
      }
      // nails
      g.fillStyle = 'rgba(40,25,10,0.7)';
      g.fillRect(8, y0 + 28, 4, 4); g.fillRect(244, y0 + 28, 4, 4);
    }
  });
  return TEX.wood;
}
function metalTexture() {
  if (TEX.metal) return TEX.metal;
  // Greyscale corrugation: the material colour tints it green/rust.
  TEX.metal = canvasTex(128, 128, (g) => {
    for (let x = 0; x < 128; x += 16) {
      const grad = g.createLinearGradient(x, 0, x + 16, 0);
      grad.addColorStop(0, '#5a5a5a'); grad.addColorStop(0.5, '#c8c8c8'); grad.addColorStop(1, '#4a4a4a');
      g.fillStyle = grad; g.fillRect(x, 0, 16, 128);
    }
    for (let i = 0; i < 300; i++) {
      g.fillStyle = Math.random() < 0.6 ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.08)';
      g.fillRect(Math.random() * 128, Math.random() * 128, 3, 2);
    }
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, 0, 128, 6);
  });
  return TEX.metal;
}
// Sign boards: big painted text on a dark board, like the site signs in
// a real yard. Returns a CanvasTexture (drawn once per unique text).
const SIGN_TEX = {};
function signTexture(lines, sub) {
  const key = lines.join('|') + (sub || '');
  if (SIGN_TEX[key]) return SIGN_TEX[key];
  const t = canvasTex(512, 256, (g) => {
    g.fillStyle = '#17120c'; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#e8b400'; g.lineWidth = 6; g.strokeRect(10, 10, 492, 236);
    g.fillStyle = '#e8b400'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 64px sans-serif';
    lines.forEach((ln, i) => g.fillText(ln, 256, 96 + i * 72));
    if (sub) { g.fillStyle = '#f2ede4'; g.font = '700 40px sans-serif'; g.fillText(sub, 256, 200); }
  });
  SIGN_TEX[key] = t;
  return t;
}
// Which palette colour wears which texture (and its real-world tile size).
const COLOR_TEX = {
  [PALETTE.brick]: { tex: brickTexture, tile: 2 },
  [PALETTE.brickDark]: { tex: brickTexture, tile: 2 },
  [PALETTE.concrete]: { tex: concreteTexture, tile: 3 },
  [PALETTE.crate]: { tex: woodTexture, tile: 1.5 },
  [PALETTE.crateDark]: { tex: woodTexture, tile: 1.5 },
  [PALETTE.containerGreen]: { tex: metalTexture, tile: 1.5 },
  [PALETTE.containerRust]: { tex: metalTexture, tile: 1.5 },
  [PALETTE.steel]: { tex: metalTexture, tile: 1.5 },
  [PALETTE.steelDark]: { tex: metalTexture, tile: 1.5 },
};

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
// The horizon sits at v=0.5 on the sphere, so the warm band is centred
// there — the orange is at eye level, not below it.
function skyDome(scene) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#1c1430');
  grad.addColorStop(0.32, '#4a2b55');
  grad.addColorStop(0.48, '#c65a3a');
  grad.addColorStop(0.58, '#ff9a4d');
  grad.addColorStop(0.72, '#7a4038');
  grad.addColorStop(1, '#2e2140');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(120, 24, 16),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }),
  );
  scene.add(dome);
}

// Cobblestone yard floor: rounded stones with mortar gaps, tiled over
// the yard so the ground reads as a real surface, not a flat wash.
function floorTexture() {
  const tex = cobbleTexture();
  tex.repeat.set(16, 12);
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
    const base = mat(b.mat);
    let material = base;
    if (base.map) {
      // Tile the texture to real-world scale: a brick reads as a brick
      // whether the box is a 64 m wall or a 3 m crate.
      const tile = (COLOR_TEX[b.mat] || {}).tile || 2;
      const t2 = base.map.clone();
      t2.needsUpdate = true;
      t2.repeat.set(Math.max(1, Math.round(w / tile)), Math.max(1, Math.round(h / tile)));
      material = base.clone();
      material.map = t2;
    }
    const m = new THREE.Mesh(geoBox, material);
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
  // --- site signs: painted boards so the map reads as named places ---
  // (the way Kilnyard's "KILN HALL SITE A" and Saltglass's "B" do).
  const sign = (lines, sub, x, y, z, w, h, ry = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: signTexture(lines, sub) }));
    m.position.set(x, y, z); m.rotation.y = ry; group.add(m);
  };
  sign(['FURNACE HALL'], 'SITE A', -14, 2.6, -16.9, 5.4, 2.7);       // A hall wall
  sign(['SLAG YARD'], 'SITE B', 15, 2.6, -16.9, 5.4, 2.7);            // B yard wall
  sign(['B'], null, 24, 1.4, -10.4, 1.8, 1.8);                        // big B on the front container
  sign(['PUMP LINK'], null, 0, 1.6, 7.05, 3.2, 1.2);                  // mid pump block, spawn side
  sign(['SLAG-1'], null, -3, 0.85, 3.55, 1.6, 0.8);                    // mid crate label
  sign(['KEEP DRY'], null, 26, 0.9, 5.55, 1.6, 0.8);                  // B tunnel crate
  // --- props: barrels, planters, wall lamps (dressing, against walls) ---
  const barrelMat = [mat(PALETTE.containerRust), mat(PALETTE.containerGreen)];
  const barrelGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.15, 12);
  const barrelSpots = [[-29, -14], [-29, -12.5], [29, -14], [-12, -20.5], [12, -20.5], [-28, 20], [28, 20]];
  barrelSpots.forEach(([x, z], i) => {
    const b = new THREE.Mesh(barrelGeo, barrelMat[i % 2]);
    b.position.set(x, 0.58, z); b.castShadow = true; group.add(b);
  });
  const plant = (x, z) => {
    const pot = new THREE.Mesh(geoBox, mat(PALETTE.concrete));
    pot.scale.set(1.4, 0.5, 0.7); pot.position.set(x, 0.25, z); group.add(pot);
    for (let i = 0; i < 3; i++) {
      const bush = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.7, 6),
        new THREE.MeshLambertMaterial({ color: 0x4a6b2f }));
      bush.position.set(x - 0.4 + i * 0.4, 0.85, z); group.add(bush);
    }
  };
  plant(-11, -16.5); plant(18, -16.5); plant(-29, 2);
  const lamp = (x, y, z) => {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.14),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    l.position.set(x, y, z); group.add(l);
    const pt = new THREE.PointLight(0xffc46b, 6, 9, 1.8);
    pt.position.set(x, y, z + 0.6); scene.add(pt);
  };
  lamp(-14, 3.6, -16.8); lamp(15, 3.6, -16.8); lamp(0, 3.2, -22.4);
  // --- sun disc + clouds: the dusk sky reads as weather, not a gradient ---
  const sunTex = canvasTex(128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(255,240,200,1)');
    grad.addColorStop(0.25, 'rgba(255,170,90,0.95)');
    grad.addColorStop(0.6, 'rgba(255,120,60,0.35)');
    grad.addColorStop(1, 'rgba(255,120,60,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  });
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(10, 24),
    new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, fog: false, depthWrite: false }));
  sunDisc.position.set(-25, 15, -75); sunDisc.lookAt(0, 4, 0); scene.add(sunDisc);
  const cloudTex = canvasTex(128, 64, (g) => {
    for (let i = 0; i < 7; i++) {
      const grad = g.createRadialGradient(20 + Math.random() * 88, 22 + Math.random() * 20, 2, 20 + Math.random() * 88, 22 + Math.random() * 20, 16 + Math.random() * 14);
      grad.addColorStop(0, 'rgba(255,210,200,0.35)');
      grad.addColorStop(1, 'rgba(255,210,200,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 128, 64);
    }
  });
  const clouds = [];
  for (let i = 0; i < 5; i++) {
    const cl = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.35, fog: false, depthWrite: false }));
    cl.position.set(-70 + rng() * 140, 38 + rng() * 16, -90 + rng() * 55);
    cl.scale.set(22 + rng() * 12, 7 + rng() * 4, 1);
    scene.add(cl); clouds.push(cl);
  }
  // Chimney smoke: two slow stacks that drift and loop (ambient life).
  const stackPuffTex = canvasTex(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(210,205,200,0.8)');
    grad.addColorStop(1, 'rgba(210,205,200,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  });
  const stackSmoke = [];
  for (const [sx, sz] of [[-24, -19.5], [30, -20]]) {
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: stackPuffTex, transparent: true, opacity: 0.22, depthWrite: false }));
      s.position.set(sx, 13 + i * 2.5, sz);
      s.scale.set(2.2 + i, 2.2 + i, 1);
      scene.add(s); stackSmoke.push({ s, base: 13 + i * 2.5, ph: i * 2.1 });
    }
  }
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
    // Furnace glow flicker + chimney smoke drift + slow clouds; called
    // once a frame with elapsed seconds.
    update(t) {
      emberLight.intensity = 26 + Math.sin(t * 7.3) * 4 + Math.sin(t * 13.7) * 2;
      for (const st of stackSmoke) {
        const cyc = ((t * 0.35 + st.ph) % 6) / 6;
        st.s.position.y = st.base + cyc * 7;
        st.s.material.opacity = 0.22 * (1 - cyc);
        st.s.scale.set(2.2 + cyc * 3, 2.2 + cyc * 3, 1);
      }
      for (let i = 0; i < clouds.length; i++) {
        clouds[i].position.x += 0.008;
        if (clouds[i].position.x > 80) clouds[i].position.x = -80;
      }
    },
  };
  return world;
}
