// First-person viewmodel: block-built guns, one silhouette per weapon family.
// Barrel, receiver, magazine, stock, sight and grip are boxes; the muzzle tip
// is where tracers and the flash sprite anchor. No new geometry per frame:
// parts are built once per weapon and swapped by visibility.
import * as THREE from 'three';
import { WEAPONS } from './data.js';

const GUNMETAL = 0x2e3134, DARKWOOD = 0x6e4a26, TAN = 0xc9a06a, BRASS = 0xd8a83c;
function part(w, h, d, color, x, y, z, mat = null) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
    mat || new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.45 }));
  m.position.set(x, y, z);
  return m;
}
export class ViewModel {
  constructor(camera, flashTex) {
    this.group = new THREE.Group();
    this.group.position.set(0.30, -0.28, -0.55);
    this.group.scale.setScalar(0.72);
    camera.add(this.group);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flashTex, transparent: true, opacity: 0, depthWrite: false, depthTest: false,
    }));
    this.flash.scale.set(0.45, 0.45, 1);
    this.group.add(this.flash);
    this.models = {};
    this.current = null;
    this.kick = 0;       // recoil offset, decays every frame
    this.swayT = 0;
    this.baseY = -0.28;
    for (const id of Object.keys(WEAPONS)) this.models[id] = this._build(id);
  }
  _build(id) {
    const w = WEAPONS[id], g = new THREE.Group();
    const L = w.len;
    const metal = new THREE.MeshStandardMaterial({ color: GUNMETAL, roughness: 0.5, metalness: 0.5 });
    const wood = new THREE.MeshStandardMaterial({ color: DARKWOOD, roughness: 0.8 });
    // Receiver + barrel + stock, scaled to the weapon's length.
    g.add(part(0.075, 0.09, L * 0.55, GUNMETAL, 0, 0.02, -L * 0.2, metal));
    g.add(part(0.05, 0.05, L * 0.5, GUNMETAL, 0, 0.03, -L * 0.62, metal));
    g.add(part(0.06, 0.11, L * 0.22, DARKWOOD, 0, -0.01, L * 0.28, wood));
    g.add(part(0.055, 0.07, 0.16, TAN, 0, -0.02, L * 0.05)); // handguard
    if (id === 'sparrow' || id === 'mastiff') {
      g.add(part(0.06, 0.14, 0.1, GUNMETAL, 0, -0.08, 0.08, metal)); // grip
      g.children[0].scale.z = 0.6;
    } else {
      g.add(part(0.05, 0.16, 0.07, GUNMETAL, 0, -0.09, -L * 0.05, metal)); // magazine
      g.add(part(0.05, 0.1, 0.07, GUNMETAL, 0, -0.07, L * 0.16, metal));   // grip
    }
    if (id === 'brine') { // pump + fat barrel
      g.add(part(0.07, 0.06, L * 0.4, DARKWOOD, 0, -0.02, -L * 0.55, wood));
      g.add(part(0.075, 0.075, L * 0.3, GUNMETAL, 0, 0.03, -L * 0.75, metal));
    }
    if (id === 'meridian') { // scope + long barrel + bipod hint
      g.add(part(0.05, 0.06, 0.22, GUNMETAL, 0, 0.09, -L * 0.25, metal));
      g.add(part(0.045, 0.045, 0.05, BRASS, 0, 0.09, -L * 0.38, metal));
    }
    if (id === 'cicada') g.add(part(0.04, 0.05, 0.2, GUNMETAL, 0, 0.02, -L * 0.7, metal));
    if (id === 'blade') { // knife: short grip + flat blade
      g.children.length = 0;
      g.add(part(0.05, 0.05, 0.16, DARKWOOD, 0, -0.02, 0.1, wood));
      g.add(part(0.012, 0.05, 0.3, 0xb9c0c4, 0, 0.01, -0.14,
        new THREE.MeshStandardMaterial({ color: 0xb9c0c4, roughness: 0.25, metalness: 0.9 })));
    }
    // Hands: two simple skin-tone blocks holding the gun.
    const skin = new THREE.MeshStandardMaterial({ color: 0xc99a72, roughness: 0.75 });
    g.add(part(0.07, 0.06, 0.12, 0xc99a72, 0.02, -0.075, -L * 0.05, skin));
    g.add(part(0.07, 0.06, 0.1, 0xc99a72, -0.01, -0.06, L * 0.14, skin));
    g.visible = false;
    this.group.add(g);
    return g;
  }
  equip(id) {
    if (this.current) this.models[this.current].visible = false;
    this.current = id;
    this.models[id].visible = true;
    const w = WEAPONS[id];
    this.flash.position.set(0, 0.03, -w.len * 0.95);
  }
  muzzleWorld(out) {
    const m = this.models[this.current];
    if (!m) return null;
    return m.localToWorld(out.set(0, 0.03, -WEAPONS[this.current].len * 0.95));
  }
  recoil(amount) { this.kick = Math.min(0.09, this.kick + amount); }
  flashOn() { this.flash.material.opacity = 1; }
  update(dt, moving, scoped) {
    this.kick = Math.max(0, this.kick - dt * 0.35);
    this.swayT += dt * (moving ? 9 : 4.5);
    const sway = moving ? 0.012 : 0.006;
    this.group.position.y = this.baseY + Math.sin(this.swayT) * sway + this.kick * 0.4;
    this.group.position.z = -0.55 + this.kick;
    this.group.position.x = scoped ? 0 : 0.30 + Math.cos(this.swayT * 0.7) * sway * 0.5;
    if (this.flash.material.opacity > 0) this.flash.material.opacity = Math.max(0, this.flash.material.opacity - dt * 14);
  }
}
