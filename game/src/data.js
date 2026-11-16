// Static game data: weapons, buy catalogue, crews, radio lines, map areas.
// 5v5 round-based tactical FPS, buy economy, plant/douse, team-tactics bots.
export const WEAPONS = {
  sparrow: { name: 'Sparrow .32', key: '1', price: 0, dmg: 26, head: 2.0, rpm: 340, mag: 12, reserve: 48, spread: 0.011, moveSpread: 0.030, recoil: 0.011, auto: false, range: 26, len: 0.34, desc: 'light sidearm, fast draw' },
  mastiff: { name: 'Mastiff .45', key: '2', price: 700, dmg: 38, head: 2.0, rpm: 300, mag: 10, reserve: 40, spread: 0.010, moveSpread: 0.026, recoil: 0.016, auto: false, range: 26, len: 0.36, desc: 'heavy pistol, one clean tap' },
  cicada: { name: 'Cicada 9', key: '3', price: 1250, dmg: 22, head: 2.0, rpm: 720, mag: 30, reserve: 120, spread: 0.020, moveSpread: 0.045, recoil: 0.010, auto: true, range: 24, len: 0.52, desc: 'fast fire, close range' },
  brine: { name: 'Brine 12', key: '4', price: 1500, dmg: 13, head: 1.6, rpm: 75, mag: 6, reserve: 24, spread: 0.055, moveSpread: 0.075, recoil: 0.05, auto: false, range: 14, pellets: 8, len: 0.62, desc: 'a wall of lead at arm\u2019s length' },
  corsa: { name: 'Corsa AR', key: '5', price: 2700, dmg: 30, head: 2.0, rpm: 560, mag: 30, reserve: 90, spread: 0.009, moveSpread: 0.032, recoil: 0.014, auto: true, range: 40, len: 0.72, desc: 'the quay\u2019s workhorse rifle' },
  tramont: { name: 'Tramont AR', key: '6', price: 3000, dmg: 33, head: 2.0, rpm: 620, mag: 25, reserve: 75, spread: 0.008, moveSpread: 0.030, recoil: 0.013, auto: true, range: 44, len: 0.74, desc: 'flatter, faster, meaner' },
  meridian: { name: 'Meridian LR', key: '7', price: 4750, dmg: 95, head: 3.0, rpm: 55, mag: 5, reserve: 15, spread: 0.001, moveSpread: 0.05, recoil: 0.06, auto: false, range: 60, scope: true, len: 0.95, desc: 'scoped — one clean headshot' },
  blade: { name: 'Blade', key: '3', price: 0, dmg: 40, head: 1.5, rpm: 90, mag: Infinity, reserve: Infinity, spread: 0, moveSpread: 0, recoil: 0, auto: false, range: 2.2, melee: true, len: 0.4, desc: 'quiet work up close' },
};
// Buy menu rows: [key, id, label, price, note, kind]
export const BUY = [
  ['1', 'sparrow', 'Sparrow .32 pistol', 0, 'light sidearm, fast draw', 'gun'],
  ['2', 'mastiff', 'Mastiff .45 pistol', 700, 'heavy pistol, one clean tap', 'gun'],
  ['3', 'cicada', 'Cicada 9 smg', 1250, 'fast fire, close range', 'gun'],
  ['4', 'brine', 'Brine 12 shotgun', 1500, 'a wall of lead at arm\u2019s length', 'gun'],
  ['5', 'corsa', 'Corsa AR rifle', 2700, 'the quay\u2019s workhorse rifle', 'gun'],
  ['6', 'tramont', 'Tramont AR rifle', 3000, 'flatter, faster, meaner', 'gun'],
  ['7', 'meridian', 'Meridian LR sniper', 4750, 'scoped — one clean headshot', 'gun'],
  ['8', 'jerkin', 'Jerkin body armour', 650, 'soaks half of every hit', 'armour'],
  ['9', 'jerkincap', 'Jerkin + Cap armour and helmet', 1000, 'armour, plus a hard head', 'armour'],
  ['0', 'cracker', 'Cracker frag', 300, 'cooks 1.2s, clears a corner', 'nade'],
  ['F', 'glare', 'Glare flash', 200, 'white-out for anyone looking', 'nade'],
  ['T', 'seafog', 'Seafog smoke', 300, 'a wall of fog that breaks sight lines', 'nade'],
  ['0', 'dousekit', 'Douse Kit', 400, 'Wardens only — halves the douse', 'kit'],
];
export const SMUGGLERS = ['Fenn', 'Marrow', 'Tamsin', 'Isolde', 'Hale'];
export const WARDENS = ['Quill', 'Osric', 'Brannoch', 'Sable', 'Wren'];
export const RADIO_PLANS = [
  ['Fenn', 'Default, then we hit Boathouse'],
  ['Fenn', 'Hit Boathouse now, smokes out'],
  ['Marrow', 'Contact Bell Square'],
  ['Tamsin', 'Two at the fish crates, flash on the gate'],
  ['Isolde', 'Rotating Fish Market, cover Low Road'],
  ['Hale', 'Keg down at A — hold the fountain'],
];
export const RADIO_CONTACT = [
  ['Marrow', 'Contact Bell Square'],
  ['Fenn', 'Warden on the crates, mid'],
  ['Tamsin', 'One pushing Low Road'],
  ['Hale', 'Two at Boathouse door'],
  ['Isolde', 'Sniper on the roof line'],
];
// Map areas for the minimap + callouts. x east, z south; map spans x -32..32, z -22..22.
export const AREAS = [
  { name: 'LOW ROAD', x0: -32, z0: 8, x1: -6, z1: 22 },
  { name: 'BELL SQUARE', x0: -8, z0: -8, x1: 8, z1: 8 },
  { name: 'FISH MARKET', x0: 8, z0: -22, x1: 32, z1: -4 },
  { name: 'BOATHOUSE', x0: 8, z0: 4, x1: 32, z1: 22 },
  { name: 'NORTH LANE', x0: -32, z0: -22, x1: 8, z1: -8 },
];
export function areaAt(x, z) {
  for (const a of AREAS) if (x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1) return a.name;
  return 'QUAY SEVEN';
}
export const SITES = {
  A: { x: 24, z: -14, name: 'FISH MARKET', label: 'FISH MARKET SITE A' },
  B: { x: 24, z: 14, name: 'BOATHOUSE', label: 'BOATHOUSE SITE B' },
};
