// Procedural textures drawn once on canvases — cobblestone, plaster, timber,
// awning stripes, crate labels, hazard stripes, smoke puff, name tags.
// No image assets are shipped; the palette is terracotta, sunlit plaster, timber, teal.
import * as THREE from 'three';
import { mulberry32 } from './util.js';

function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function speckle(ctx, w, h, rnd, n, colors, aMax = 0.16) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(rnd() * colors.length) | 0];
    ctx.globalAlpha = 0.04 + rnd() * aMax;
    const s = 1 + rnd() * 3;
    ctx.fillRect(rnd() * w, rnd() * h, s, s);
  }
  ctx.globalAlpha = 1;
}
export function cobbleTex() {
  const rnd = mulberry32(101);
  return canvasTex(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#8a6f5c'; ctx.fillRect(0, 0, w, h);
    const rows = 8, cols = 8;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const off = (r % 2) * 32;
      const x = c * 64 + off - 32, y = r * 64;
      const v = 118 + rnd() * 46;
      ctx.fillStyle = `rgb(${v | 0},${(v * 0.82) | 0},${(v * 0.66) | 0})`;
      ctx.beginPath();
      ctx.roundRect(x + 3, y + 3, 58, 58, 10);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,235,200,0.10)';
      ctx.beginPath(); ctx.roundRect(x + 6, y + 6, 52, 14, 7); ctx.fill();
    }
    speckle(ctx, w, h, rnd, 900, ['#5d4636', '#c9a888', '#3f2f24']);
  }, 10, 7);
}
export function plasterTex(base, tint) {
  const rnd = mulberry32(202);
  return canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = tint; ctx.globalAlpha = 0.25;
    for (let i = 0; i < 26; i++) {
      ctx.beginPath();
      ctx.ellipse(rnd() * w, rnd() * h, 20 + rnd() * 60, 10 + rnd() * 30, rnd() * 3, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    speckle(ctx, w, h, rnd, 500, ['#00000022', '#ffffff33']);
    // sun-bleach streak near the top
    const g = ctx.createLinearGradient(0, 0, 0, 90);
    g.addColorStop(0, 'rgba(255,240,200,0.20)'); g.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, 90);
  }, 2, 1);
}
export function woodTex() {
  const rnd = mulberry32(303);
  return canvasTex(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#7a5232'; ctx.fillRect(0, 0, w, h);
    for (let p = 0; p < 6; p++) {
      const y = p * 43, v = 104 + rnd() * 40;
      ctx.fillStyle = `rgb(${v | 0},${(v * 0.66) | 0},${(v * 0.42) | 0})`;
      ctx.fillRect(0, y + 2, w, 39);
      ctx.strokeStyle = 'rgba(40,22,10,0.55)'; ctx.lineWidth = 2;
      ctx.strokeRect(-2, y + 1, w + 4, 41);
      ctx.strokeStyle = 'rgba(60,35,16,0.35)'; ctx.lineWidth = 1;
      for (let k = 0; k < 5; k++) {
        ctx.beginPath();
        const yy = y + 6 + rnd() * 30;
        ctx.moveTo(0, yy); ctx.bezierCurveTo(w * 0.3, yy + 4, w * 0.6, yy - 4, w, yy + 2);
        ctx.stroke();
      }
      for (const nx of [40, 470]) {
        ctx.fillStyle = '#2e1c0e';
        ctx.beginPath(); ctx.arc(nx, y + 21, 3, 0, 7); ctx.fill();
      }
    }
    speckle(ctx, w, h, rnd, 300, ['#3a2412', '#c99a68']);
  }, 6, 2);
}
export function awningTex(teal) {
  return canvasTex(256, 128, (ctx, w, h) => {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? (teal ? '#1f7a6e' : '#c65a2e') : '#f2e8d5';
      ctx.fillRect(i * 32, 0, 32, h);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, h - 10, w, 10);
  }, 1, 1);
}
export function signTex(text, sub) {
  return canvasTex(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#20242a'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#f2b544'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = '#f4efe4'; ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, sub ? h / 2 - 16 : h / 2);
    if (sub) {
      ctx.fillStyle = '#f2b544'; ctx.font = 'bold 30px system-ui, sans-serif';
      ctx.fillText(sub, w / 2, h / 2 + 30);
    }
  });
}
export function crateTex(label) {
  const rnd = mulberry32(404 + label.length);
  return canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#8a6a42'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(50,30,12,0.8)'; ctx.lineWidth = 5;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.beginPath(); ctx.moveTo(8, 8); ctx.lineTo(w - 8, h - 8); ctx.moveTo(w - 8, 8); ctx.lineTo(8, h - 8); ctx.stroke();
    ctx.fillStyle = '#1d1712'; ctx.font = 'bold 34px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.fillText(label, w / 2, h / 2 - 6);
    ctx.font = 'bold 19px ui-monospace, monospace'; ctx.fillStyle = '#e8dcc2';
    ctx.fillText('QUAY 7 · KEEP DRY', w / 2, h / 2 + 30);
    speckle(ctx, w, h, rnd, 200, ['#5d4126', '#c9a06a']);
  });
}
export function hazardTex() {
  return canvasTex(256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#e8c832'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1c1a16';
    for (let x = -64; x < w + 64; x += 64) {
      ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + 32, 0); ctx.lineTo(x + 64, 0); ctx.lineTo(x + 32, h); ctx.fill();
    }
  }, 3, 1);
}
export function smokeTex() {
  return canvasTex(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(225,228,232,0.85)');
    g.addColorStop(0.55, 'rgba(205,210,215,0.5)');
    g.addColorStop(1, 'rgba(205,210,215,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
}
export function flashTex() {
  return canvasTex(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,240,170,1)');
    g.addColorStop(0.35, 'rgba(255,180,60,0.85)');
    g.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,230,150,0.9)'; ctx.lineWidth = 5;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(64, 64);
      ctx.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60); ctx.stroke();
    }
  });
}
export function nameTex(text, team) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(text, 128, 32);
  ctx.fillStyle = team === 'smug' ? '#5fe0cd' : '#ff9a5c';
  ctx.fillText(text, 128, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
