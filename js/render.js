// ============================================================
// render.js — Canvas 初始化、座標轉換、全場景繪製
// ============================================================

import { State, player, cam, CHAR_IMAGES, KNOCKER_IMAGES } from './state.js';
import { keyOf, axialToPixel, dist } from './hex.js';

// ── Canvas 元素（由 initCanvas 填入）────────────────────
export let canvas = null;
export let ctx    = null;

export function initCanvas() {
  canvas = document.getElementById('game');
  ctx    = canvas.getContext('2d');
}

// ── 座標轉換 ─────────────────────────────────────────────
// 每次即時讀取 getBoundingClientRect，得到 canvas 實際 CSS 尺寸的中心
// 豎屏時 canvas 只佔上方區域（下方為面板），此處自然已扣除面板高度，無需額外計算
function logicalCenter() {
  const rect = canvas.getBoundingClientRect();
  return { cx: rect.width / 2, cy: rect.height / 2 };
}

export function worldToScreen(wx, wy) {
  const { cx, cy } = logicalCenter();
  return {
    x: (wx + cam.x) * cam.zoom + cx,
    y: (wy + cam.y) * cam.zoom + cy,
  };
}

export function screenToWorld(sx, sy) {
  const { cx, cy } = logicalCenter();
  return {
    x: (sx - cx) / cam.zoom - cam.x,
    y: (sy - cy) / cam.zoom - cam.y,
  };
}

// ── Resize ───────────────────────────────────────────────
export function resize() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvas.width  = Math.floor(rect.width  * devicePixelRatio);
  canvas.height = Math.floor(rect.height * devicePixelRatio);
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}

// ── 六角形工具 ───────────────────────────────────────────
export function hexCorners(cx, cy) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const ang = (Math.PI / 180) * (60 * i - 30);
    pts.push({ x: cx + State.HEX * Math.cos(ang), y: cy + State.HEX * Math.sin(ang) });
  }
  return pts;
}

export function drawHex(cx, cy, fill, stroke, lineW = 1) {
  const pts = hexCorners(cx, cy);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < 6; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineW;
  ctx.stroke();
}

function roundRect(x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export function drawText(txt, x, y, size = 12, color = "#e6e6e6", bold = false) {
  ctx.font = `${bold ? "700 " : ""}${size}px system-ui, -apple-system, "Noto Sans TC", sans-serif`;
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";

  if (State.textReadMode === 'cool') {
    const tw   = ctx.measureText(txt).width;
    const padX = size * 0.6, padY = size * 0.5;
    const w = tw + padX * 2, h = size + padY * 2;
    ctx.save();
    ctx.fillStyle   = 'rgba(100,150,220,0.16)';
    roundRect(x - w / 2, y - h / 2, w, h, Math.max(6, size * 0.4));
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth   = 1;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#071226';
    ctx.fillText(txt, x, y);
  } else {
    ctx.fillStyle   = color;
    ctx.lineWidth   = Math.max(1, size * 0.12);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(txt, x, y);
    ctx.fillText(txt, x, y);
  }
}

// ── 背景繪製 ─────────────────────────────────────────────
export function drawBackground() {
  const { boardBgMode, boardBgImage } = State;

  if (boardBgMode === 'none') return;

  if (boardBgMode === 'grid') {
    const gap = State.HEX;
    ctx.save();
    ctx.globalAlpha  = 0.12;
    ctx.strokeStyle  = '#ffffff';
    ctx.lineWidth    = 1;
    for (let x = 0; x < canvas.width; x += gap) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gap) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (boardBgMode === 'wood') {
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#191107');
    g.addColorStop(1, '#2b1706');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.globalAlpha  = 0.12;
    ctx.strokeStyle  = 'rgba(0,0,0,0.12)';
    ctx.lineWidth    = 1.2;
    const lines = Math.floor(canvas.height / 18);
    for (let i = 0; i < lines; i++) {
      const y = (i + 0.5) * (canvas.height / lines) + Math.sin(i * 0.7) * 6;
      ctx.beginPath();
      ctx.moveTo(0, y + Math.sin(i) * 4);
      ctx.bezierCurveTo(canvas.width * 0.3, y - 8, canvas.width * 0.6, y + 8, canvas.width, y + Math.cos(i) * 3);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.06;
    for (let s = 0; s < 12; s++) {
      const y = Math.random() * canvas.height;
      ctx.beginPath(); ctx.moveTo(-40, y); ctx.lineTo(canvas.width + 40, y + Math.random() * 30 - 15); ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (boardBgMode === 'stone') {
    ctx.fillStyle = '#0d1013';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    for (let i = 0; i < 80; i++) {
      const rw = canvas.width  * (0.06 + Math.random() * 0.18);
      const rh = canvas.height * (0.04 + Math.random() * 0.12);
      const x  = Math.random() * canvas.width;
      const y  = Math.random() * canvas.height;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rw, rh));
      gr.addColorStop(0, `rgba(${60+((Math.random()*30)|0)},${60+((Math.random()*30)|0)},${70+((Math.random()*30)|0)},${(0.08+Math.random()*0.08).toFixed(2)})`);
      gr.addColorStop(1, `rgba(${20+((Math.random()*20)|0)},${20+((Math.random()*20)|0)},${30+((Math.random()*20)|0)},0)`);
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.ellipse(x, y, rw, rh, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    const vg = ctx.createRadialGradient(
      canvas.width/2, canvas.height/2, Math.min(canvas.width, canvas.height)*0.2,
      canvas.width/2, canvas.height/2, Math.max(canvas.width, canvas.height)/1.2,
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    return;
  }

  if (boardBgMode === 'image' && boardBgImage) {
    const img = boardBgImage;
    const cw = canvas.width, ch = canvas.height;
    const coverScale = Math.max(cw / img.width, ch / img.height);
    const isMobile   = window.innerWidth <= 700;
    if (State.bgImageBaseScale == null && !isMobile) State.bgImageBaseScale = coverScale;
    const scale = (isMobile && State.bgImageBaseScale != null)
      ? Math.max(State.bgImageBaseScale, coverScale) : coverScale;
    const dw = img.width * scale, dh = img.height * scale;

    if (State.boardBgFollowCam) {
      const ox = cam.x * cam.zoom * State.boardBgParallax;
      const oy = cam.y * cam.zoom * State.boardBgParallax;
      ctx.save(); ctx.globalAlpha = 0.92;
      ctx.drawImage(img, (cw - dw) / 2 + ox, (ch - dh) / 2 + oy, dw, dh);
      ctx.restore();
    } else {
      ctx.save(); ctx.globalAlpha = 0.92;
      ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
      ctx.restore();
    }
  }
}

// ── 主渲染 ───────────────────────────────────────────────
export function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0b0e14";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawBackground();

  // ── Tiles ──────────────────────────────────────────────
  for (const [k, t] of State.tiles.entries()) {
    const [q, r] = k.split(',').map(Number);
    const wp = axialToPixel(q, r);
    const sp = worldToScreen(wp.x, wp.y);

    const fill   = t.sign === 1 ? "rgba(60,140,90,0.20)" : "rgba(170,70,70,0.18)";
    let stroke   = "rgba(80,90,110,0.95)";
    let lw       = 1.2;

    if (State.hoverKey === k) { stroke = "rgba(230,230,230,0.9)"; lw = 2; }

    if (!player.moving && !State.gameOver && dist(player.q, player.r, q, r) === 1) {
      stroke = "rgba(200,200,200,0.35)";
    }

    // 衝刺待選模式 → 高亮直線 2 格目標
    if (player.rushPending && !player.moving) {
      const RUSH_DIRS = [[2,0],[-2,0],[0,2],[0,-2],[2,-2],[-2,2]];
      const dq2 = q - player.q, dr2 = r - player.r;
      if (RUSH_DIRS.some(([a, b]) => dq2 === a && dr2 === b)) {
        stroke = "rgba(100,220,255,0.95)";
        lw = 2.5;
      }
    }
    // 快手連擊待選 → 高亮相鄰 1 格（金黃）
    if (player.pendingSkill === 'opportunist' && !player.moving) {
      if (dist(player.q, player.r, q, r) === 1) { stroke = "rgba(255,220,60,0.95)"; lw = 2.5; }
    }
    // 精算步伐待選 → 高亮 2 格範圍（青綠）
    if (player.pendingSkill === 'tactician' && !player.moving) {
      const pd = dist(player.q, player.r, q, r);
      if (pd >= 1 && pd <= 2) { stroke = "rgba(60,255,200,0.95)"; lw = 2.5; }
    }
    if (State.npcList.some(n => n.q === q && n.r === r)) {
      lw = 2; stroke = "rgba(255,120,120,0.9)";
    }

    drawHex(sp.x, sp.y, fill, stroke, lw);
    drawText(`${t.stat} ${t.sign === 1 ? "+" : "−"}`, sp.x, sp.y, 12, "rgba(230,230,230,0.85)", true);
  }

  // ── Knockers ───────────────────────────────────────────
  for (const k of State.knockers) {
    const spk = worldToScreen(k.x, k.y);
    const kImg = KNOCKER_IMAGES.get(k.persona);
    if (kImg && kImg.complete && kImg.naturalWidth) {
      const targetH = State.HEX * 2;
      const scale   = targetH / kImg.naturalHeight;
      const drawW   = kImg.naturalWidth * scale;
      const drawX   = spk.x - drawW / 2;
      const drawY   = spk.y - targetH + 8;
      ctx.beginPath();
      ctx.ellipse(spk.x, spk.y + 18, Math.max(10, drawW * 0.18), Math.max(5, targetH * 0.08), 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fill();
      ctx.drawImage(kImg, drawX, drawY, drawW, targetH);
      drawText(k.personaLabel || 'K', spk.x, drawY - 4, 11, k.personaColor || 'rgba(180,230,255,0.95)', true);
      if (k.stat) drawText(k.stat, spk.x, spk.y + 22, 10, 'rgba(200,230,255,0.9)', true);
    } else {
      ctx.beginPath();
      ctx.ellipse(spk.x, spk.y + 14, 12, 5, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fill();
      ctx.beginPath();
      ctx.arc(spk.x, spk.y, 12, 0, Math.PI * 2);
      ctx.fillStyle = k.personaColor || '#6fb3ff'; ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(20,40,60,0.9)'; ctx.stroke();
      drawText(k.personaLabel || 'K', spk.x, spk.y - 8, 12, 'rgba(10,30,60,0.95)', true);
      if (k.stat) drawText(k.stat, spk.x, spk.y + 12, 10, 'rgba(10,30,60,0.95)', true);
    }
    if (k.skillCooldown > 0) drawText(`CD${k.skillCooldown}`, spk.x + 14, spk.y - 16, 9, 'rgba(255,240,100,0.95)', true);
    if (k.skillActive)       drawText('▶', spk.x - 14, spk.y - 16, 10, 'rgba(100,255,200,0.95)', true);
  }

  // ── Combatant NPCs ─────────────────────────────────────
  for (const n of State.npcList) {
    const sp = worldToScreen(n.x, n.y);

    // 預測線圈（玩家可見的下回合提示）
    if (n.preview && !n.moving) {
      const tp  = axialToPixel(n.preview.q, n.preview.r);
      const tsp = worldToScreen(tp.x, tp.y);
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(tsp.x, tsp.y, State.HEX * 0.85, 0, Math.PI * 2);
      ctx.strokeStyle = n.preview.risky ? 'rgba(255,110,110,0.95)'
        : (n.preview.aggressive ? 'rgba(255,160,60,0.95)' : 'rgba(120,180,255,0.95)');
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }
    if (n.intent && n.intent.risky) {
      const tp2  = axialToPixel(n.intent.q, n.intent.r);
      const tsp2 = worldToScreen(tp2.x, tp2.y);
      ctx.save();
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(tsp2.x, tsp2.y, State.HEX * 0.95, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,110,110,0.95)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }

    const img = CHAR_IMAGES.get(n.name);
    if (img && img.complete && img.naturalWidth) {
      const targetH = State.HEX * 2;
      const scale   = targetH / img.naturalHeight;
      const drawW   = img.naturalWidth * scale;
      const drawX   = sp.x - drawW / 2;
      const drawY   = sp.y - targetH + 8;
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y + 18, Math.max(12, drawW * 0.18), Math.max(6, targetH * 0.08), 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fill();
      ctx.drawImage(img, drawX, drawY, drawW, targetH);
      drawText(n.name, sp.x, drawY - 12, 12, "rgba(255,200,200,0.95)", true);
      if (n.personaLabel) drawText(n.personaLabel, sp.x, drawY - 24, 10, n.personaColor || 'rgba(255,220,180,0.85)', true);
      if (n.skillActive)  drawText('▶', sp.x + (drawW/2 + 6), sp.y - State.HEX, 11, 'rgba(100,255,200,0.95)', true);
    } else {
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y + 18, 16, 6, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fill();
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 16, 0, Math.PI * 2);
      ctx.fillStyle = n.personaColor || "#ff8a8a"; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = "rgba(60,20,20,0.95)"; ctx.stroke();
      drawText(n.name, sp.x, sp.y - 30, 12, "rgba(255,200,200,0.95)", true);
      if (n.personaLabel) drawText(n.personaLabel, sp.x, sp.y - 42, 10, n.personaColor || 'rgba(255,220,180,0.85)', true);
      if (n.skillActive)  drawText('▶', sp.x + 22, sp.y - 38, 11, 'rgba(100,255,200,0.95)', true);
    }
  }

  // ── Player ────────────────────────────────────────────
  {
    const sp  = worldToScreen(player.x, player.y);
    const img = CHAR_IMAGES.get(player.name);
    if (img && img.complete && img.naturalWidth) {
      const targetH = State.HEX * 2;
      const scale   = targetH / img.naturalHeight;
      const drawW   = img.naturalWidth * scale;
      const drawX   = sp.x - drawW / 2;
      const drawY   = sp.y - targetH + 8;
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y + 18, Math.max(12, drawW * 0.18), Math.max(6, targetH * 0.08), 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fill();
      ctx.drawImage(img, drawX, drawY, drawW, targetH);
      drawText(player.name, sp.x, drawY - 12, 12, "rgba(230,230,230,0.9)", true);
    } else {
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y + 18, 16, 6, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fill();
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 16, 0, Math.PI * 2);
      ctx.fillStyle = "#f3f7ff"; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = "rgba(20,30,50,0.9)"; ctx.stroke();
      // 耳朵（左右各一）
      for (const [bx, tx, mx] of [[-10, -18, -6], [10, 18, 6]]) {
        ctx.beginPath();
        ctx.moveTo(sp.x + bx, sp.y - 12);
        ctx.lineTo(sp.x + tx, sp.y - 28);
        ctx.lineTo(sp.x + mx, sp.y - 20);
        ctx.closePath();
        ctx.fillStyle = "#1c2333"; ctx.fill();
      }
      drawText(player.name, sp.x, sp.y - 30, 12, "rgba(230,230,230,0.9)", true);
    }
  }

  // ── Game Over/Victory overlay ─────────────────────────
  if (State.gameOver) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    const cx = canvas.width / 2, cy = canvas.height / 2;
    if (State.overallWin) {
      drawText("VICTORY!", cx, cy - 10, 34, "rgba(140,255,180,0.95)", true);
      drawText("已清除所有 NPC，按右側「重開一局」重新選角。", cx, cy + 26, 14, "rgba(230,230,230,0.9)", false);
    } else {
      drawText("GAME OVER", cx, cy - 10, 34, "rgba(255,180,180,0.95)", true);
      drawText("按右側「重開一局」再來", cx, cy + 26, 14, "rgba(230,230,230,0.9)", false);
    }
  }
}
