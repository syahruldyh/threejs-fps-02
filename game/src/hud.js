// hud.js — one job: everything on screen that is not the 3D view. Health,
// armour, ammo, funds, round score and timer, a live minimap, kill feed,
// radio callouts, the buy menu, plant/defuse progress and the banners.
// All DOM, no WebGL: cheap to update and easy to read at a glance.

import { WEAPONS, GRENADES } from './weapon.js';

export function createHud(doc) {
  const $ = (id) => doc.getElementById(id);
  const minimap = $('minimap');
  const mctx = minimap.getContext('2d');
  const feed = [];
  const hud = {
    setHealth(hp, armour) {
      $('health-num').textContent = Math.max(0, Math.round(hp));
      $('health-bar').style.width = Math.max(0, hp) + '%';
      $('armour-num').textContent = Math.round(armour);
      $('armour-bar').style.width = Math.min(100, armour) + '%';
    },
    setAmmo(mag, reserve, name) {
      $('ammo-mag').textContent = mag;
      $('ammo-res').textContent = reserve;
      $('weapon-name').textContent = name;
    },
    setFunds(n) { $('funds-num').textContent = '$' + n; },
    setScore(e, a, round, phase, timer) {
      $('score-e').textContent = e;
      $('score-a').textContent = a;
      $('round-label').textContent = `ROUND ${round} OF 12 — ${phase === 'freeze' ? 'BUY PHASE' : phase === 'live' ? 'EMBER ATTACK · FIRST TO 7' : phase.toUpperCase()}`;
      $('timer').textContent = formatTime(timer);
      $('timer').className = phase === 'live' && timer < 15 ? 'low' : '';
    },
    setCrosshairGap(px) {
      const g = Math.round(px);
      $('ch-t').style.transform = `translate(-50%, calc(-100% - ${g}px))`;
      $('ch-b').style.transform = `translate(-50%, ${g}px)`;
      $('ch-l').style.transform = `translate(calc(-100% - ${g}px), -50%)`;
      $('ch-r').style.transform = `translate(${g}px, -50%)`;
    },
    hitmarker(kill, head) {
      const h = $('hitmarker');
      h.className = kill ? 'kill' : head ? 'hs' : '';
      h.style.opacity = '1';
      setTimeout(() => { h.style.opacity = '0'; }, 180);
    },
    // Floating damage number by the crosshair: the hit is confirmed
    // in numbers, not just a tick.
    damageNumber(dmg, head) {
      const d = $('dmgnum');
      d.textContent = (head ? 'HS ' : '') + Math.round(dmg);
      d.className = head ? 'hs' : '';
      d.style.opacity = '1';
      clearTimeout(hud._dt);
      hud._dt = setTimeout(() => { d.style.opacity = '0'; }, 650);
    },
    // A flashbang whites the screen out for a beat.
    flashbang() {
      const f = $('flash');
      f.style.opacity = '0.9';
      setTimeout(() => { f.style.opacity = '0'; }, 120);
      setTimeout(() => { f.style.opacity = '0.55'; }, 260);
      setTimeout(() => { f.style.opacity = '0'; }, 700);
    },
    damageFlash() {
      const d = $('dmg');
      d.style.opacity = '0.55';
      setTimeout(() => { d.style.opacity = '0'; }, 220);
    },
    killfeed(a, b, weapon, head) {
      const el = doc.createElement('div');
      el.className = 'kf';
      el.innerHTML = `<b>${a}</b> <span>▸ ${weapon}${head ? ' <i>HS</i>' : ''} ▸</span> <b>${b}</b>`;
      $('killfeed').prepend(el);
      feed.push(el);
      setTimeout(() => { el.remove(); const i = feed.indexOf(el); if (i >= 0) feed.splice(i, 1); }, 5000);
      while (feed.length > 4) feed.shift().remove();
    },
    // Team roster: the four EMBER teammates with health bars and the
    // charge carrier marked, so the match reads as a team, not a solo.
    setRoster(fighters, carrier) {
      const el = $('roster');
      const mates = fighters.filter((f) => f.team === 'ember');
      el.innerHTML = mates.map((f) => {
        const dead = !f.alive;
        return `<div class="mate ${dead ? 'dead' : ''}"><span class="mn">${f.name}${carrier === f ? ' · CHARGE' : ''}</span><span class="mb"><i style="width:${Math.max(0, f.hp)}%"></i></span></div>`;
      }).join('');
    },
    // Compass strip: N/E/S/W plus the A/B site markers, driven by yaw.
    // In this game's yaw convention forward is (-sin yaw, -cos yaw), so
    // north is yaw 0, east is -PI/2, south is PI, west is +PI/2.
    setCompass(yaw, pos, sites) {
      const el = $('compass');
      const marks = [];
      const bearing = (dx, dz) => Math.atan2(-dx, -dz);
      const put = (label, ang, cls) => {
        let d = ((ang - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        if (Math.abs(d) < 1.1) marks.push(`<span class="${cls || ''}" style="left:${50 + (d / 1.1) * 46}%">${label}</span>`);
      };
      put('N', 0); put('E', -Math.PI / 2); put('S', Math.PI); put('W', Math.PI / 2);
      for (const key of ['A', 'B']) {
        const s = sites[key];
        put(key, bearing(s.center.x - pos.x, s.center.z - pos.z), 'site');
      }
      el.innerHTML = marks.join('');
    },
    setGrenades(load) {
      const parts = [];
      for (const [k, def] of Object.entries(GRENADES)) {
        const n = load.grenades[k] || 0;
        if (n > 0) parts.push(`${def.name.split(' ')[0]} ×${n}`);
      }
      $('grenades').textContent = parts.length ? parts.join(' · ') : 'no utility';
    },
    radio(text) {
      const el = doc.createElement('div');
      el.className = 'radio';
      el.textContent = text;
      $('radio').append(el);
      setTimeout(() => el.remove(), 6000);
      while ($('radio').children.length > 3) $('radio').firstChild.remove();
    },
    banner(title, sub) {
      $('banner-title').textContent = title;
      $('banner-sub').textContent = sub || '';
      $('banner').classList.add('show');
      clearTimeout(hud._bt);
      hud._bt = setTimeout(() => $('banner').classList.remove('show'), 3200);
    },
    progress(label, frac) {
      if (!label) { $('progress').style.display = 'none'; return; }
      $('progress').style.display = 'block';
      $('progress-label').textContent = label;
      $('progress-bar').style.width = Math.round(frac * 100) + '%';
    },
    showBuy(open, funds, load) {
      $('buymenu').style.display = open ? 'block' : 'none';
      if (!open) return;
      $('buy-funds').textContent = '$' + funds;
      // 12 items: 5 rifles, armour + helmet, 5 utility — each with a
      // one-line description, the way the best buy menus read.
      const items = [
        ['1', 'Shiv SMG', WEAPONS.shiv, !!load.owned.shiv],
        ['2', 'Lancer AR', WEAPONS.lancer, !!load.owned.lancer],
        ['3', 'Boomstick-8', WEAPONS.boomstick, !!load.owned.boomstick],
        ['4', 'Napier DMR', WEAPONS.napier, !!load.owned.napier],
        ['5', 'Mule-60 LMG', WEAPONS.mule, !!load.owned.mule],
        ['6', 'Armour', { price: 650, desc: 'soaks half of every hit' }, load.armourBought],
        ['7', 'Helmet', { price: 350, desc: 'headshots hurt less' }, load.helmetBought],
        ['8', 'Charge HE', GRENADES.charge, load.grenades.charge > 0],
        ['9', 'Smoke', GRENADES.smoke, load.grenades.smoke > 0],
        ['0', 'Sunset Flash', GRENADES.flash, load.grenades.flash > 0],
        ['Q', 'Ember Jar', GRENADES.molotov, load.grenades.molotov > 0],
        ['E', 'Decoy Whistle', GRENADES.decoy, load.grenades.decoy > 0],
      ];
      $('buy-items').innerHTML = items.map(([k, name, def, owned]) => {
        const isGrenade = def === GRENADES.charge || def === GRENADES.smoke || def === GRENADES.flash || def === GRENADES.molotov || def === GRENADES.decoy;
        const gkey = { 'Charge HE': 'charge', 'Smoke': 'smoke', 'Sunset Flash': 'flash', 'Ember Jar': 'molotov', 'Decoy Whistle': 'decoy' }[name];
        const price = isGrenade
          ? '$' + def.price + (gkey && load.grenades[gkey] > 0 ? ` · ×${load.grenades[gkey]}` : '')
          : owned ? 'OWNED' : '$' + def.price;
        return `<div class="buy-item ${owned && !isGrenade ? 'owned' : ''} ${funds < def.price && !owned ? 'poor' : ''}" data-key="${k}">
          <span class="k">${k}</span><span class="n">${name}<em>${def.desc}</em></span><span class="p">${price}</span>
        </div>`;
      }).join('');
    },
    showMatchEnd(winner, score) {
      $('matchend').style.display = 'flex';
      $('me-title').textContent = winner === 'draw' ? 'DRAW' : winner === 'ember' ? 'EMBER WINS' : 'ASH WINS';
      $('me-score').textContent = `EMBER ${score.ember} — ${score.ash} ASH`;
    },
    showHint(text) { $('hint').textContent = text || ''; },
    setSpectate(name) {
      $('spectate').style.display = name ? 'block' : 'none';
      if (name) $('spectate').textContent = 'Spectating ' + name + ' — click to switch';
    },
    drawMinimap(world, fighters, player, seenEnemies) {
      const W = minimap.width, H = minimap.height;
      const sx = (x) => ((x + 32) / 64) * W;
      const sz = (z) => ((z + 24) / 48) * H;
      mctx.fillStyle = 'rgba(10,10,16,0.72)'; mctx.fillRect(0, 0, W, H);
      mctx.fillStyle = '#5a5148';
      for (const b of world.colliders) {
        if (b.max.y - b.min.y < 1) continue;
        mctx.fillRect(sx(b.min.x), sz(b.min.z), sx(b.max.x) - sx(b.min.x), sz(b.max.z) - sz(b.min.z));
      }
      // Sites.
      mctx.font = 'bold 13px sans-serif'; mctx.textAlign = 'center';
      for (const key of ['A', 'B']) {
        const s = world.sites[key];
        mctx.fillStyle = '#e8b400';
        mctx.beginPath(); mctx.arc(sx(s.center.x), sz(s.center.z), 9, 0, 7); mctx.fill();
        mctx.fillStyle = '#111'; mctx.fillText(key, sx(s.center.x), sz(s.center.z) + 4);
      }
      // Named callouts: the lanes read as places, not blank space.
      mctx.font = 'bold 8px sans-serif'; mctx.fillStyle = 'rgba(242,237,228,0.75)';
      mctx.fillText('A LONG', sx(-24), sz(10));
      mctx.fillText('PUMP LINK', sx(0), sz(10));
      mctx.fillText('B TUNNEL', sx(24), sz(10));
      mctx.fillText('FURNACE', sx(-20), sz(-16.5));
      mctx.fillText('SLAG YD', sx(20), sz(-16.5));
      // Fighters.
      for (const f of fighters) {
        if (!f.alive) continue;
        const isPlayer = f === player;
        const isEnemy = f.team !== player.team;
        if (isEnemy && !seenEnemies.has(f) && !isPlayer) continue;
        const x = sx(f.pos.x), y = sz(f.pos.z);
        mctx.fillStyle = isPlayer ? '#ffffff' : f.team === 'ember' ? '#ff8a3c' : '#59b7ff';
        mctx.beginPath(); mctx.arc(x, y, isPlayer ? 4.5 : 3.5, 0, 7); mctx.fill();
        if (isPlayer) {
          mctx.strokeStyle = '#fff'; mctx.beginPath();
          mctx.moveTo(x, y);
          mctx.lineTo(x - Math.sin(f.yaw) * 9, y - Math.cos(f.yaw) * 9);
          mctx.stroke();
        }
      }
    },
  };
  return hud;
}

function formatTime(s) {
  const t = Math.max(0, Math.ceil(s));
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
}
