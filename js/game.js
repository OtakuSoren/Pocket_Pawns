// ============================================================
// game.js — 遊戲主流程：回合控制器、事件監聽、主循環（入口）
// ============================================================

import { CHARS, PROJECT_IMAGES, KNOCKER_PERSONA_STYLES } from './config.js';
import { loadRoles } from './roleLoader.js';
import { State, player, cam, getCharButtons } from './state.js';
import { keyOf, axialToPixel, pixelToAxial, dist, inBoard } from './hex.js';
import { regenTiles, loadCharImages, loadKnockerImages } from './board.js';
import {
  initHUD, HUD, updateHUD,
  buildCharButtons, fmtStats,
  setNpcRiskChance, applyDifficulty,
  saveSettings, loadSettings, resetDefaults,
  initMenus, showStartMenu, hideMenus,
} from './ui.js';
import { initBgm, tryPlayBgm, stopBgm } from './bgm.js';
import { checkEncounters } from './combat.js';
import {
  placeNpcList, placeKnockers,
  chooseAllNpcIntents, chooseAllNpcPreviewIntents,
  startEnvironmentPhase, finishEnvironmentPhase,
} from './ai.js';
import {
  canvas, ctx,
  initCanvas, resize,
  worldToScreen, screenToWorld,
  draw,
} from './render.js';

// ── Tooltip DOM（懸停角色顯示屬性）─────────────────────
let charTooltip = null;

// ── 技能選單 ──────────────────────────────────────────
let skillMenuEl = null;
let _skillMenuClickX = 0, _skillMenuClickY = 0;

// 技能定義陣列（往後新增技能只需在此加一項）
const SKILLS = [
  {
    id: 'wait',
    icon: '⏸',
    label: '待機',
    desc: '消耗一回合，原地不動',
    cooldownProp: 'waitCooldown',
    cooldown: 3,
    use(q, r) {
      player.intent = { q, r, wait: true };
      player.waitCooldown = 3;
      player._waitSkip = true;
      HUD.logTxt.textContent = '玩家 使用待機技能（本回合不移動）';
      beginTurn();
    },
  },
  {
    id: 'rush',
    icon: '⚡',
    label: '衝刺',
    desc: '直線衝刺兩格，AGL 越高冷卻越短',
    cooldownProp: 'rushCooldown',
    use(q, r) {
      player.rushPending = true;
      HUD.logTxt.textContent = '⚡ 衝刺：請點選直線方向的目標格（2 格距離）';
      closeSkillMenu();
    },
  },
  {
    id: 'aggressive', icon: '🗡', label: '突破衝撞',
    desc: 'STR 越高冷卻越短，自動朝最近敵人衝 2 格（受阻退 1 格）',
    cooldownProp: 'aggressiveCooldown',
    use(q, r) {
      let nearest = null, nearestD = Infinity;
      for (const n of State.npcList) {
        const d = dist(q, r, n.q, n.r);
        if (d < nearestD) { nearestD = d; nearest = n; }
      }
      if (!nearest) { HUD.logTxt.textContent = '🗡 場上無可衝撞的敵人'; return; }
      const DIRS = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
      let bestDir = DIRS[0], bestScore = -Infinity;
      for (const [dq, dr] of DIRS) {
        const s = -dist(q + dq, r + dr, nearest.q, nearest.r);
        if (s > bestScore) { bestScore = s; bestDir = [dq, dr]; }
      }
      const [bdq, bdr] = bestDir;
      let tq = q + bdq * 2, tr = r + bdr * 2;
      if (!inBoard(tq, tr)) { tq = q + bdq; tr = r + bdr; }
      if (!inBoard(tq, tr)) { HUD.logTxt.textContent = '🗡 突破衝撞：無法移動'; return; }
      const cdVal = Math.max(1, 5 - Math.floor(player.stats.STR / 4));
      player.aggressiveCooldown = cdVal;
      player._aggressiveSkip = true;
      player.intent = { q: tq, r: tr };
      HUD.logTxt.textContent = `🗡 突破衝撞 至 (${tq},${tr})，冷卻 ${cdVal} 回合`;
      beginTurn();
    },
  },
  {
    id: 'defensive', icon: '🛡', label: '鐵甲反彈',
    desc: 'VIT 越高冷卻越短，原地待機，下次被彈飛時方向反轉',
    cooldownProp: 'defensiveCooldown',
    use(q, r) {
      player.counterKnockback = true;
      player.intent = { q, r, wait: true };
      const cdVal = Math.max(2, 6 - Math.floor(player.stats.VIT / 4));
      player.defensiveCooldown = cdVal;
      player._defensiveSkip = true;
      HUD.logTxt.textContent = `🛡 鐵甲反彈：護盾就位！下次彈飛將反向，冷卻 ${cdVal} 回合`;
      beginTurn();
    },
  },
  {
    id: 'opportunist', icon: '🎯', label: '快手連擊',
    desc: 'DEX 越高冷卻越短，移動 1 格，其他所有技能冷卻各減 1',
    cooldownProp: 'opportunistCooldown',
    use(q, r) {
      player.pendingSkill = 'opportunist';
      HUD.logTxt.textContent = '🎯 快手連擊：請點選相鄰 1 格';
      closeSkillMenu();
    },
  },
  {
    id: 'random', icon: '🎲', label: '亂入傳送',
    desc: '隨機傳送到棋盤上任意空格，固定冷卻 4 回合',
    cooldownProp: 'randomCooldown',
    use(q, r) {
      const occupied = new Set([keyOf(q, r)]);
      for (const n of State.npcList) occupied.add(keyOf(n.q, n.r));
      const available = Array.from(State.tiles.keys()).filter(k => !occupied.has(k));
      if (available.length === 0) { HUD.logTxt.textContent = '🎲 無可傳送的空格'; return; }
      const [tq, tr] = available[(Math.random() * available.length) | 0].split(',').map(Number);
      player.randomCooldown = 4;
      player._randomSkip = true;
      player.intent = { q: tq, r: tr };
      HUD.logTxt.textContent = `🎲 亂入傳送 至 (${tq},${tr})，冷卻 4 回合`;
      beginTurn();
    },
  },
  {
    id: 'gambler', icon: '🎰', label: '豪賭一擊',
    desc: 'LUK 越高冷卻越短，優先移向相鄰負屬性格，否則隨機相鄰格',
    cooldownProp: 'gamblerCooldown',
    use(q, r) {
      const DIRS = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
      let target = null;
      for (const [dq, dr] of DIRS) {
        const nq = q + dq, nr = r + dr;
        if (!inBoard(nq, nr)) continue;
        const tile = State.tiles.get(keyOf(nq, nr));
        if (tile && tile.sign === -1) { target = { q: nq, r: nr }; break; }
      }
      if (!target) {
        const opts = DIRS.map(([dq,dr]) => ({ q:q+dq, r:r+dr })).filter(t => inBoard(t.q, t.r));
        if (opts.length === 0) { HUD.logTxt.textContent = '🎰 無法移動'; return; }
        target = opts[(Math.random() * opts.length) | 0];
      }
      const cdVal = Math.max(1, 5 - Math.floor(player.stats.LUK / 4));
      player.gamblerCooldown = cdVal;
      player._gamblerSkip = true;
      player.intent = { q: target.q, r: target.r };
      HUD.logTxt.textContent = `🎰 豪賭一擊 至 (${target.q},${target.r})，冷卻 ${cdVal} 回合`;
      beginTurn();
    },
  },
  {
    id: 'tactician', icon: '🔭', label: '精算步伐',
    desc: 'INT 越高冷卻越短，可移動到 2 格範圍內任意格（青色高亮）',
    cooldownProp: 'tacticianCooldown',
    use(q, r) {
      player.pendingSkill = 'tactician';
      HUD.logTxt.textContent = '🔭 精算步伐：請點選 2 格範圍內任意目標格';
      closeSkillMenu();
    },
  },
];

function openSkillMenu(q, r, clientX, clientY) {
  if (!skillMenuEl) return;
  skillMenuEl.innerHTML = `<div class="skill-title">⚔ 技能選單</div>`;
  for (const sk of SKILLS) {
    const cd = player[sk.cooldownProp] || 0;
    const btn = document.createElement('button');
    btn.disabled = cd > 0;
    btn.innerHTML =
      `<span>${sk.icon} ${sk.label}</span>` +
      `<span class="sk-cd">${cd > 0 ? `CD ${cd}` : '可用'}</span>`;
    btn.title = sk.desc;
    btn.addEventListener('click', () => {
      closeSkillMenu();
      if (cd > 0) return;
      sk.use(q, r);
    });
    skillMenuEl.appendChild(btn);
  }
  // 定位：不超出視窗右側
  skillMenuEl.style.display = 'block';
  const mw = skillMenuEl.offsetWidth || 160;
  const vw = window.innerWidth;
  const left = Math.min(clientX, vw - mw - 8);
  skillMenuEl.style.left = left + 'px';
  skillMenuEl.style.top  = (clientY - skillMenuEl.offsetHeight - 8) + 'px';
}

function closeSkillMenu() {
  if (skillMenuEl) skillMenuEl.style.display = 'none';
}

// ── 移動 ──────────────────────────────────────────────
export function tryMoveTo(q, r, clientX, clientY) {
  if (!State.inGame) return;
  if (!inBoard(q, r)) return;
  if (player.moving || State.npcList.some(n => n.moving)) return;
  if (State.gameOver) return;
  if (State.battleLocked) return;   // 戰鬥動畫播放中，禁止操作
  const d = dist(player.q, player.r, q, r);

  if (d === 0) {
    if (player.rushPending) {
      player.rushPending = false;
      HUD.logTxt.textContent = '⚡ 衝刺取消';
      return;
    }
    if (player.pendingSkill) {
      player.pendingSkill = null;
      HUD.logTxt.textContent = '技能取消';
      return;
    }
    // 點擊玩家本體 → 開啟技能選單
    openSkillMenu(q, r, clientX ?? _skillMenuClickX, clientY ?? _skillMenuClickY);
    return;
  }

  // ── pendingSkill 待選格（快手連擊 / 精算步伐）────────
  if (player.pendingSkill) {
    const sk = player.pendingSkill;
    player.pendingSkill = null;
    closeSkillMenu();
    if (sk === 'opportunist') {
      if (d !== 1) { HUD.logTxt.textContent = '🎯 快手連擊取消（需相鄰 1 格）'; return; }
      const cdVal = Math.max(1, 4 - Math.floor(player.stats.DEX / 5));
      player.opportunistCooldown = cdVal;
      player._opportunistSkip = true;
      player.intent = { q, r, opportunist: true };
      HUD.logTxt.textContent = `🎯 快手連擊 至 (${q},${r})，其他技能冷卻各減 1，冷卻 ${cdVal} 回合`;
      beginTurn();
      return;
    }
    if (sk === 'tactician') {
      if (d < 1 || d > 2) { HUD.logTxt.textContent = '🔭 精算步伐取消（需 2 格範圍內）'; return; }
      const cdVal = Math.max(1, 5 - Math.floor(player.stats.INT / 4));
      player.tacticianCooldown = cdVal;
      player._tacticianSkip = true;
      player.intent = { q, r };
      HUD.logTxt.textContent = `🔭 精算步伐 至 (${q},${r})，冷卻 ${cdVal} 回合`;
      beginTurn();
      return;
    }
    return;
  }

  // ── 衝刺待選方向 ──────────────────────────────────────
  if (player.rushPending) {
    player.rushPending = false;
    const RUSH_DIRS = [[2,0],[-2,0],[0,2],[0,-2],[2,-2],[-2,2]];
    const dq = q - player.q, dr = r - player.r;
    const isValid = RUSH_DIRS.some(([a, b]) => dq === a && dr === b);
    if (!isValid) {
      HUD.logTxt.textContent = '⚡ 衝刺取消（非直線 2 格方向）';
      return;
    }
    // 計算中間格與最終格
    const midQ = player.q + dq / 2, midR = player.r + dr / 2;
    let tq = q, tr = r;
    if (!inBoard(tq, tr)) {
      if (!inBoard(midQ, midR)) {
        HUD.logTxt.textContent = '⚡ 衝刺取消（目標超出範圍）';
        return;
      }
      tq = midQ; tr = midR;
    }
    const cdVal = Math.max(1, 5 - Math.floor(player.stats.AGL / 4));
    player.rushCooldown = cdVal;
    player._rushSkip = true;
    player.intent = { q: tq, r: tr, rush: true };
    HUD.logTxt.textContent = `⚡ 玩家 衝刺至 (${tq},${tr})，冷卻 ${cdVal} 回合`;
    beginTurn();
    return;
  }

  // 點其他格時關閉選單
  closeSkillMenu();
  if (d !== 1) return;
  player.intent = { q, r };
  beginTurn();
}

// ── 回合開始 ──────────────────────────────────────────
function beginTurn() {
  if (!player.intent) return;
  chooseAllNpcIntents();
  applyIntents();
}

function applyIntents() {
  const pq = player.intent.q, pr = player.intent.r;
  const pp = axialToPixel(pq, pr);
  player.tx = pp.x; player.ty = pp.y;

  if (player.intent.wait) {
    player.moving  = false;
    player.waiting = true;
  } else {
    player.moving  = true;
    player.waiting = false;
  }

  for (const n of State.npcList) {
    if (!n.intent) n.intent = { q: n.q, r: n.r };
    const np = axialToPixel(n.intent.q, n.intent.r);
    n.tx = np.x; n.ty = np.y; n.moving = true;
  }

  State.turnActive = true;
  updateHUD();
}

// ── 回合結束 ──────────────────────────────────────────
function finishTurn() {
  if (player.intent) {
    const wasOpportunist = !!player.intent.opportunist;
    player.q = player.intent.q;
    player.r = player.intent.r;
    player.intent  = null;
    player.waiting = false;
    if (player._waitSkip) {
      player._waitSkip = false;
    } else if (player.waitCooldown > 0) {
      player.waitCooldown = Math.max(0, player.waitCooldown - 1);
    }
    if (player._rushSkip) {
      player._rushSkip = false;
    } else if (player.rushCooldown > 0) {
      player.rushCooldown = Math.max(0, player.rushCooldown - 1);
    }
    // 其餘六種技能冷卻通用遞減
    for (const sk of SKILLS) {
      const cp = sk.cooldownProp;
      if (!cp || cp === 'waitCooldown' || cp === 'rushCooldown') continue;
      const sp = `_${sk.id}Skip`;
      if (player[sp]) { player[sp] = false; }
      else if (player[cp] > 0) { player[cp] = Math.max(0, player[cp] - 1); }
    }
    // 快手連擊加成：其他所有技能冷卻多減 1
    if (wasOpportunist) {
      for (const sk of SKILLS) {
        if (sk.cooldownProp && sk.cooldownProp !== 'opportunistCooldown' && player[sk.cooldownProp] > 0) {
          player[sk.cooldownProp] = Math.max(0, player[sk.cooldownProp] - 1);
        }
      }
    }
  }
  for (const n of State.npcList) {
    if (n.intent) { n.q = n.intent.q; n.r = n.intent.r; n.intent = null; }
  }
  for (const n of State.npcList) {
    if (n._waitSkip) { n._waitSkip = false; }
    else if (n.stayCooldown > 0) { n.stayCooldown = Math.max(0, n.stayCooldown - 1); }
    // 各人格技能冷卻遞減
    for (const prop of ['aggressive','defensive','opportunist','random','gambler','tactician']) {
      const cp = `${prop}Cooldown`;
      if (n[cp] > 0) n[cp] = Math.max(0, n[cp] - 1);
    }
    n.skillActive = null;
  }
  updateHUD();
  State.turnActive = false;
  if (!State.gameOver && State.inGame) chooseAllNpcPreviewIntents();
  if (!State.gameOver && State.inGame && State.knockersEnabled && State.knockers.length > 0) {
    startEnvironmentPhase();
  } else {
    checkEncounters();
  }
}

// ── 視角置中 ─────────────────────────────────────────
export function recenter() {
  const p = axialToPixel(player.q, player.r);
  cam.x = -p.x;
  cam.y = -p.y;
}

// ── 重開一局（回到角色選擇）─────────────────────────
export function restart() {
  State.gameOver  = false;
  State.overallWin = false;
  State.wins      = 0;
  HUD.logTxt.textContent = "（按「直接開始」隨機選角，或「選擇角色」自選玩家與 NPC）";

  regenTiles();
  updateHUD();

  player.q = 0; player.r = 0;
  const pp = axialToPixel(0, 0);
  player.x = player.tx = pp.x;
  player.y = player.ty = pp.y;
  player.moving = false; player.intent = null;

  State.npcList      = [];
  State.knockers     = [];
  State.turnActive   = false;
  State.inGame       = false;
  State.selectedChar = '';
  State.selectedNpcs = [];

  stopBgm();
  for (const b of getCharButtons()) b.disabled = false;
  recenter();
}

// ── 隨機洗牌輔助 ──────────────────────────────────────
function _shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 公開給 UI 用：隨機填滿選角（玩家 + 最多 39 名 NPC）。
 *  若已有部分選擇，則只補足缺少的部分；完全空白則全隨機。 */
export function fillRandomRoster() {
  const total = CHARS.length;
  // 若無玩家，隨機指定一名
  if (!State.selectedChar) {
    const pick = CHARS[(Math.random() * total) | 0];
    State.selectedChar = pick.name;
    player.name  = pick.name;
    player.stats = Object.assign({}, pick.stats);
  }
  // 補足 NPC 至 39 名
  const need = 39;
  const existing = new Set(State.selectedNpcs || []);
  const pool = _shuffle(CHARS.filter(c => c.name !== State.selectedChar && !existing.has(c.name)));
  const added = pool.slice(0, need - existing.size).map(c => c.name);
  State.selectedNpcs = [...existing, ...added];
}

// ── 開始遊戲 ─────────────────────────────────────────
export function startGame() {
  if (State.inGame) return;
  // 確保玩家 + 39 名 NPC 均已填滿（隨機補完）
  fillRandomRoster();
  const def = CHARS.find(c => c.name === State.selectedChar);
  if (!def) { alert('角色資料異常，請重新整理頁面'); return; }
  player.name  = def.name;
  player.stats = Object.assign({}, def.stats);
  placeNpcList();
  placeKnockers();
  State.inGame    = true;
  State.gameOver  = false;
  State.overallWin = false;
  State.wins      = 0;
  HUD.logTxt.textContent = '遊戲開始！';
  for (const b of getCharButtons()) b.disabled = true;
  recenter();
  updateHUD();
  tryPlayBgm();
}

// ── 主動畫迴圈 ───────────────────────────────────────
function loop() {
  const speed = 0.18;

  // 玩家動畫插值
  player.x += (player.tx - player.x) * speed;
  player.y += (player.ty - player.y) * speed;
  if (player.moving && Math.abs(player.tx - player.x) < 0.2 && Math.abs(player.ty - player.y) < 0.2) {
    player.x = player.tx; player.y = player.ty; player.moving = false;
  }

  // NPC 動畫插值
  for (const n of State.npcList) {
    if (!n.moving) continue;
    n.x += (n.tx - n.x) * speed;
    n.y += (n.ty - n.y) * speed;
    if (Math.abs(n.tx - n.x) < 0.2 && Math.abs(n.ty - n.y) < 0.2) {
      n.x = n.tx; n.y = n.ty; n.moving = false;
    }
  }

  // Knocker 動畫插值
  for (const k of State.knockers) {
    if (!k.moving) continue;
    k.x += (k.tx - k.x) * speed;
    k.y += (k.ty - k.y) * speed;
    if (Math.abs(k.tx - k.x) < 0.2 && Math.abs(k.ty - k.y) < 0.2) {
      k.x = k.tx; k.y = k.ty; k.moving = false;
      if (k.intent) { k.q = k.intent.q; k.r = k.intent.r; }
    }
  }

  // 回合完成判定
  if (State.turnActive && !player.moving && State.npcList.every(n => !n.moving)) {
    finishTurn();
  }

  // Environment 階段完成判定
  if (!State.turnActive && State.envActive && State.knockers.length > 0 && State.knockers.every(k => !k.moving)) {
    finishEnvironmentPhase();
  }

  // 相機柔跟玩家
  cam.x += (-player.x - cam.x) * 0.08;
  cam.y += (-player.y - cam.y) * 0.08;

  draw();
  requestAnimationFrame(loop);
}

// ── 初始化 ────────────────────────────────────────────
async function init() {
  initCanvas();
  resize();
  initHUD();
  initBgm();

  // 先從 CSV 載入角色資料，再建立選角 UI
  await loadRoles();
  buildCharButtons();

  // 初始化選單 overlay
  initMenus();
  showStartMenu();

  // 設定預設選角
  const def = CHARS.find(c => c.name === State.selectedChar) || CHARS[0];
  State.selectedChar = def.name;
  player.name  = def.name;
  player.stats = Object.assign({}, def.stats);

  restart();

  // ── 專案圖片下拉 ───────────────────────────────────
  const sel = document.getElementById('projectImgs');
  sel.innerHTML = '';
  const noneOpt = document.createElement('option');
  noneOpt.value = ''; noneOpt.textContent = '(無)';
  sel.appendChild(noneOpt);
  for (const imgPath of PROJECT_IMAGES) {
    const o = document.createElement('option');
    o.value = imgPath; o.textContent = imgPath;
    sel.appendChild(o);
  }

  // 嘗試載入預設背景
  (() => {
    const img = new Image();
    img.onload = () => { State.boardBgImage = img; State.boardBgMode = 'image'; State.boardBgFollowCam = true; };
    img.src = encodeURI('image/background/unnamed.jpg');
  })();

  document.getElementById('applyProjectImg').addEventListener('click', () => {
    const v = sel.value;
    if (!v) return;
    const img = new Image();
    img.onload  = () => { State.boardBgImage = img; State.boardBgMode = 'image'; };
    img.onerror = () => alert('載入專案圖片失敗：' + v);
    img.src = encodeURI(v);
  });

  // ── NPC 風險機率滑桿 ───────────────────────────────
  const riskRow = document.createElement('div');
  riskRow.style.marginTop = '10px';
  riskRow.innerHTML = `<div class="muted">NPC 風險移動機率： <span id="riskPct">${Math.round(State.npcRiskChance*100)}%</span></div>`;
  const riskInput = document.createElement('input');
  riskInput.id = 'riskInput'; riskInput.type = 'range';
  riskInput.min = '0'; riskInput.max = '100'; riskInput.step = '5';
  riskInput.value = String(Math.round(State.npcRiskChance * 100));
  riskInput.style.width = '100%';
  riskInput.addEventListener('input', e => setNpcRiskChance(Number(e.target.value) / 100));
  riskRow.appendChild(riskInput);
  document.getElementById('panel').appendChild(riskRow);

  // ── 進攻機率滑桿 ───────────────────────────────────
  const aggroRow = document.createElement('div');
  aggroRow.style.marginTop = '8px';
  aggroRow.innerHTML = `<div class="muted">NPC 侵略機率（會找對自己有利的格子）： <span id="aggroPct">${Math.round(State.npcAggroChance*100)}%</span></div>`;
  const aggroInput = document.createElement('input');
  aggroInput.id = 'aggroInput'; aggroInput.type = 'range';
  aggroInput.min = '0'; aggroInput.max = '100'; aggroInput.step = '1';
  aggroInput.value = String(Math.round(State.npcAggroChance * 100));
  aggroInput.style.width = '100%';
  aggroInput.addEventListener('input', e => {
    const v = Number(e.target.value);
    State.npcAggroChance = v / 100;
    document.getElementById('aggroPct').textContent = v + '%';
  });
  aggroRow.appendChild(aggroInput);
  document.getElementById('panel').appendChild(aggroRow);

  // ── 難度預設 ───────────────────────────────────────
  const diffRow = document.createElement('div');
  diffRow.style.marginTop = '8px';
  diffRow.innerHTML = '<div class="muted">難度預設：</div>';
  const diffSel = document.createElement('select');
  diffSel.id = 'difficultySelect';
  [['low','低 (較少 risky)'],['medium','中 (平衡)'],['high','高 (較多 risky)']].forEach(([v, t]) => {
    const o = document.createElement('option'); o.value = v; o.textContent = t;
    diffSel.appendChild(o);
  });
  diffSel.addEventListener('change', e => applyDifficulty(e.target.value));
  diffRow.appendChild(diffSel);
  const btnSave  = document.createElement('button'); btnSave.textContent  = '儲存設定'; btnSave.style.marginLeft = '8px';
  const btnReset = document.createElement('button'); btnReset.textContent = '重設預設'; btnReset.style.marginLeft = '6px';
  btnSave.addEventListener('click',  saveSettings);
  btnReset.addEventListener('click', () => { resetDefaults(); HUD.logTxt.textContent = '已重設為預設難度'; });
  diffRow.appendChild(btnSave); diffRow.appendChild(btnReset);
  document.getElementById('panel').appendChild(diffRow);

  loadSettings();

  // ── 戰鬥動畫開關 ───────────────────────────────────
  const animRow = document.createElement('div');
  animRow.style.marginTop = '8px';
  animRow.innerHTML = '<div class="muted">戰鬥動畫設定：</div>';

  const mkAnimToggle = (id, label, stateKey) => {
    const wrap = document.createElement('label');
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:6px;margin-right:14px;cursor:pointer;font-size:13px;margin-top:4px';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = State[stateKey]; cb.id = id;
    cb.addEventListener('change', e => { State[stateKey] = e.target.checked; });
    wrap.appendChild(cb);
    wrap.appendChild(document.createTextNode(label));
    return wrap;
  };
  animRow.appendChild(mkAnimToggle('animPlayer', '玩家戰鬥動畫', 'battleAnimPlayer'));
  animRow.appendChild(mkAnimToggle('animNpc',    'NPC 對戰動畫',    'battleAnimNpc'));
  document.getElementById('panel').appendChild(animRow);

  // ── Knockers UI ────────────────────────────────────
  const kRow = document.createElement('div');
  kRow.style.marginTop = '8px';
  kRow.innerHTML = '<div class="muted">干擾撞棋 NPC（Knockers）</div>';
  const kEnable = document.createElement('input');
  kEnable.type = 'checkbox'; kEnable.checked = State.knockersEnabled; kEnable.id = 'knockersEnable';
  const kLabel = document.createElement('label');
  kLabel.htmlFor = 'knockersEnable'; kLabel.style.cssText = 'margin-left:6px;margin-right:8px';
  kLabel.textContent = '啟用干擾單位';
  kEnable.addEventListener('change', e => {
    State.knockersEnabled = e.target.checked;
    if (!State.knockersEnabled) State.knockers = [];
  });
  kRow.appendChild(kEnable); kRow.appendChild(kLabel);
  // 新增：越界淘汰開關（預設開啟）
  const kElim = document.createElement('input');
  kElim.type = 'checkbox'; kElim.checked = State.knockersEliminateOnOut; kElim.id = 'knockersEliminate';
  const kElimLabel = document.createElement('label');
  kElimLabel.htmlFor = 'knockersEliminate'; kElimLabel.style.cssText = 'margin-left:6px;margin-right:8px';
  kElimLabel.textContent = '越界淘汰（勾選：越界即淘汰；取消：改為回彈）';
  kElim.addEventListener('change', e => {
    State.knockersEliminateOnOut = e.target.checked;
  });
  kRow.appendChild(kElim); kRow.appendChild(kElimLabel);
  const kCount = document.createElement('input');
  kCount.type = 'range'; kCount.min = '0'; kCount.max = '8'; kCount.step = '1';
  kCount.value = String(State.knockersCount); kCount.style.width = '100%';
  const kCountTxt = document.createElement('div');
  kCountTxt.className = 'muted'; kCountTxt.style.marginTop = '6px';
  kCountTxt.textContent = '數量：' + State.knockersCount;
  kCount.addEventListener('input', e => {
    State.knockersCount = Number(e.target.value);
    kCountTxt.textContent = '數量：' + State.knockersCount;
  });
  kRow.appendChild(kCount); kRow.appendChild(kCountTxt);
  document.getElementById('panel').appendChild(kRow);

  // ── Persona 圖例 ───────────────────────────────────
  const legend = document.createElement('div');
  legend.style.marginTop = '6px';
  legend.innerHTML = '<div class="muted">干擾單位類型圖例：</div>';
  const lg = document.createElement('div');
  lg.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:6px';
  for (const [persona, style] of Object.entries(KNOCKER_PERSONA_STYLES)) {
    const b = document.createElement('div');
    b.style.cssText = 'display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(42,48,64,0.6);padding:6px 8px;border-radius:8px;background:#0d1218';
    const sw = document.createElement('span');
    sw.style.cssText = `width:14px;height:14px;display:inline-block;background:${style.color};border-radius:4px`;
    const t = document.createElement('span');
    t.style.cssText = 'color:#cbd6e6;font-size:12px';
    t.textContent = `${style.label} — ${persona}`;
    b.appendChild(sw); b.appendChild(t); lg.appendChild(b);
  }
  legend.appendChild(lg);
  document.getElementById('panel').appendChild(legend);

  // ── 淘汰紀錄（已在 HTML 靜態定義，直接取用）────────────────────
  HUD.elimTxt = document.getElementById('elimTxt');

  // ── 角色 Tooltip ──────────────────────────────────
  charTooltip = document.createElement('div');
  charTooltip.className = 'charTooltip';
  document.body.appendChild(charTooltip);

  // ── 技能選單 ──────────────────────────────────
  skillMenuEl = document.createElement('div');
  skillMenuEl.className = 'skillMenu';
  document.body.appendChild(skillMenuEl);
  // 點選單外部關閉
  document.addEventListener('pointerdown', e => {
    if (skillMenuEl && skillMenuEl.style.display !== 'none') {
      if (!skillMenuEl.contains(e.target) && e.target !== canvas) closeSkillMenu();
    }
  }, { capture: true });

  // ── 事件：滑鼠移動（Hover + Tooltip）──────────────
  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const w  = screenToWorld(sx, sy);
    const a  = pixelToAxial(w.x, w.y);
    const k  = keyOf(a.q, a.r);
    State.hoverKey = State.tiles.has(k) ? k : null;

    // tooltip
    let shown = false;
    const psp = worldToScreen(player.x, player.y);
    if (Math.hypot(psp.x - sx, psp.y - sy) <= 20) {
      charTooltip.style.left    = (e.clientX + 12) + 'px';
      charTooltip.style.top     = (e.clientY + 12) + 'px';
      charTooltip.textContent   = `${player.name}\n${fmtStats(player.stats)}`;
      charTooltip.style.display = 'block';
      shown = true;
    } else {
      for (const n of State.npcList) {
        const nsp = worldToScreen(n.x, n.y);
        if (Math.hypot(nsp.x - sx, nsp.y - sy) <= 20) {
          charTooltip.style.left    = (e.clientX + 12) + 'px';
          charTooltip.style.top     = (e.clientY + 12) + 'px';
          charTooltip.textContent   = `${n.name}  [${n.persona || ''}]\nSTR ${n.stats.STR} AGL ${n.stats.AGL} VIT ${n.stats.VIT}\nDEX ${n.stats.DEX} LUK ${n.stats.LUK} INT ${n.stats.INT}`;
          charTooltip.style.display = 'block';
          shown = true; break;
        }
      }
      if (!shown) {
        for (const k of State.knockers) {
          const ksp = worldToScreen(k.x, k.y);
          if (Math.hypot(ksp.x - sx, ksp.y - sy) <= 36) {
            const ps = KNOCKER_PERSONA_STYLES[k.persona] || {};
            const cdLine = k.skillCooldown > 0
              ? `\n<span style="color:#88ffcc">冷卻中：${k.skillCooldown} 回合</span>`
              : `\n<span style="color:#88ffcc">技能可用</span>`;
            charTooltip.innerHTML =
              `<span style="color:${ps.color || '#aaf'};font-weight:700">【${ps.title || k.persona}】${ps.label || k.persona}</span>\n` +
              `<span style="color:#bbb">${ps.desc || ''}</span>\n` +
              `<span style="color:#ffe97a">▶ ${ps.skill || ''}</span>${cdLine}\n` +
              `<span style="color:#aaa">代表屬性：${k.stat || '?'}</span>`;
            charTooltip.style.left    = (e.clientX + 14) + 'px';
            charTooltip.style.top     = (e.clientY + 14) + 'px';
            charTooltip.style.display = 'block';
            shown = true; break;
          }
        }
      }
      if (!shown) {
        for (const k of State.knockers) {
          const ksp = worldToScreen(k.x, k.y);
          if (Math.hypot(ksp.x - sx, ksp.y - sy) <= 36) {
            const ps = KNOCKER_PERSONA_STYLES[k.persona] || {};
            const cdLine = k.skillCooldown > 0 ? `\n  冷卻中：${k.skillCooldown} 回合` : '\n  技能可用';
            charTooltip.innerHTML =
              `<span style="color:${ps.color || '#aaf'};font-weight:700">${ps.label || 'K'} ${ps.title || k.persona}</span>\n` +
              `<span style="color:#ccc;font-size:11px">${ps.desc || ''}</span>\n` +
              `<span style="color:#ffe97a;font-size:11px">▶ ${ps.skill || ''}</span>` +
              `<span style="color:#88ffcc;font-size:11px">${cdLine}</span>\n` +
              `<span style="color:#aaa;font-size:11px">屬性：${k.stat || '?'}</span>`;
            charTooltip.style.left    = (e.clientX + 14) + 'px';
            charTooltip.style.top     = (e.clientY + 14) + 'px';
            charTooltip.style.display = 'block';
            shown = true; break;
          }
        }
      }
    }
    if (!shown) charTooltip.style.display = 'none';
  });

  canvas.addEventListener('mouseleave', () => { if (charTooltip) charTooltip.style.display = 'none'; });

  // ── 事件：點擊移動 ────────────────────────────────
  canvas.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const w  = screenToWorld(sx, sy);
    const a  = pixelToAxial(w.x, w.y);
    _skillMenuClickX = e.clientX;
    _skillMenuClickY = e.clientY;
    tryMoveTo(a.q, a.r, e.clientX, e.clientY);
  });

  // ── 事件：鍵盤 ESC ────────────────────────────────
  window.addEventListener('keydown', e => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement && document.activeElement.isContentEditable)) return;
    if (!State.inGame || State.gameOver) return;
    // ESC 關閉技能選單
    if (e.key === 'Escape') {
      if (player.rushPending)  { player.rushPending = false; HUD.logTxt.textContent = '⚡ 衝刺取消'; }
      if (player.pendingSkill) { player.pendingSkill = null; HUD.logTxt.textContent = '技能取消'; }
      closeSkillMenu();
    }
  });

  // ── 事件：背景按鈕 ────────────────────────────────
  document.getElementById('bgNone').addEventListener('click',  () => { State.boardBgMode = 'none';  State.boardBgImage = null; });
  document.getElementById('bgGrid').addEventListener('click',  () => { State.boardBgMode = 'grid';  State.boardBgImage = null; });
  document.getElementById('bgWood').addEventListener('click',  () => { State.boardBgMode = 'wood';  State.boardBgImage = null; });
  document.getElementById('bgStone').addEventListener('click', () => { State.boardBgMode = 'stone'; State.boardBgImage = null; });

  document.getElementById('toggleTextMode').addEventListener('click', () => {
    const btn = document.getElementById('toggleTextMode');
    State.textReadMode = State.textReadMode === 'stroke' ? 'cool' : 'stroke';
    btn.textContent = State.textReadMode === 'stroke' ? '文字可讀模式：描邊' : '文字可讀模式：冷透底';
  });

  document.getElementById('bgFile').addEventListener('change', ev => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload  = () => { State.boardBgImage = img; State.boardBgMode = 'image'; URL.revokeObjectURL(url); };
    img.onerror = () => alert('載入圖片失敗');
    img.src = url;
  });

  window.addEventListener('resize', () => { resize(); recenter(); });

  document.getElementById('regen').addEventListener('click',    () => { regenTiles(); updateHUD(); });
  document.getElementById('recenter').addEventListener('click', recenter);
  document.getElementById('restart').addEventListener('click',  restart);
  document.getElementById('startGame').addEventListener('click', startGame);

  // ── 手機面板收合 ───────────────────────────────────
  const panelToggleBtn = document.getElementById('panelToggle');
  const wrapEl         = document.getElementById('wrap');
  if (panelToggleBtn && wrapEl) {
    panelToggleBtn.addEventListener('click', () => {
      wrapEl.classList.toggle('panel-collapsed');
      const collapsed = wrapEl.classList.contains('panel-collapsed');
      panelToggleBtn.textContent = collapsed ? '▶' : '◀';
      panelToggleBtn.title       = collapsed ? '展開選單' : '收合選單';
      setTimeout(() => { resize(); recenter(); }, 240);
    });
  }

  // ── 訊息框收合 ──────────────────────────────────────
  const msgToggleBtn = document.getElementById('msgToggle');
  const msgBody      = document.getElementById('msgBody');
  if (msgToggleBtn && msgBody) {
    msgToggleBtn.addEventListener('click', () => {
      const isCollapsed = msgBody.classList.toggle('collapsed');
      msgToggleBtn.textContent = isCollapsed ? '▴' : '▾';
      msgToggleBtn.title       = isCollapsed ? '展開' : '收合';
    });
  }

  loadCharImages();
  loadKnockerImages();
  requestAnimationFrame(loop);
}

// 監聽 UI 發出的開始請求（避免 circular import）
document.addEventListener('ui:startRequested', () => {
  hideMenus();
  startGame();
});

// 監聽玩家在結束對話框按下確定：重置並回到開始選單
document.addEventListener('ui:endConfirmed', () => {
  // 重置遊戲並顯示開始選單
  restart();
  showStartMenu();
});

init();
