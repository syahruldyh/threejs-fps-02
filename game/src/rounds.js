// rounds.js — one job: the match. Freeze, live, end; first to 7 in 12.
// Money: kills pay, wins pay more than losses, losses in a row pay more.
// The bomb: one attacker carries it, plants in 3 seconds, ticks for 40,
// defuses in 10. Elimination, detonation, defuse or the clock ends a round.

import { WEAPONS, buyWeapon, buyGrenade } from './weapon.js';

export const FREEZE_S = 8, ROUND_S = 100, BOMB_S = 40, PLANT_S = 3, DEFUSE_S = 10;
export const WIN_ROUNDS = 7, MAX_ROUNDS = 12;

export function createRounds(game) {
  const r = {
    phase: 'freeze', round: 0, timer: FREEZE_S,
    score: { ember: 0, ash: 0 },
    lossStreak: { ember: 0, ash: 0 },
    bomb: { state: 'carried', site: null, carrier: null, plantedAt: 0, pos: null },
    playerChannel: null, // {kind:'plant'|'defuse', t}
    banner: null, matchOver: false, winner: null,
  };
  return r;
}

function aliveCount(game, team) {
  return game.fighters.filter((f) => f.alive && f.team === team).length;
}

function resetPositions(game) {
  const r = game.rounds;
  // Respawn everybody at their spawns, full health, fresh loadouts kept.
  const emberSpawns = game.world.spawns.ember, ashSpawns = game.world.spawns.ash;
  let ei = 0, ai = 0;
  for (const f of game.fighters) {
    const s = f.team === 'ember' ? emberSpawns[ei++ % emberSpawns.length] : ashSpawns[ai++ % ashSpawns.length];
    f.pos.set(s.x, 0, s.z);
    f.vel.set(0, 0, 0);
    f.hp = 100; f.alive = true;
    f.yaw = f.team === 'ember' ? 0 : Math.PI; f.pitch = 0;
    if (f.bot) { f.bot.dead = false; f.bot.target = null; f.bot.plantT = 0; f.bot.defuseT = 0; }
  }
  // Pick the carrier: the player if alive on EMBER, else a random attacker.
  const attackers = game.fighters.filter((f) => f.team === 'ember');
  r.bomb.carrier = attackers[Math.floor(game.rng() * attackers.length)];
  r.bomb.state = 'carried'; r.bomb.site = null; r.bomb.pos = null;
  // Assign routes: 2 A, 2 B, 1 mid per side; defenders hold their sites.
  const atk = game.fighters.filter((f) => f.team === 'ember' && f.bot);
  const def = game.fighters.filter((f) => f.team === 'ash' && f.bot);
  const atkRoutes = ['atkA', 'atkB', 'atkMid', 'atkA', 'atkB'];
  const defRoutes = ['defA', 'defB', 'defMid', 'defA', 'defB'];
  atk.forEach((f, i) => {
    const route = game.world.routes[atkRoutes[i % atkRoutes.length]];
    f.bot.route = [...route]; f.bot.routeIdx = 0; f.bot.hold = null;
  });
  def.forEach((f, i) => {
    const route = game.world.routes[defRoutes[i % defRoutes.length]];
    f.bot.route = [...route]; f.bot.routeIdx = 0; f.bot.hold = null;
  });
  // The player walks their own route (none): they choose.
  r.playerChannel = null;
}

export function startMatch(game) {
  const r = game.rounds;
  r.score = { ember: 0, ash: 0 };
  r.lossStreak = { ember: 0, ash: 0 };
  r.round = 0; r.matchOver = false; r.winner = null;
  nextRound(game);
}

function nextRound(game) {
  const r = game.rounds;
  r.round++;
  r.phase = 'freeze'; r.timer = FREEZE_S;
  r.banner = `ROUND ${r.round} — ${r.round === 1 ? 'SLAGWORKS' : ''}`;
  resetPositions(game);
  game.hud.banner(r.banner, 'Furnace Row — first to 7');
  game.audio.click();
}

function endRound(game, winner, reason) {
  const r = game.rounds;
  if (r.phase === 'end') return;
  r.phase = 'end'; r.timer = 4;
  r.score[winner]++;
  const loser = winner === 'ember' ? 'ash' : 'ember';
  r.lossStreak[winner] = 0;
  r.lossStreak[loser]++;
  // Payouts: win 3250, loss 1900 + 500 per loss in a row (cap 3400).
  for (const f of game.fighters) {
    const won = f.team === winner;
    const pay = won ? 3250 : Math.min(3400, 1900 + 500 * (r.lossStreak[f.team] - 1));
    f.money = (f.money ?? 800) + pay;
  }
  const label = winner === 'ember' ? 'EMBER takes the round' : 'ASH takes the round';
  r.banner = label;
  game.hud.banner(label, reason);
  if (winner === 'ember') game.audio.win(); else game.audio.lose();
  game.radio(null, reason);
  if (r.score.ember >= WIN_ROUNDS || r.score.ash >= WIN_ROUNDS || r.round >= MAX_ROUNDS) {
    r.matchOver = true;
    r.winner = r.score.ember === r.score.ash ? 'draw' : r.score.ember > r.score.ash ? 'ember' : 'ash';
  }
}

export function updateRounds(game, dt) {
  const r = game.rounds;
  if (r.matchOver && r.phase === 'end') {
    r.timer -= dt;
    if (r.timer <= 0) {
      r.phase = 'matchEnd';
      game.hud.showMatchEnd(r.winner, r.score);
    }
    return;
  }
  if (r.phase === 'freeze') {
    r.timer -= dt;
    if (r.timer <= 0) { r.phase = 'live'; r.timer = ROUND_S; game.hud.banner('GO', 'Plant the charge or clear the yard'); }
    return;
  }
  if (r.phase === 'live') {
    r.timer -= dt;
    // Bomb ticking.
    if (r.bomb.state === 'planted') {
      const left = BOMB_S - (game.time - r.bomb.plantedAt);
      if (Math.floor(left * 2) !== Math.floor((left + dt) * 2)) game.audio.bombBeep();
      if (left <= 0) {
        r.bomb.state = 'exploded';
        game.effects.explosion(r.bomb.pos);
        game.audio.explosion();
        endRound(game, 'ember', 'Charge detonated at site ' + r.bomb.site);
        return;
      }
    }
    // Player plant/defuse channel.
    if (r.playerChannel) {
      const ch = r.playerChannel;
      const f = game.player;
      const moved = (f.pos.x - ch.x) ** 2 + (f.pos.z - ch.z) ** 2 > 1.44;
      if (!f.alive || moved || (ch.kind === 'plant' && (r.bomb.state !== 'carried' || r.bomb.carrier !== f || !game.world.inSite(f.pos, ch.site))) || (ch.kind === 'defuse' && r.bomb.state !== 'planted')) {
        r.playerChannel = null;
      } else {
        ch.t -= dt;
        game.hud.progress(ch.kind === 'plant' ? 'Planting…' : 'Defusing…', 1 - ch.t / ch.total);
        if (ch.t <= 0) {
          r.playerChannel = null;
          game.hud.progress(null, 0);
          if (ch.kind === 'plant') onPlanted(game, f, ch.site);
          else onDefused(game, f);
        }
      }
    }
    // Win checks.
    const emberAlive = aliveCount(game, 'ember');
    const ashAlive = aliveCount(game, 'ash');
    if (emberAlive === 0) { endRound(game, 'ash', 'EMBER team eliminated'); return; }
    if (ashAlive === 0 && r.bomb.state !== 'planted') { endRound(game, 'ember', 'ASH team eliminated'); return; }
    if (r.timer <= 0) {
      if (r.bomb.state === 'planted') { /* bomb timer decides */ }
      else endRound(game, 'ash', 'Time — charge never planted');
      return;
    }
    return;
  }
  if (r.phase === 'end') {
    r.timer -= dt;
    if (r.timer <= 0) {
      if (r.matchOver) { r.phase = 'matchEnd'; game.hud.showMatchEnd(r.winner, r.score); }
      else nextRound(game);
    }
  }
}

// The player (or a bot's carrier) starts planting. Returns true if started.
export function tryPlant(game, fighter) {
  const r = game.rounds;
  if (r.phase !== 'live' || r.bomb.state !== 'carried' || r.bomb.carrier !== fighter) return false;
  for (const site of ['A', 'B']) {
    if (game.world.inSite(fighter.pos, site)) {
      if (fighter.bot) { fighter.bot.plantT = PLANT_S; fighter.bot.plantSite = site; game.radio(fighter.bot, 'planting ' + site); }
      else r.playerChannel = { kind: 'plant', site, t: PLANT_S, total: PLANT_S, x: fighter.pos.x, z: fighter.pos.z };
      game.audio.plant();
      return true;
    }
  }
  return false;
}

export function tryDefuse(game, fighter) {
  const r = game.rounds;
  if (r.phase !== 'live' || r.bomb.state !== 'planted' || !r.bomb.pos) return false;
  const dx = fighter.pos.x - r.bomb.pos.x, dz = fighter.pos.z - r.bomb.pos.z;
  if (dx * dx + dz * dz > 2.5 * 2.5) return false;
  if (fighter.bot) { fighter.bot.defuseT = DEFUSE_S; game.radio(fighter.bot, 'defusing'); }
  else r.playerChannel = { kind: 'defuse', t: DEFUSE_S, total: DEFUSE_S, x: fighter.pos.x, z: fighter.pos.z };
  game.audio.plant();
  return true;
}

// Called when a bot finishes its plant channel (bots.js).
export function onPlanted(game, fighter, site) {
  const r = game.rounds;
  if (r.bomb.state !== 'carried') return;
  r.bomb.state = 'planted'; r.bomb.site = site; r.bomb.plantedAt = game.time;
  r.bomb.pos = { x: fighter.pos.x, y: 0.3, z: fighter.pos.z };
  game.hud.banner('CHARGE PLANTED — SITE ' + site, 'ASH must defuse it');
  game.audio.bombBeep();
  game.radio(null, 'Charge planted at site ' + site);
  // Defenders rotate to the planted site; attackers hold it.
  for (const f of game.fighters) {
    if (!f.alive || !f.bot) continue;
    if (f.team === 'ash') {
      f.bot.route = [...game.world.routes[site === 'A' ? 'rotateA' : 'rotateB']];
      f.bot.routeIdx = 0; f.bot.hold = null;
    } else {
      f.bot.hold = { x: r.bomb.pos.x, z: r.bomb.pos.z, yaw: f.yaw };
      f.bot.route = [];
    }
  }
}

export function onDefused(game, fighter) {
  const r = game.rounds;
  if (r.bomb.state !== 'planted') return;
  r.bomb.state = 'defused';
  endRound(game, 'ash', 'Charge defused by ' + (fighter.name || 'ASH'));
}

// Kill economy + feed.
export function onKill(game, killer, victim) {
  if (killer && killer !== victim) {
    killer.money = (killer.money ?? 800) + 300;
    if (killer === game.player) game.audio.kill();
  }
  game.hud.killfeed(killer ? killer.name : '—', victim.name, killer && killer.load ? (WEAPONS[killer.load.current] || {}).name : '—');
}
