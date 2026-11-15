// palette.js — one job: the game's chosen look. Dusk over a furnace works:
// a violet-orange sky, brick red, soot concrete, hazard yellow, ember glow
// and cool teal glass. Every material in the game comes from here, so the
// map reads as one place at a glance.

export const PALETTE = {
  sky: 0x2e2140,          // dusk violet (scene background + fog)
  fogNear: 26, fogFar: 90,
  sun: 0xffb36b,           // low orange sun
  sunIntensity: 2.6,
  hemiSky: 0x8a7bd8, hemiGround: 0x3a2a22, hemiIntensity: 1.05,
  floor: 0x8d8578,         // worn concrete
  floorDark: 0x6f6a5e,
  brick: 0x9a4a34,         // furnace brick
  brickDark: 0x74382a,
  concrete: 0x9b938a,
  steel: 0x5c6670,
  steelDark: 0x3d454d,
  crate: 0xa97c46,         // timber crates
  crateDark: 0x7d5a30,
  containerGreen: 0x2f6b4f,
  containerRust: 0x8a5a2e,
  hazard: 0xe8b400,        // hazard stripes
  ember: 0xff7a1a,         // furnace glow (emissive)
  glass: 0x7fd4c8,         // salt-glass teal
  teamEmber: 0xff8a3c,     // attacker accent (orange)
  teamAsh: 0x59b7ff,       // defender accent (blue)
  white: 0xf2ede4,
};

export const WEAPON_COLORS = {
  body: 0x23262b, grip: 0x3a2e22, metal: 0x4a5058, accent: 0xc96a1e,
};
