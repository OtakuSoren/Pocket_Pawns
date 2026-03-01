// ============================================================
// ai.js — NPC 放置、AI 行為、環境干擾階段（Knocker）
// ============================================================

import { STATS, CHARS, KNOCKER_PERSONA_STYLES, NPC_PERSONA_STYLES } from './config.js';
import { State, player, npc } from './state.js';
import { keyOf, axialToPixel, dist, inBoard } from './hex.js';
import { randomTile } from './board.js';
import { HUD, updateHUD } from './ui.js';
import { stopBgm } from './bgm.js';
import { resolveBetween, addEliminationLog, checkVictory, checkEncounters } from './combat.js';

const NEIGH = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];

// ── 放置 Combatant NPC ────────────────────────────────────
export function placeNpcList() {
  State.npcList = [];
  const ex = new Set([keyOf(player.q, player.r)]);
  const pool = CHARS.filter(c => c.name !== State.selectedChar);
  for (const c of pool) {
    const k = randomTile(ex);
    if (!k) break;
    ex.add(k);
    const [nq, nr] = k.split(',').map(Number);
    const np = axialToPixel(nq, nr);
    const personas = Object.keys(NPC_PERSONA_STYLES);
    const persona = personas[(Math.random() * personas.length) | 0];
    const style = NPC_PERSONA_STYLES[persona];
    State.npcList.push({
      name: c.name,
      stats: Object.assign({}, c.stats),
      q: nq, r: nr,
      x: np.x, y: np.y, tx: np.x, ty: np.y,
      intent: null, moving: false,
      stayCooldown: 0, _waitSkip: false,
      persona,
      personaLabel: style.label,
      personaColor: style.color,
      // 技能欄位
      aggressiveCooldown: 0,  defensiveCooldown: 0,
      opportunistCooldown: 0, randomCooldown: 0,
      gamblerCooldown: 0,     tacticianCooldown: 0,
      skillActive: null,      counterKnockback: false,
    });
  }
}

// ── 放置 Knocker 干擾單位 ─────────────────────────────────
export function placeKnockers() {
  State.knockers = [];
  if (!State.knockersEnabled) return;

  const ex = new Set([keyOf(player.q, player.r)]);
  for (const n of State.npcList) ex.add(keyOf(n.q, n.r));

  const poolSize = Math.max(0, Math.min(8, Number(State.knockersCount) || 0));
  if (poolSize === 0) return;

  // 每個 Knocker 盡量分配一個不重複的屬性（一屬性一隻）
  const statsPool = STATS.slice();
  for (let s = statsPool.length - 1; s > 0; s--) {
    const j = Math.floor(Math.random() * (s + 1));
    [statsPool[s], statsPool[j]] = [statsPool[j], statsPool[s]];
  }
  const assignedStats = statsPool.slice(0, Math.min(poolSize, STATS.length));
  while (assignedStats.length < poolSize) {
    assignedStats.push(STATS[(Math.random() * STATS.length) | 0]);
  }

  const personas = Object.keys(KNOCKER_PERSONA_STYLES);
  // 洗牌後依序分配，確保 poolSize ≤ 6 時每種人格恰好出現一次
  for (let s = personas.length - 1; s > 0; s--) {
    const j = Math.floor(Math.random() * (s + 1));
    [personas[s], personas[j]] = [personas[j], personas[s]];
  }
  // poolSize > 6 時循環補足
  const assignedPersonas = [];
  for (let i = 0; i < poolSize; i++) assignedPersonas.push(personas[i % personas.length]);

  for (let i = 0; i < poolSize; i++) {
    const k = randomTile(ex);
    if (!k) break;
    ex.add(k);
    const [kq, kr] = k.split(',').map(Number);
    const p = axialToPixel(kq, kr);
    const persona = assignedPersonas[i];
    const stat = assignedStats[i];
    const style = KNOCKER_PERSONA_STYLES[persona] || { color: '#6fb3ff', label: 'K' };
    State.knockers.push({
      id: `K${Date.now()}_${i}`,
      q: kq, r: kr, x: p.x, y: p.y, tx: p.x, ty: p.y,
      intent: null, moving: false,
      persona, prevQ: kq, prevR: kr,
      stat,
      personaColor: style.color,
      personaLabel: style.label,
      skillCooldown: 0,
      skillActive: null,
    });
  }
}

// ── NPC 屬性生成 ─────────────────────────────────────────
export function rollNpcStats() {
  const s = {};
  for (const k of STATS) s[k] = 4 + ((Math.random() * 7) | 0);
  const picks = STATS.slice().sort(() => Math.random() - 0.5).slice(0, 2);
  for (const k of picks) s[k] = 12 + ((Math.random() * 7) | 0);
  const weak = STATS.filter(x => !picks.includes(x))[(Math.random() * 4) | 0];
  s[weak] = 1 + ((Math.random() * 4) | 0);
  npc.stats = s;
}

// ── 選擇單一 NPC 的 intent ────────────────────────────────
export function chooseNpcIntentFor(n, reserved, allowOverlap = false, riskChance = null, aggressive = false) {
  const opts = [];
  for (const [dq, dr] of NEIGH) {
    const nq = n.q + dq, nr = n.r + dr;
    if (!inBoard(nq, nr)) continue;
    if (dist(nq, nr, n.q, n.r) !== 1) continue;
    const key = keyOf(nq, nr);
    if (reserved.has(key)) continue;
    opts.push({ q: nq, r: nr });
  }

  // 嘗試待機策略（有機率停在同一格）
  try {
    let baseStay = (n.stayCooldown && n.stayCooldown > 0) ? 0 : State.npcStayChance;
    const curTile = State.tiles.get(keyOf(n.q, n.r));
    if (curTile) {
      const { stat, sign } = curTile;
      const pv = player.stats[stat], ev = n.stats[stat];
      if (ev != null && pv != null) {
        const favorable = (sign === 1 && ev > pv) || (sign === -1 && ev < pv);
        if (favorable) baseStay += 0.15;
      }
    }
    if (aggressive) baseStay = Math.max(0, baseStay - 0.12);
    if (Math.random() < baseStay) {
      return { q: n.q, r: n.r, risky: false, stay: true };
    }
  } catch (_e) {}

  if (opts.length === 0) return { q: n.q, r: n.r, risky: false };

  // 進攻型：尋找對 NPC 有優勢的相鄰格
  if (aggressive) {
    const fav = [];
    for (const o of opts) {
      const tile = State.tiles.get(keyOf(o.q, o.r));
      if (tile) {
        const { stat, sign } = tile;
        const pv = player.stats[stat], ev = n.stats[stat];
        if (pv !== undefined && ev !== undefined) {
          if (sign === 1 && ev > pv) fav.push(o);
          if (sign === -1 && ev < pv) fav.push(o);
        }
      }
      if (o.q === player.q && o.r === player.r) fav.push(o);
    }
    if (fav.length > 0) return Object.assign(fav[(Math.random() * fav.length) | 0], { aggressive: true });
  }

  // 風險型：移往對自己不利的格（給玩家擊殺機會）
  const rc = (riskChance == null) ? State.npcRiskChance : riskChance;
  if (Math.random() < rc) {
    const risky = [];
    for (const o of opts) {
      if (o.q === player.q && o.r === player.r) { risky.push(o); continue; }
      const tile = State.tiles.get(keyOf(o.q, o.r));
      if (!tile) continue;
      const { stat, sign } = tile;
      const pv = player.stats[stat], ev = n.stats[stat];
      if (pv !== undefined && ev !== undefined) {
        if (sign === 1 && pv > ev) risky.push(o);
        if (sign === -1 && pv < ev) risky.push(o);
      }
    }
    if (risky.length > 0) return Object.assign(risky[(Math.random() * risky.length) | 0], { risky: true });
  }

  return Object.assign(opts[(Math.random() * opts.length) | 0], { risky: false });
}

// ── 參戰 NPC 技能觸發（回傳 true 表示已覆蓋 intent）───────────
// sk_chances: 每種人格的基礎觸發機率
const NPC_SK_CHANCES = { Aggressive:0.28, Defensive:0.22, Opportunist:0.28, Random:0.38, Gambler:0.32, Tactician:0.22 };
const NPC_SK_CDS     = { Aggressive:3, Defensive:4, Opportunist:3, Random:4, Gambler:3, Tactician:3 };

function applyNpcSkill(n, reserved) {
  const p = n.persona;
  const cdProp = `${p.toLowerCase()}Cooldown`;
  if ((n[cdProp] || 0) > 0) return false;
  if (Math.random() >= (NPC_SK_CHANCES[p] || 0.2)) return false;

  const cd = Math.max(1, (NPC_SK_CDS[p] || 3));
  n.skillActive = p;

  switch (p) {
    case 'Aggressive': {
      // 朝最近目標衝 2 格
      const targets = [{ q: player.q, r: player.r }]
        .concat(State.npcList.filter(x => x !== n).map(x => ({ q: x.q, r: x.r })));
      let nearest = null, nearestD = Infinity;
      for (const t of targets) {
        const d = dist(n.q, n.r, t.q, t.r);
        if (d < nearestD) { nearestD = d; nearest = t; }
      }
      if (nearest) {
        const DIRS = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
        let bestDir = DIRS[0], bestScore = -Infinity;
        for (const [dq, dr] of DIRS) {
          const s = -dist(n.q + dq, n.r + dr, nearest.q, nearest.r);
          if (s > bestScore) { bestScore = s; bestDir = [dq, dr]; }
        }
        const [bdq, bdr] = bestDir;
        let tq = n.q + bdq * 2, tr = n.r + bdr * 2;
        if (!inBoard(tq, tr)) { tq = n.q + bdq; tr = n.r + bdr; }
        if (inBoard(tq, tr)) {
          n[cdProp] = cd;
          n.intent = { q: tq, r: tr, aggressive: true };
          reserved.add(keyOf(tq, tr));
          HUD.logTxt.textContent = `🗡 ${n.name} 突破衝撞！`;
          return true;
        }
      }
      break;
    }
    case 'Defensive': {
      // 原地待機，開護盾
      n.counterKnockback = true;
      n[cdProp] = cd;
      n.intent = { q: n.q, r: n.r, stay: true };
      reserved.add(keyOf(n.q, n.r));
      HUD.logTxt.textContent = `🛡 ${n.name} 鐵甲反彈就位！`;
      return true;
    }
    case 'Opportunist': {
      // 追最近單位移 1 格，其他技能 CD -1
      const DIRS = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
      const opts = DIRS.map(([dq,dr]) => ({ q:n.q+dq, r:n.r+dr }))
        .filter(t => inBoard(t.q, t.r) && !reserved.has(keyOf(t.q, t.r)));
      if (opts.length > 0) {
        let best = opts[0], bestD = Infinity;
        for (const o of opts) {
          const d = Math.min(
            dist(o.q, o.r, player.q, player.r),
            ...State.npcList.filter(x=>x!==n).map(x=>dist(o.q,o.r,x.q,x.r))
          );
          if (d < bestD) { bestD = d; best = o; }
        }
        n[cdProp] = cd;
        // 其他技能 CD 各 -1
        for (const skId of ['aggressive','defensive','random','gambler','tactician']) {
          const cp = `${skId}Cooldown`;
          if (n[cp] > 0) n[cp] = Math.max(0, n[cp] - 1);
        }
        n.intent = { q: best.q, r: best.r };
        reserved.add(keyOf(best.q, best.r));
        HUD.logTxt.textContent = `🎯 ${n.name} 快手連擊！`;
        return true;
      }
      break;
    }
    case 'Random': {
      // 傳送到隨機空格
      const occupied = new Set();
      occupied.add(keyOf(n.q, n.r));
      occupied.add(keyOf(player.q, player.r));
      for (const x of State.npcList) if (x !== n) occupied.add(keyOf(x.q, x.r));
      const available = Array.from(State.tiles.keys()).filter(k => !occupied.has(k) && !reserved.has(k));
      if (available.length > 0) {
        const [tq, tr] = available[(Math.random() * available.length) | 0].split(',').map(Number);
        n[cdProp] = cd;
        n.intent = { q: tq, r: tr };
        reserved.add(keyOf(tq, tr));
        HUD.logTxt.textContent = `🎲 ${n.name} 亂入傳送！`;
        return true;
      }
      break;
    }
    case 'Gambler': {
      // 優先負屬性相鄰格
      const DIRS = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
      let target = null;
      for (const [dq, dr] of DIRS) {
        const nq = n.q+dq, nr = n.r+dr;
        if (!inBoard(nq, nr) || reserved.has(keyOf(nq, nr))) continue;
        const tile = State.tiles.get(keyOf(nq, nr));
        if (tile && tile.sign === -1) { target = { q:nq, r:nr }; break; }
      }
      if (!target) {
        const opts = DIRS.map(([dq,dr]) => ({q:n.q+dq,r:n.r+dr}))
          .filter(t => inBoard(t.q,t.r) && !reserved.has(keyOf(t.q,t.r)));
        if (opts.length > 0) target = opts[(Math.random()*opts.length)|0];
      }
      if (target) {
        n[cdProp] = cd;
        n.intent = { q: target.q, r: target.r };
        reserved.add(keyOf(target.q, target.r));
        HUD.logTxt.textContent = `🎰 ${n.name} 豪賭一擊！`;
        return true;
      }
      break;
    }
    case 'Tactician': {
      // 2 格範圍選最有利的格
      const seen = new Set();
      const range2 = [];
      for (const [dq,dr] of NEIGH) {
        const mq=n.q+dq, mr=n.r+dr;
        if (!inBoard(mq,mr)) continue;
        for (const [dq2,dr2] of [[0,0],...NEIGH]) {
          const tq=mq+dq2, tr=mr+dr2;
          if (!inBoard(tq,tr) || reserved.has(keyOf(tq,tr)) || seen.has(keyOf(tq,tr))) continue;
          seen.add(keyOf(tq,tr));
          range2.push({ q:tq, r:tr });
        }
      }
      if (range2.length > 0) {
        // 選對自己最有利的格
        let best = range2[0], bestScore = -Infinity;
        for (const o of range2) {
          const tile = State.tiles.get(keyOf(o.q, o.r));
          let s = 0;
          if (tile) {
            const favorable = (tile.sign===1 && n.stats[tile.stat] > player.stats[tile.stat])
              || (tile.sign===-1 && n.stats[tile.stat] < player.stats[tile.stat]);
            if (favorable) s += 20;
          }
          s -= dist(o.q, o.r, player.q, player.r);
          if (s > bestScore) { bestScore = s; best = o; }
        }
        n[cdProp] = cd;
        n.intent = { q: best.q, r: best.r };
        reserved.add(keyOf(best.q, best.r));
        HUD.logTxt.textContent = `🔭 ${n.name} 精算步伐！`;
        return true;
      }
      break;
    }
  }
  n.skillActive = null;
  return false;
}

// ── 全體 NPC 決定 intent ──────────────────────────────────
export function chooseAllNpcIntents() {
  const reserved = new Set();
  const order = State.npcList.slice().sort(() => Math.random() - 0.5);

  for (const n of order) {
    n.skillActive = null;
    // ── 技能觸發兩判 ──
    if (applyNpcSkill(n, reserved)) continue;

    let allowOverlap, useRisk, isAggressive;

    switch (n.persona) {
      case 'Aggressive':  // 勇猛型：強制進攻、無視重疊
        isAggressive = true;
        allowOverlap = true;
        useRisk = 0;
        break;
      case 'Defensive':   // 謹慎型：保守移動，不冒險
        isAggressive = false;
        allowOverlap = false;
        useRisk = 0;
        break;
      case 'Random':      // 隨性型：完全隨機行為
        isAggressive = Math.random() < 0.3;
        allowOverlap = Math.random() < 0.5;
        useRisk = Math.random();
        break;
      case 'Gambler':     // 賭徒型：偏好對自己不利的格（搏命）
        isAggressive = false;
        allowOverlap = Math.random() < 0.7;
        useRisk = 0.88;
        break;
      case 'Tactician':   // 智將型：理性進攻，不輕易重疊
        isAggressive = true;
        allowOverlap = false;
        useRisk = 0.05;
        break;
      case 'Opportunist': // 機會主義型：有機率進攻，偶發冒險
      default:
        isAggressive = Math.random() < (State.npcAggroChance ?? 0.3);
        allowOverlap = Math.random() < State.npcRiskChance;
        useRisk = null;
        break;
    }

    // 微小機率的「衝動」讓任何人格偶爾失控
    if (Math.random() < 0.06) { allowOverlap = true; useRisk = Math.max(State.npcRiskChance, 0.95); }

    const intent = chooseNpcIntentFor(n, reserved, allowOverlap, useRisk, isAggressive);
    const idx = State.npcList.findIndex(x => x === n);
    if (idx !== -1) {
      State.npcList[idx].intent  = intent;
      State.npcList[idx].preview = null;
      if (intent && intent.stay) {
        State.npcList[idx].stayCooldown = 3;
        State.npcList[idx]._waitSkip = true;
      }
      reserved.add(keyOf(intent.q, intent.r));
    }
  }
}

// ── 全體 NPC 計算「下回合預測」（顯示用）────────────────
export function chooseAllNpcPreviewIntents() {
  const reserved = new Set();
  const order = State.npcList.slice().sort(() => Math.random() - 0.5);
  for (const n of order) {
    const intent = chooseNpcIntentFor(n, reserved, Math.random() < State.npcRiskChance);
    const idx = State.npcList.findIndex(x => x === n);
    if (idx !== -1) {
      State.npcList[idx].preview = intent;
      reserved.add(keyOf(intent.q, intent.r));
    }
  }
}

// ── Knocker 行為選擇 ──────────────────────────────────────
export function chooseAllKnockerIntents() {
  const reserved = new Set();
  for (const k of State.knockers) reserved.add(keyOf(k.q, k.r));

  const isEdge = (q, r) => dist(0, 0, q, r) >= (State.R - 1);
  const units = [{ type: 'player', q: player.q, r: player.r, ref: player }]
    .concat(State.npcList.map(n => ({ type: 'npc', q: n.q, r: n.r, ref: n })));

  function simulateKnockbackScore(k, targetQ, targetR) {
    const dirQ = targetQ - k.q, dirR = targetR - k.r;
    let score = 0;
    for (const kb of [2, 3]) {
      let lastQ = targetQ, lastR = targetR, eliminated = false;
      for (let i = 1; i <= kb; i++) {
        const nq = targetQ + dirQ * i, nr = targetR + dirR * i;
        if (!inBoard(nq, nr)) { eliminated = true; break; }
        lastQ = nq; lastR = nr;
      }
      if (eliminated) score += 30;
      const hitOther = (player.q === lastQ && player.r === lastR)
        || State.npcList.some(n => n.q === lastQ && n.r === lastR);
      if (hitOther) score += 20;
      const t = State.tiles.get(keyOf(lastQ, lastR));
      if (t && t.sign === -1) score += 6;
    }
    return score;
  }

  const SK_CHANCES = { Aggressive:0.30, Defensive:0.25, Opportunist:0.30, Random:0.40, Gambler:0.35, Tactician:0.25 };
  const SK_CDS     = { Aggressive:3, Defensive:4, Opportunist:3, Random:2, Gambler:4, Tactician:3 };
  const SK_NAMES   = { Aggressive:'突破衝撞', Defensive:'鐵甲反彈', Opportunist:'連環追擊', Random:'狂亂衝刺', Gambler:'豪賭一擊', Tactician:'精算打擊' };

  for (const k of State.knockers) {
    // ── 技能觸發 ──
    k.skillActive = null;
    if (k.skillCooldown <= 0 && Math.random() < (SK_CHANCES[k.persona] || 0.25)) {
      k.skillActive = k.persona;
      k.skillCooldown = SK_CDS[k.persona] || 3;
      HUD.logTxt.textContent = `【技能】${k.personaLabel} 發動「${SK_NAMES[k.persona] || '未知技能'}」！`;
    }

    // ── 候選格（技能可擴展移動範圍）──
    const candidateSet = new Map();
    const addC = (q, r) => { if (inBoard(q, r)) candidateSet.set(keyOf(q, r), { q, r }); };

    if (k.skillActive === 'Random') {
      // 往隨機方向衝 2 格
      const dirs = NEIGH.slice().sort(() => Math.random() - 0.5);
      for (const [dq, dr] of dirs) {
        const tq = k.q + dq * 2, tr = k.r + dr * 2;
        if (inBoard(tq, tr)) { addC(tq, tr); break; }
      }
    } else if (k.skillActive === 'Aggressive') {
      // 直衝最近單位（含其所在格與周邊）
      let nearest = null, nearestD = Infinity;
      for (const u of units) {
        const d = dist(k.q, k.r, u.q, u.r);
        if (d < nearestD) { nearestD = d; nearest = u; }
      }
      if (nearest) {
        addC(nearest.q, nearest.r);
        for (const [dq, dr] of NEIGH) addC(nearest.q + dq, nearest.r + dr);
      }
    } else if (k.skillActive === 'Opportunist') {
      // 追最弱單位（VIT 最低）
      let weakest = null, weakestV = Infinity;
      for (const u of units) {
        const v = (u.ref.stats && u.ref.stats.VIT) || 99;
        if (v < weakestV) { weakestV = v; weakest = u; }
      }
      if (weakest) {
        addC(weakest.q, weakest.r);
        for (const [dq, dr] of NEIGH) addC(weakest.q + dq, weakest.r + dr);
      }
    } else if (k.skillActive === 'Tactician') {
      // 展開 2 格範圍所有可達格
      for (const [dq, dr] of NEIGH) {
        const mq = k.q + dq, mr = k.r + dr;
        addC(mq, mr);
        for (const [dq2, dr2] of NEIGH) addC(mq + dq2, mr + dr2);
      }
    }

    // 技能未覆蓋時使用正常 1 格鄰格
    if (candidateSet.size === 0) {
      for (const [dq, dr] of NEIGH) addC(k.q + dq, k.r + dr);
    }

    const candidates = [...candidateSet.values()];
    if (candidates.length === 0) { k.intent = { q: k.q, r: k.r }; continue; }

    let bestChoice = null, bestScore = -Infinity;
    for (const c of candidates) {
      const key = keyOf(c.q, c.r);
      if (reserved.has(key)) continue;

      let score = 0;
      let nearestD = Infinity;
      for (const u of units) {
        const d = dist(c.q, c.r, u.q, u.r);
        if (d < nearestD && u.ref !== k) nearestD = d;
      }
      score += (10 - Math.min(10, nearestD));

      const landingPlayer = (player.q === c.q && player.r === c.r);
      const landingNpc    = State.npcList.find(n => n.q === c.q && n.r === c.r);
      const tile          = State.tiles.get(key);

      switch (k.persona || 'Random') {
        case 'Aggressive':
          if (landingPlayer || landingNpc) score += 40;
          score += 6;
          break;
        case 'Defensive':
          if (isEdge(c.q, c.r)) score -= 30;
          if (landingPlayer || landingNpc) score -= 20;
          score += (10 - dist(0, 0, c.q, c.r));
          break;
        case 'Opportunist': {
          let weakest = null, weakestV = Infinity;
          for (const u of units) {
            const v = u.ref.stats ? (u.ref.stats.VIT || 0) : 0;
            if (v < weakestV) { weakestV = v; weakest = u; }
          }
          if (weakest) {
            const dBefore = dist(k.q, k.r, weakest.q, weakest.r);
            const dAfter  = dist(c.q, c.r, weakest.q, weakest.r);
            if (dAfter < dBefore) score += 12;
            if (landingNpc && landingNpc.stats && landingNpc.stats.VIT <= weakestV) score += 18;
          }
          if (isEdge(c.q, c.r)) score += 6;
          break;
        }
        case 'Random':
          score += (Math.random() * 6);
          if (isEdge(c.q, c.r)) score -= 4;
          break;
        case 'Gambler':
          score += (Math.random() * 12);
          if (tile && tile.sign === -1) score += 14;
          if (landingPlayer || landingNpc) score += 10;
          break;
        case 'Tactician':
          score += simulateKnockbackScore(k, c.q, c.r);
          score += (8 - dist(0, 0, c.q, c.r));
          break;
      }

      if (c.q === k.q && c.r === k.r) score -= 2;
      if (score > bestScore) { bestScore = score; bestChoice = c; }
    }

    if (!bestChoice) {
      const fr = candidates.filter(c => !reserved.has(keyOf(c.q, c.r)));
      bestChoice = fr.length > 0
        ? fr[(Math.random() * fr.length) | 0]
        : { q: k.q, r: k.r };
    }

    k.intent = { q: bestChoice.q, r: bestChoice.r };
    reserved.add(keyOf(k.intent.q, k.intent.r));
  }
}

// ── 套用 Knocker intents（啟動動畫）─────────────────────
export function applyKnockerIntents() {
  for (const k of State.knockers) {
    if (!k.intent) k.intent = { q: k.q, r: k.r };
    k.prevQ = k.q; k.prevR = k.r;
    const p = axialToPixel(k.intent.q, k.intent.r);
    k.tx = p.x; k.ty = p.y; k.moving = true;
  }
  State.envActive = true;
}

// ── 啟動環境階段 ─────────────────────────────────────────
export function startEnvironmentPhase() {
  if (!State.knockersEnabled || State.knockers.length === 0) {
    checkEncounters();
    return;
  }
  chooseAllKnockerIntents();
  applyKnockerIntents();
}

// ── 擊退處理（performKnockbackOn）───────────────────────
export function performKnockbackOn(target, dirQ, dirR, forceKb = null) {
  // 鐵甲反彈護盾：任何單位被彈飛時反方向
  if (target.counterKnockback) {
    target.counterKnockback = false;
    dirQ = -dirQ; dirR = -dirR;
    const who = target === player ? '玩家' : target.name;
    HUD.logTxt.textContent += ` 🛡 ${who}鐵甲反彈！`;
  }
  const kb = forceKb !== null ? forceKb : ([2, 3][(Math.random() * 2) | 0]);
  let lastQ = target.q, lastR = target.r, eliminated = false;

  for (let i = 1; i <= kb; i++) {
    const nq = target.q + dirQ * i, nr = target.r + dirR * i;
    if (!inBoard(nq, nr)) {
      if (i === 1) { eliminated = true; break; }
      lastQ = target.q + dirQ * (i - 1);
      lastR = target.r + dirR * (i - 1);
      break;
    }
    lastQ = nq; lastR = nr;
  }

  if (eliminated) {
    if (target === player) {
      State.gameOver = true;
      HUD.logTxt.textContent += '\n玩家被撞出界，淘汰！';
      addEliminationLog(`${player.name} 被撞出界淘汰`);
      stopBgm();
    } else {
      const idx = State.npcList.findIndex(n => n === target);
      if (idx !== -1) {
        addEliminationLog(`${target.name} 被撞出界淘汰`);
        State.npcList.splice(idx, 1);
        updateHUD();
        checkVictory();
      }
    }
    return;
  }

  // 落點移動
  target.q = lastQ; target.r = lastR;
  const tp = axialToPixel(lastQ, lastR);
  target.tx = tp.x; target.ty = tp.y;
  try { target.moving = true; } catch (_e) {}

  // 落點上若有其他單位 → 連鎖衝突
  // 注意：需排除 target 自身（target 剛被移到 lastQ/lastR，不能與自己衝突）
  const tile = State.tiles.get(keyOf(lastQ, lastR));

  // 若 target 為 NPC 且落到玩家同格 → 連鎖戰鬥
  if (target !== player && player.q === lastQ && player.r === lastR) {
    const res = resolveBetween(player, target, tile);
    if (res) {
      HUD.logTxt.textContent = `【連鎖衝突】${player.name} vs ${target.name} → ${res.winner === 'P' ? player.name : target.name} 勝`;
      if (res.winner === 'P') {
        // 玩家勝，移除 target NPC
        const idx2 = State.npcList.findIndex(n => n === target);
        if (idx2 !== -1) {
          addEliminationLog(`${target.name} 在連鎖衝突中被玩家 ${player.name} 擊敗淘汰`);
          State.npcList.splice(idx2, 1);
          updateHUD();
          checkVictory();
        }
      } else {
        // NPC 勝，玩家落敗
        State.gameOver = true;
        addEliminationLog(`${player.name} 在連鎖衝突中被 ${target.name} 擊敗淘汰`);
        stopBgm();
      }
    }
    return;
  }

  // 若落點有另一隻 NPC（排除 target 自身）→ 連鎖衝突
  const otherIdx = State.npcList.findIndex(n => n !== target && n.q === lastQ && n.r === lastR);
  if (otherIdx !== -1) {
    const other = State.npcList[otherIdx];
    const res   = resolveBetween(target, other, tile);
    if (res) {
      HUD.logTxt.textContent = `【連鎖衝突】${target.name} vs ${other.name} → ${res.winner === 'P' ? target.name : other.name} 勝`;
      if (res.winner === 'P') {
        // target 勝，移除 other
        const idx2 = State.npcList.findIndex(n => n === other);
        if (idx2 !== -1) {
          addEliminationLog(`${other.name} 在連鎖衝突中被淘汰`);
          State.npcList.splice(idx2, 1);
          updateHUD();
          checkVictory();
        }
      } else {
        // other 勝，移除 target
        if (target === player) {
          State.gameOver = true;
          addEliminationLog(`${player.name} 在連鎖衝突中被淘汰`);
          stopBgm();
        } else {
          const idx2 = State.npcList.findIndex(n => n === target);
          if (idx2 !== -1) {
            addEliminationLog(`${target.name} 在連鎖衝突中被淘汰`);
            State.npcList.splice(idx2, 1);
            updateHUD();
            checkVictory();
          }
        }
      }
    }
  }
}

// ── 環境階段結束（處理所有 Knocker 落點碰撞）────────────
export function finishEnvironmentPhase() {
  State.envActive = false;
  for (const k of State.knockers) {
    if (!k.intent) continue;
    const tx = k.intent.q, tr = k.intent.r;
    const targets = [];
    if (player.q === tx && player.r === tr) targets.push(player);
    const npcsAt = State.npcList.filter(n => n.q === tx && n.r === tr);
    for (const n of npcsAt) targets.push(n);

    for (const target of targets) {
      let dirQ = target.q - k.prevQ;
      let dirR = target.r - k.prevR;
      let forceKb = null;

      switch (k.skillActive) {
        case 'Defensive':   // 鐵甲反彈：反向彈飛
          dirQ = -dirQ; dirR = -dirR;
          break;
        case 'Aggressive':  // 突破衝撞：固定最大距離 3
        case 'Opportunist': // 連環追擊：固定最大距離 3
          forceKb = 3;
          break;
        case 'Gambler':     // 豪賭一擊：超大彈飛 4 格
          forceKb = 4;
          break;
        case 'Tactician': { // 精算打擊：選最優彈飛方向
          let bestDir = { q: dirQ, r: dirR }, bestScore = -Infinity;
          for (const [adq, adr] of NEIGH) {
            let s = 0;
            for (let step = 2; step <= 3; step++) {
              const lq = target.q + adq * step, lr = target.r + adr * step;
              if (!inBoard(lq, lr)) { s += 25; continue; }
              if (player.q === lq && player.r === lr) s += 18;
              if (State.npcList.some(n => n.q === lq && n.r === lr)) s += 20;
              const t2 = State.tiles.get(keyOf(lq, lr));
              if (t2 && t2.sign === -1) s += 8;
            }
            if (s > bestScore) { bestScore = s; bestDir = { q: adq, r: adr }; }
          }
          dirQ = bestDir.q; dirR = bestDir.r;
          break;
        }
      }
      performKnockbackOn(target, dirQ, dirR, forceKb);
    }
  }
  // 技能冷卻遞減
  for (const k of State.knockers) {
    k.skillActive = null;
    if (k.skillCooldown > 0) k.skillCooldown = Math.max(0, k.skillCooldown - 1);
  }
  updateHUD();
  checkEncounters();
}
