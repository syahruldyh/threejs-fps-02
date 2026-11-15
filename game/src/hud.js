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
      $('round-label').textContent = 'ROUND ' + round + ' OF 12';
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
    hitmarker(kill) {
      const h = $('hitmarker');
      h.className = kill ? 'kill' : '';
      h.style.opacity = '1';
      setTimeout(() => { h.style.opacity = '0'; }, 180);
    },
    damageFlash() {
      const d = $('dmg');
      d.style.opacity = '0.55';
      setTimeout(() => { d.style.opacity = '0'; }, 220);
    },
    killfeed(a, b, weapon) {
      const el = doc.createElement('div');
      el.className = 'kf';
      el.innerHTML = `<b>${a}</b> <span>▸ ${weapon} ▸</span> <b>${b}</b>`;
      $('killfeed').prepend(el);
      feed.push(el);
      setTimeout(() => { el.remove(); const i = feed.indexOf(el); if (i >= 0) feed.splice(i, 1); }, 5000);
      while (feed.length > 4) feed.shift().remove();
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
      const items = [
        ['1', 'Shiv SMG', WEAPONS.shiv.price, !!load.owned.shiv],
        ['2', 'Lancer AR', WEAPONS.lancer.price, !!load.owned.lancer],
        ['3', 'Napier DMR', WEAPONS.napier.price, !!load.owned.napier],
        ['4', 'Armour + Helm', 650, load.armourBought],
        ['5', 'Charge HE grenade', GRENADES.charge.price, load.grenades.charge > 0],
        ['6', 'Smoke grenade', GRENADES.smoke.price, load.grenades.smoke > 0],
      ];
      $('buy-items').innerHTML = items.map(([k, name, price, owned]) =>
        `<div class="buy-item ${owned ? 'owned' : ''} ${funds < price && !owned ? 'poor' : ''}" data-key="${k}">
          <span class="k">${k}</span><span class="n">${name}</span><span class="p">${owned ? 'OWNED' : '$' + price}</span>
        </div>`).join('');
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
