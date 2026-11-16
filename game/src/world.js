// Quay Seven map: harbour-market lanes, two relay sites, named areas.
// x east, z south. Bounds x -32..32, z -22..22. All solids register a 2D
// AABB collider (player + bots slide on it) and a mesh for raycasts.
import * as THREE from 'three';
import { cobbleTex, plasterTex, woodTex, awningTex, signTex, crateTex, hazardTex } from './tex.js';
import { SITES } from './data.js';

const WALL_H = 6;
function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
export function buildWorld(scene) {
  const W = { colliders: [], solids: [], lanes: {}, spawns: {}, sites: {}, group: new THREE.Group() };
  const g = W.group;
  scene.add(g);
  const cob = cobbleTex();
  const plasterRose = plasterTex('#c98d7a', '#e8b48f');
  const plasterCream = plasterTex('#d9b48c', '#f0d0a0');
  const plasterTeal = plasterTex('#7fae9f', '#a8cbbd');
  const wood = woodTex();
  const awnT = awningTex(true), awnR = awningTex(false), haz = hazardTex();
  const mat = (t, c = 0xffffff) => new THREE.MeshStandardMaterial({ map: t, color: c, roughness: 0.9 });
  const flat = (c, r = 0.95) => new THREE.MeshStandardMaterial({ color: c, roughness: r });

  // Ground: cobblestone plaza + timber deck at the Boathouse.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(64, 44), mat(cob));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; g.add(ground);
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(22, 13), mat(wood));
  deck.rotation.x = -Math.PI / 2; deck.position.set(21, 0.03, 14); deck.receiveShadow = true; g.add(deck);

  const solid = (x0, z0, x1, z1, h = 3) => W.colliders.push({ x0, z0, x1, z1, h });
  const building = (x0, z0, x1, z1, h, material, roof = 0xd98a5f) => {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const m = box(x1 - x0, h, z1 - z0, material, cx, h / 2, cz);
    g.add(m); W.solids.push(m); solid(x0, z0, x1, z1, h);
    const r = box(x1 - x0 + 0.6, 0.35, z1 - z0 + 0.6, flat(roof, 0.85), cx, h + 0.17, cz);
    g.add(r); W.solids.push(r);
    // Windows: dark inset planes on the long faces.
    const win = flat(0x2a2118, 0.4);
    const n = Math.max(1, Math.floor((x1 - x0) / 6));
    for (let i = 0; i < n; i++) {
      const wx = x0 + 3 + i * ((x1 - x0 - 6) / Math.max(1, n - 1) || 0);
      for (const [fz, ry] of [[z0 - 0.03, 0], [z1 + 0.03, Math.PI]]) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.2), win);
        w.position.set(wx, 3.4, fz); w.rotation.y = ry; g.add(w);
      }
    }
    return m;
  };

  // Perimeter walls.
  const pm = flat(0xb98a6e);
  for (const [w, d, x, z] of [[64, 1, 0, -22.5], [64, 1, 0, 22.5], [1, 44, -32.5, 0], [1, 44, 32.5, 0]]) {
    const m = box(w, 4.5, d, pm, x, 2.25, z); g.add(m); W.solids.push(m);
    solid(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 4.5);
  }
  // Buildings shape the lanes: north row, west row, south stalls, east sheds.
  building(-32, -22, -14, -10, 6.5, plasterRose);            // NW plaster block
  building(-10, -22, 2, -12, 7, plasterCream);              // north-mid block
  building(14, -22, 32, -17, 5.5, plasterTeal);             // Fish Market hall (north)
  building(-32, 10, -14, 22, 6, plasterCream);              // SW block
  building(-6, 13, 6, 18, 3.2, plasterRose);                // Bell Square south stall block
  building(26, 8, 32, 22, 5, flat(0x8a5a34, 0.9));          // Boathouse shed (timber)
  building(8, -8, 12, -4, 3.4, plasterTeal);                // mid-east kiosk
  // Low walls / planters that break sightlines without closing lanes.
  const lowWall = (x0, z0, x1, z1, h = 1.25) => {
    const m = box(x1 - x0, h, z1 - z0, flat(0xa8876a), (x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    g.add(m); W.solids.push(m); solid(x0, z0, x1, z1, h);
  };
  lowWall(-2, -4, 2, -3.4); lowWall(-2, 3.4, 2, 4); lowWall(12, -2, 12.6, 2);
  lowWall(-20, -2, -19.4, 2); lowWall(-24, 6, -20, 6.6);

  // Crates: labelled, stacked cover. Crate = box + label texture on all sides.
  const crate = (x, z, s, label, ry = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s),
      new THREE.MeshStandardMaterial({ map: crateTex(label), roughness: 0.9 }));
    m.position.set(x, s / 2, z); m.rotation.y = ry;
    m.castShadow = true; m.receiveShadow = true; g.add(m); W.solids.push(m);
    solid(x - s / 2, z - s / 2, x + s / 2, z + s / 2, s);
    return m;
  };
  crate(-12, -6, 1.3, 'SG-4'); crate(-10.6, -6, 1.1, 'SALT'); crate(-11.3, -6, 1.1, 'SG-4').position.y = 1.85;
  crate(16, -8, 1.3, 'FISH'); crate(17.4, -8, 1.1, 'SALT'); crate(6, 8, 1.3, 'SG-4');
  crate(-4, -10, 1.3, 'BRINE'); crate(10, 10, 1.3, 'FISH'); crate(18, 18, 1.3, 'SALT');
  crate(28, -6, 1.3, 'SG-4'); crate(28, 6, 1.2, 'BRINE');
  // Barrels.
  const barrelMat = flat(0x6e4a26, 0.8);
  for (const [x, z] of [[-16, 4], [-15, 5.2], [14, -12], [8, 16], [26, 2], [-8, 16]]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.15, 12), barrelMat);
    b.position.set(x, 0.58, z); b.castShadow = true; g.add(b); W.solids.push(b);
    solid(x - 0.55, z - 0.55, x + 0.55, z + 0.55, 1.15);
  }
  // Market stalls: posts + striped awning + counter.
  const stall = (x, z, teal, ry = 0) => {
    const s = new THREE.Group(); s.position.set(x, 0, z); s.rotation.y = ry;
    const post = flat(0x4a3018);
    for (const [px, pz] of [[-1.4, -1], [1.4, -1], [-1.4, 1], [1.4, 1]]) {
      s.add(box(0.14, 2.4, 0.14, post, px, 1.2, pz));
    }
    const aw = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.6),
      new THREE.MeshStandardMaterial({ map: teal ? awnT : awnR, roughness: 0.85, side: THREE.DoubleSide, emissive: 0x6a4a28, emissiveIntensity: 0.8 }));
    aw.rotation.x = -Math.PI / 2 + 0.22; aw.position.y = 2.55; s.add(aw);
    s.add(box(3, 1, 1.6, flat(0x7a5232), 0, 0.5, 0));
    g.add(s); solid(x - 1.5, z - 0.8, x + 1.5, z + 0.8, 1.0);
  };
  stall(18, -10, true); stall(14, -18.5, false, 0.3); stall(-22, 14, true, -0.2); stall(20, 18, false, 0.1);
  stall(-10, -14, true, 0.15);
  // Fountain at Fish Market (site A) + hazard ring around each relay.
  const fountain = new THREE.Group(); fountain.position.set(14, 0, -10);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.28, 10, 24), flat(0xcfc4ae));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.75; fountain.add(rim);
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.7, 24), flat(0xbfae90));
  basin.position.y = 0.35; fountain.add(basin);
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.75, 24),
    new THREE.MeshStandardMaterial({ color: 0x3f8f8a, roughness: 0.15, metalness: 0.3 }));
  water.rotation.x = -Math.PI / 2; water.position.y = 0.68; fountain.add(water);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.6, 10), flat(0xd8cbae));
  col.position.y = 1.4; fountain.add(col);
  g.add(fountain); solid(12, -12, 16, -8, 0.75);
  // Relay plinths: the keg objective. Barrel + plinth + hazard ring + sign.
  for (const [key, s] of Object.entries(SITES)) {
    const grp = new THREE.Group(); grp.position.set(s.x, 0, s.z);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.5, 16), flat(0x8a7a5e));
    plinth.position.y = 0.25; grp.add(plinth);
    const keg = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.05, 14),
      new THREE.MeshStandardMaterial({ color: 0xb3541e, roughness: 0.6, emissive: 0x000000 }));
    keg.position.y = 1.02; keg.castShadow = true; grp.add(keg);
    keg.userData.keg = key;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.1, 28),
      new THREE.MeshStandardMaterial({ map: haz, roughness: 0.8, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; grp.add(ring);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.35),
      new THREE.MeshStandardMaterial({ map: signTex(s.name, 'SITE ' + key), roughness: 0.7 }));
    sign.position.set(0, 4.4, key === 'A' ? -3.4 : 3.4);
    sign.rotation.y = key === 'A' ? 0 : Math.PI;
    grp.add(sign);
    g.add(grp);
    W.sites[key] = { ...s, keg, grp };
    solid(s.x - 1.3, s.z - 1.3, s.x + 1.3, s.z + 1.3, 0.5);
  }
  // Big wall sign on the Boathouse shed + Fish Market hall.
  const bigSign = (text, x, y, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75),
      new THREE.MeshStandardMaterial({ map: signTex(text), roughness: 0.75 }));
    m.position.set(x, y, z); m.rotation.y = ry; g.add(m);
  };
  bigSign('BOATHOUSE', 25.9, 4.2, 8, Math.PI);
  bigSign('FISH MARKET', 23, 4.6, -16.9, 0);
  // Lamps: warm point glow at dusk.
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb84d, emissiveIntensity: 1.6 });
  for (const [x, z] of [[0, 0], [-14, 0], [14, 0], [0, -10], [0, 14], [24, 0]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 3.4, 8), flat(0x2c2620));
    pole.position.set(x, 1.7, z); g.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), lampMat);
    bulb.position.set(x, 3.5, z); g.add(bulb);
  }
  // Dusk sky: gradient dome + low sun disc + drifting cloud cards.
  const skyGeo = new THREE.SphereGeometry(180, 16, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x7a5a8a) }, mid: { value: new THREE.Color(0xe89a62) }, bot: { value: new THREE.Color(0xf2c184) } },
    vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top,mid,bot; void main(){ float h=normalize(vP).y; vec3 c=h>0.25?mix(mid,top,smoothstep(0.25,0.8,h)):mix(bot,mid,smoothstep(-0.05,0.25,h)); gl_FragColor=vec4(c,1.0); }',
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
  const sun = new THREE.Mesh(new THREE.CircleGeometry(9, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false }));
  sun.position.set(-120, 26, -60); sun.lookAt(0, 0, 0); scene.add(sun);
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xf7d9c2, transparent: true, opacity: 0.32, fog: false });
  for (const [x, y, z, w] of [[-60, 48, -80, 34], [40, 56, -70, 44], [70, 44, 40, 30], [-30, 60, 70, 38]]) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.22), cloudMat);
    c.position.set(x, y, z); c.lookAt(0, 10, 0); scene.add(c);
  }
  scene.fog = new THREE.Fog(0xe0a878, 70, 170);
  const hemi = new THREE.HemisphereLight(0xf2c184, 0x6b4a34, 1.15);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xffc98a, 2.2);
  sunLight.position.set(-40, 26, -18);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.left = -40; sunLight.shadow.camera.right = 40;
  sunLight.shadow.camera.top = 30; sunLight.shadow.camera.bottom = -30;
  sunLight.shadow.camera.far = 120;
  scene.add(sunLight);
  scene.add(sunLight.target);

  // Waypoint lanes (smugglers push west->east; wardens hold/rotate).
  W.lanes = {
    A: [[-28, 0], [-14, -4], [-2, -4], [8, -8], [16, -12], [21, -14]],
    B: [[-28, 2], [-14, 8], [-2, 12], [8, 14], [16, 14], [21, 14]],
    mid: [[-28, -14], [-12, -14], [0, -10], [10, -10], [18, -12]],
    low: [[-28, 16], [-12, 16], [0, 16], [12, 16], [20, 16]],
  };
  W.spawns = {
    smug: [[-28, -4], [-28, 0], [-28, 4], [-26, -8], [-26, 8]],
    ward: [[26, -18], [28, -10], [26, 10], [28, 18], [18, 0]],
  };
  return W;
}
