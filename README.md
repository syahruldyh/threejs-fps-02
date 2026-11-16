# BRINE & BLAZE — Quay Seven

![bounty](https://make.fun/badge/threejs-fps-02.svg)
![rank](https://make.fun/badge/threejs-fps-02/syahruldyh/threejs-fps-02/rank.svg)
![reward](https://make.fun/badge/threejs-fps-02/syahruldyh/threejs-fps-02/reward.svg)

A 5v5 round-based tactical FPS in three.js, entered in [make.fun threejs-fps-02](https://make.fun/bounty/threejs-fps-02). First to 7 over 12 rounds on a Mediterranean harbour market at dusk: Smugglers light the keg at the Fish Market (site A) or the Boathouse (site B); Wardens douse it — or wipe the crew.

## Play

Serve `game/` with any static server and open it in desktop Chrome (WebGL 2, no network requests, no build step):

```
python3 -m http.server 8080   # then open http://localhost:8080/game/
```

or `node serve.ts` (serves on http://localhost:8080).

## Controls

- **WASD** move · **Mouse** aim (click to lock) · **Click** fire · **R** reload
- **Shift** sprint · **Ctrl/C** crouch · **B** armory during buy phase · **E** light / douse the keg
- **1–4** weapons (primary / Sparrow .32 / Blade / grenades)

## The game

- **Buy economy** — Chandler's Counter: 7 guns (Sparrow .32, Mastiff .45, Cicada 9, Brine 12, Corsa AR, Tramont AR, Meridian LR), Jerkin armour and Jerkin + Cap, Cracker frag, Glare flash, Seafog smoke, and a Warden-only Douse Kit. Round win $3250, loss $1900, kill +$300.
- **Objective** — arm the timed charge at either relay with E (3 s channel); the keg burns 35 s, defenders douse it (5 s, 2.5 s with the kit). Elimination also wins the round.
- **Gunplay** — hitscan with headshot multipliers, recoil and spread that punish firing on the move, crouching and sprinting, armour that soaks half of every hit, muzzle flash, tracers, hitmarkers, procedural WebAudio (shots, reloads, footsteps, plant/douse beeps).
- **Bots** — eight named operators (Fenn, Marrow, Tamsin, Isolde, Hale, Quill, Osric, Brannoch) on waypoint lanes: they hold sites, rotate, push one site together on a radio call, react to what they see and hear, and converge to douse a lit keg.
- **Map** — Low Road, Bell Square, Fish Market (A) and Boathouse (B), with named minimap areas, 3D site signs, labelled crates, hazard rings, a fountain, market stalls with striped awnings, and a dusk sky with a low sun. Fixed-step 60 Hz simulation, separate from rendering.
- **HUD** — minimap with area names and A/B markers, team score and round timer, kill feed with headshot marks, radio lines, team roster, compass, health / armour / cash, ammo and weapon slots.

## Layout

- `main.ts` — Node 22 entry point: copies `game/` + `screenshots/` to `/output` and writes `dossier.json` via `vendor/makefun-threejs.ts`.
- `game/` — the game: `index.html` (import map → vendored three.js 0.187.0), `src/` modules (sim, world, bots, combat, hud, audio, viewmodel), `vendor/three/` (byte-for-byte three.js 0.187.0).
- `screenshots/` — genuine renders captured from the running game (`?shot=` staged modes).

## License

MIT. See `LICENSE`.
