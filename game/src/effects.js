// effects.js — one job: everything you see when a shot is fired. Tracers,
// muzzle flash, impact sparks, smoke clouds and explosions, all from fixed
// pools: nothing is created or thrown away during a round, so the hot loop
// never allocates.

import * as THREE from 'three';

let smokeTex = null;
function puffTexture() {
  if (smokeTex) return smokeTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  // A soft puff: most of the alpha lives near the middle and falls off
  // slowly, so the cloud has volume instead of a hard white disc.
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(205,205,205,0.55)');
  grad.addColorStop(0.5, 'rgba(200,200,200,0.35)');
  grad.addColorStop(1, 'rgba(200,200,200,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  smokeTex = new THREE.CanvasTexture(c);
  return smokeTex;
}

let fireTex = null;
function flameTexture() {
  if (fireTex) return fireTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 40, 2, 32, 36, 30);
  grad.addColorStop(0, 'rgba(255,220,120,0.95)');
  grad.addColorStop(0.45, 'rgba(255,130,30,0.75)');
  grad.addColorStop(1, 'rgba(255,80,10,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  fireTex = new THREE.CanvasTexture(c);
  return fireTex;
}

export function createEffects(scene) {
  const tracers = [];
  const tracerGeo = new THREE.BufferGeometry();
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 24; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, tracerMat.clone());
    line.visible = false; line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, ttl: 0 });
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 0.55),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false }),
  );
  flash.visible = false; scene.add(flash);
  const flashLight = new THREE.PointLight(0xffb36b, 0, 9, 2);
  scene.add(flashLight);
  // Impact sparks: one Points cloud, 8 particles per burst, reused.
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xffc46b, size: 0.09 }));
  sparks.visible = false; sparks.frustumCulled = false; scene.add(sparks);
  let sparkTtl = 0;
  const sparkVel = [];
  for (let i = 0; i < 8; i++) sparkVel.push(new THREE.Vector3());
  const smokes = []; // {pos, r, ttl, sprites[]}
  const fireZones = []; // {pos, r, ttl, sprites[], light}

  const eff = {
    smokes, fireZones,
    tracer(a, b) {
      const t = tracers.find((x) => x.ttl <= 0) || tracers[0];
      const attr = t.line.geometry.getAttribute('position');
      attr.setXYZ(0, a.x, a.y, a.z); attr.setXYZ(1, b.x, b.y, b.z);
      attr.needsUpdate = true;
      t.line.visible = true; t.ttl = 0.12;
    },
    muzzle(pos, dir) {
      flash.position.copy(pos).addScaledVector(dir, 0.7);
      flash.lookAt(pos.clone().addScaledVector(dir, 2));
      flash.material.opacity = 0.95; flash.visible = true;
      flashLight.position.copy(pos); flashLight.intensity = 26;
      setTimeout(() => { flash.material.opacity = 0; flash.visible = false; flashLight.intensity = 0; }, 45);
    },
    impact(p) {
      const attr = sparkGeo.getAttribute('position');
      for (let i = 0; i < 8; i++) {
        attr.setXYZ(i, p.x, p.y, p.z);
        sparkVel[i].set((Math.random() - 0.5) * 4, Math.random() * 3 + 1, (Math.random() - 0.5) * 4);
      }
      attr.needsUpdate = true;
      sparks.visible = true; sparkTtl = 0.28;
    },
    smokeAt(pos, r) {
      // A real cloud, not a white blob: 8 smaller puffs in a tight
      // cluster, mid opacity, so you can still read the lane through it.
      const group = [];
      for (let i = 0; i < 8; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(), transparent: true, opacity: 0.5, depthWrite: false }));
        s.position.set(pos.x + (Math.random() - 0.5) * r * 1.1, pos.y + 0.4 + Math.random() * 1.4, pos.z + (Math.random() - 0.5) * r * 1.1);
        const sc = r * (0.55 + Math.random() * 0.25);
        s.scale.set(sc, sc, 1);
        scene.add(s); group.push(s);
      }
      smokes.push({ pos: pos.clone(), r, ttl: 15, sprites: group });
    },
    // Molotov fire pool: orange flames + light, 6 s of area denial.
    fireAt(pos, r) {
      const group = [];
      for (let i = 0; i < 7; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTexture(), transparent: true, opacity: 0.85, depthWrite: false }));
        s.position.set(pos.x + (Math.random() - 0.5) * r * 1.4, pos.y + 0.3 + Math.random() * 0.5, pos.z + (Math.random() - 0.5) * r * 1.4);
        const sc = r * (0.5 + Math.random() * 0.4);
        s.scale.set(sc, sc * 1.3, 1);
        scene.add(s); group.push(s);
      }
      const light = new THREE.PointLight(0xff7a1a, 18, 10, 1.8);
      light.position.set(pos.x, pos.y + 1, pos.z); scene.add(light);
      fireZones.push({ pos: pos.clone(), r, ttl: 6, sprites: group, light });
    },
    explosion(p) {
      flash.position.copy(p); flash.scale.set(4, 4, 4);
      flash.material.opacity = 1; flash.visible = true;
      flashLight.position.copy(p); flashLight.intensity = 90;
      setTimeout(() => { flash.material.opacity = 0; flash.visible = false; flash.scale.set(1, 1, 1); flashLight.intensity = 0; }, 120);
      eff.impact(p);
    },
    // Do any smoke puffs block the segment a->b?
    blocked(a, b) {
      for (const s of smokes) {
        if (s.ttl <= 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const len2 = dx * dx + dy * dy + dz * dz;
        let t = len2 > 0 ? ((s.pos.x - a.x) * dx + (s.pos.y - a.y) * dy + (s.pos.z - a.z) * dz) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = a.x + dx * t - s.pos.x, cy = a.y + dy * t - s.pos.y, cz = a.z + dz * t - s.pos.z;
        if (cx * cx + cy * cy + cz * cz < s.r * s.r) return true;
      }
      return false;
    },
    update(dt) {
      for (const t of tracers) {
        if (t.ttl > 0) { t.ttl -= dt; if (t.ttl <= 0) t.line.visible = false; }
      }
      if (sparkTtl > 0) {
        sparkTtl -= dt;
        const attr = sparkGeo.getAttribute('position');
        for (let i = 0; i < 8; i++) {
          attr.setXYZ(i, attr.getX(i) + sparkVel[i].x * dt, attr.getY(i) + sparkVel[i].y * dt, attr.getZ(i) + sparkVel[i].z * dt);
          sparkVel[i].y -= 9 * dt;
        }
        attr.needsUpdate = true;
        if (sparkTtl <= 0) sparks.visible = false;
      }
      for (let i = smokes.length - 1; i >= 0; i--) {
        const s = smokes[i];
        s.ttl -= dt;
        for (const spr of s.sprites) spr.material.opacity = Math.max(0, Math.min(0.5, s.ttl / 4));
        if (s.ttl <= 0) {
          for (const spr of s.sprites) { scene.remove(spr); spr.material.dispose(); }
          smokes.splice(i, 1);
        }
      }
      for (let i = fireZones.length - 1; i >= 0; i--) {
        const fz = fireZones[i];
        fz.ttl -= dt;
        fz.light.intensity = 18 * Math.max(0, Math.min(1, fz.ttl / 2)) * (0.85 + Math.random() * 0.3);
        for (const spr of fz.sprites) spr.material.opacity = Math.max(0, Math.min(0.85, fz.ttl / 2));
        if (fz.ttl <= 0) {
          for (const spr of fz.sprites) { scene.remove(spr); spr.material.dispose(); }
          scene.remove(fz.light);
          fireZones.splice(i, 1);
        }
      }
    },
  };
  return eff;
}
