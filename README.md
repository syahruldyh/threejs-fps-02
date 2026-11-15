# SLAGWORKS v2 — Furnace Row tactical FPS

A 5v5 round-based tactical FPS for make.fun's `threejs-fps-02` bounty,
in the Counter-Strike style but fully original: an industrial
furnace-works map with two bomb sites, a buy economy, plant/defuse,
and bots that walk routes, hold lanes and react to what they see and hear.

## Play

Serve `game/` with any static server and open `index.html` in desktop
Chrome (single-player vs bots, no network):

```
python3 -m http.server 8080 --directory game
```

- **WASD** move, **mouse** aim, **click** fire, **R** reload, **B** buy
  (during freeze), **E** plant / defuse, **Ctrl** crouch, **Space** jump,
  **1–6** weapons, **7–0 / Q** grenades, **right-click** scope (Napier DMR).
- EMBER attacks, ASH defends. First to 7 rounds in 12 takes the match.
- Weapons: Wren-9 pistol, Shiv SMG ($1,200), Lancer AR ($2,500),
  Boomstick-8 shotgun ($1,150, six pellets per shot), Napier DMR
  ($3,500), Mule-60 LMG ($3,600). Armour ($650) and Helmet ($350) are
  separate buys. Utility: Charge HE ($300), Smoke ($250), Sunset Flash
  ($200, blinds), Ember Jar molotov ($400, denies ground), Decoy Whistle
  ($150, fake gunfire that pulls rotations).
- Kills pay $300, round wins $3,250, losses $1,900+ (streak bonus).
- Bots buy like players (rifle, armour, utility), execute one site
  together with a smoke on the gate, rotate on the plant, and call out
  named places on radio ("contact, Furnace Hall").

## How it is built

- `game/src/main.js` — bootstrap + fixed-step (60 Hz) loop only.
- `game/src/world.js` — the SLAGWORKS map: procedural brick,
  cobblestone, wood and corrugated-metal textures tiled to real scale,
  painted site signs, a dusk sky with a sun disc and drifting clouds,
  chimney smoke, barrels, planters and wall lamps.
- `game/src/player.js` — movement, AABB collision, health/armour/helmet.
- `game/src/weapon.js` — guns, spread/recoil model, grenades (incl. the
  six-pellet Boomstick and the flash/molotov/decoy).
- `game/src/bots.js` — bot brains: routes, perception, bursts, objective,
  executes, economy buys, flash blindness, fire avoidance, name tags.
- `game/src/rounds.js` — the match: freeze/live/end, economy, bomb.
- `game/src/hud.js` — HUD, minimap with named callouts, kill feed with
  headshot marks, damage numbers, team roster, compass, buy menu.
- `game/src/audio.js` — procedural WebAudio sounds (no audio files).
- `game/src/effects.js` — pooled tracers, flashes, smoke, explosions,
  molotov fire pools.

Screenshots are staged with `?shot=start|play|site|end&seed=1`, which runs
the simulation forward so each shot shows a real mid-match state (round
5–6, a score on the board, a firefight in frame).
