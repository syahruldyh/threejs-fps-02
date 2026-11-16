// HUD: minimap with named areas, score pills, kill feed, radio, roster,
// compass, vitals, ammo, buy menu, banners. All DOM; the 3D scene never
// draws text. Minimap redraws at 10 Hz from the sim's fighter list.
import { BUY, WEAPONS, areaAt } from './data.js';
import { fmtTime } from './util.js';

const $ = (id) => document.getElementById(id);
const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export class Hud {
  constructor(map) {
    this.map = map; // {colliders, sites}
    this.mm = $('minimap').getContext('2d');
    this.killfeed = [];
    this.radioLines = [];
    this.buyOpen = false;
    this._buildBuy();
    this._toastT = null;
  }
  _buildBuy() {
    const grid = $('buy-grid');
    grid.innerHTML = '';
    for (const [key, id, label, price, desc] of BUY) {
      const row = document.createElement('div');
      row.className = 'it'; row.dataset.id = id; row.dataset.key = key;
      row.innerHTML = `<span class="k">${key}</span><span class="nm">${label}<small>${desc}</small></span><span class="pr"></span>`;
      row.addEventListener('click', () => this.onBuy && this.onBuy(id));
      grid.appendChild(row);
    }
  }
  renderBuy(st) {
    for (const row of document.querySelectorAll('#buy-grid .it')) {
      const id = row.dataset.id;
      const def = BUY.find((b) => b[1] === id);
      const pr = row.querySelector('.pr');
      const owned = st.owned.has(id) || (id === 'corsa' && st.owned.has('corsa'));
      const isGun = def[5] === 'gun';
      if (id === 'dousekit' && st.playerTeam !== 'ward') {
        pr.textContent = 'Wardens only'; pr.className = 'pr no';
      } else if (id === 'jerkin' && st.armour > 0 && !st.cap) {
        pr.textContent = 'owned'; pr.className = 'pr own';
      } else if (id === 'jerkincap' && st.cap) {
        pr.textContent = 'owned'; pr.className = 'pr own';
      } else if (owned) {
        pr.textContent = 'owned'; pr.className = 'pr own';
      } else if (st.money < def[3]) {
        pr.textContent = '$' + def[3]; pr.className = 'pr no';
      } else {
        pr.textContent = '$' + def[3]; pr.className = 'pr';
      }
      row.classList.toggle('sel', st.weapon === id || (isGun && st.weapon === id));
    }
    $('buy-cash').textContent = '$' + st.money;
  }
  setBuy(open, st) {
    this.buyOpen = open;
    $('buy').hidden = !open;
    if (open) this.renderBuy(st);
  }
  // Full HUD refresh from the game state (called every frame; cheap text sets guarded by change).
  update(st, player, fighters) {
    $('timer').textContent = fmtTime(st.timer);
    $('phase').textContent = st.phaseLabel;
    $('round-label').textContent = 'ROUND ' + st.round + ' / 12';
    $('score-a').textContent = st.scoreA;
    $('score-b').textContent = st.scoreB;
    $('team-a-name').textContent = st.playerTeam === 'smug' ? 'SMUGGLERS' : 'WARDENS';
    $('team-b-name').textContent = st.playerTeam === 'smug' ? 'WARDENS' : 'SMUGGLERS';
    const bars = (n) => '█'.repeat(n) + '░'.repeat(Math.max(0, 7 - n));
    $('bars-a').textContent = bars(st.scoreA);
    $('bars-b').textContent = bars(st.scoreB);
    $('hp').textContent = Math.max(0, Math.round(player.hp));
    $('arm').innerHTML = player.armour > 0 ? Math.round(player.armour) + (player.cap ? ' <small>+cap</small>' : '') : '0';
    $('cash').textContent = st.money;
    const w = WEAPONS[player.weapon];
    $('wname').textContent = w.name.toUpperCase();
    $('mag').textContent = player.mag === Infinity ? '—' : player.mag;
    $('res').textContent = player.reserve === Infinity ? '—' : player.reserve;
    $('slots').innerHTML = this._slotsHtml(player, st);
    $('area-label').textContent = areaAt(player.pos.x, player.pos.z);
    this._compass(player.yaw);
    this._roster(fighters, st);
  }
  _slotsHtml(p, st) {
    const slot = (n, label, cur) => cur ? `<b>${n} ${label}</b>` : `${n} ${label}`;
    const nades = ['cracker', 'glare', 'seafog'].filter((n) => st.owned.has(n)).length;
    return [
      slot(1, WEAPONS[p.weapon].name, true),
      slot(2, 'Sparrow .32', p.weapon === 'sparrow'),
      slot(3, 'Blade', p.weapon === 'blade'),
      slot(4, 'Nades ' + nades, p.weapon === 'nade'),
    ].join(' &nbsp; ');
  }
  _compass(yaw) {
    // yaw 0 = facing +z (south); heading degrees clockwise from north (-z).
    let deg = ((-yaw * 180) / Math.PI) % 360;
    if (deg < 0) deg += 360;
    const idx = Math.round(deg / 45) % 8;
    const at = (d) => {
      d = ((Math.round(d) % 360) + 360) % 360;
      return d % 45 === 0 ? CARDINALS[Math.round(d / 45) % 8] : String(d).padStart(3, '0');
    };
    const c = Math.round(deg / 15) * 15;
    $('compass').innerHTML = `${at(c - 30)} &nbsp;·&nbsp; ${at(c - 15)} &nbsp;·&nbsp; <b>${CARDINALS[idx]} ${String(Math.round(deg)).padStart(3, '0')}°</b> &nbsp;·&nbsp; ${at(c + 15)} &nbsp;·&nbsp; ${at(c + 30)}`;
  }
  _roster(fighters, st) {
    const team = st.playerTeam;
    const rows = fighters.filter((f) => f.team === team);
    $('roster-hd').textContent = team === 'smug' ? 'SMUGGLERS — CREW' : 'WARDENS — CREW';
    $('roster-rows').innerHTML = rows.map((f) => {
      const hp = f.alive ? Math.round(f.hp) : 0;
      return `<div class="row${f.alive ? '' : ' dead'}"><span>${f.name}${f.isPlayer ? ' (you)' : ''}</span><span class="hp${hp <= 35 ? ' low' : ''}">${f.alive ? hp : '✕'}</span></div>`;
    }).join('');
  }
  drawMinimap(player, fighters, st) {
    const ctx = this.mm, W = 368, H = 368;
    const sx = (x) => ((x + 32) / 64) * W;
    const sz = (z) => ((z + 22) / 44) * H;
    ctx.fillStyle = '#232a33'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#39424e';
    for (const c of this.map.colliders) ctx.fillRect(sx(c.x0), sz(c.z0), sx(c.x1) - sx(c.x0), sz(c.z1) - sz(c.z0));
    ctx.strokeStyle = 'rgba(244,239,228,0.25)'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
    // Site markers.
    ctx.font = 'bold 26px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [k, s] of Object.entries(this.map.sites)) {
      ctx.fillStyle = '#f2b544';
      ctx.fillRect(sx(s.x) - 13, sz(s.z) - 13, 26, 26);
      ctx.fillStyle = '#1c1a16';
      ctx.fillText(k, sx(s.x), sz(s.z) + 1);
    }
    // Fighter dots: teal allies, rust enemies, white player arrow.
    for (const f of fighters) {
      if (!f.alive) continue;
      ctx.fillStyle = f.team === st.playerTeam ? '#37b8a6' : '#d4692f';
      ctx.beginPath(); ctx.arc(sx(f.pos.x), sz(f.pos.z), f.isPlayer ? 7 : 5, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    if (player.alive) {
      ctx.save();
      ctx.translate(sx(player.pos.x), sz(player.pos.z));
      ctx.rotate(-player.yaw);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  kill(killer, weapon, victim, head) {
    this.killfeed.unshift({ killer, weapon, victim, head, t: Date.now() });
    this.killfeed = this.killfeed.slice(0, 5);
    $('killfeed').innerHTML = this.killfeed.map((k) =>
      `<div><span class="w">${k.killer}</span> <span class="w">${k.weapon}</span>${k.head ? ' <span class="h">· head</span>' : ''} <span>${k.victim}</span></div>`).join('');
  }
  clearFeed() { this.killfeed = []; $('killfeed').innerHTML = ''; }
  say(name, text) {
    this.radioLines.unshift({ name, text });
    this.radioLines = this.radioLines.slice(0, 3);
    $('radio').innerHTML = this.radioLines.map((l) => `<div><b>${l.name}:</b> ${l.text}</div>`).join('');
  }
  clearRadio() { this.radioLines = []; $('radio').innerHTML = ''; }
  banner(h, p = '') {
    $('banner-h').textContent = h;
    $('banner-p').textContent = p;
    $('banner').classList.add('show');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => $('banner').classList.remove('show'), 3200);
  }
  toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.style.opacity = 1;
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { el.style.opacity = 0; }, 2200);
  }
  hitmarker(head) {
    const el = $('hitm');
    el.classList.add('on');
    el.classList.toggle('hs', !!head);
    clearTimeout(this._hmT);
    this._hmT = setTimeout(() => el.classList.remove('on'), 110);
  }
  damageFlash() {
    const el = $('dmg');
    el.style.opacity = 0.9;
    setTimeout(() => { el.style.opacity = 0; }, 160);
  }
  flashWhite(strength = 1) {
    const el = $('flash');
    el.style.opacity = strength;
    setTimeout(() => { el.style.opacity = 0; }, 350);
  }
  interact(show, text, frac = 0) {
    const el = $('interact');
    el.hidden = !show;
    if (show) {
      $('interact-t').textContent = text;
      $('interact-bar').style.width = Math.round(frac * 100) + '%';
    }
  }
}
