# SLAGWORKS — Furnace Row tactical FPS

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
  **1–4** weapons, **5–6** grenades, **right-click** scope (Napier DMR).
- EMBER attacks, ASH defends. First to 7 rounds in 12 takes the match.
- Weapons: Wren-9 pistol, Shiv SMG ($1,200), Lancer AR ($2,500), Napier
  DMR ($3,500), Charge HE ($300), Smoke ($250), Armour + Helm ($650).
- Kills pay $300, round wins $3,250, losses $1,900+ (streak bonus).

## How it is built

- `game/src/main.js` — bootstrap + fixed-step (60 Hz) loop only.
- `game/src/world.js` — the SLAGWORKS map: boxes for colliders, meshes
  and the minimap; sites, spawns and the waypoint graph.
- `game/src/player.js` — movement, AABB collision, health/armour.
- `game/src/weapon.js` — guns, spread/recoil model, grenades.
- `game/src/bots.js` — bot brains: routes, perception, bursts, objective.
- `game/src/rounds.js` — the match: freeze/live/end, economy, bomb.
- `game/src/hud.js` — HUD, minimap, kill feed, buy menu.
- `game/src/audio.js` — procedural WebAudio sounds (no audio files).
- `game/src/effects.js` — pooled tracers, flashes, smoke, explosions.

Screenshots are staged with `?shot=start|play|site|end&seed=1`, which runs
the simulation forward so each shot shows a real mid-round state.
