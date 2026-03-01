// ============================================================
// ui.js — HUD 元素、角色選單、設定管理
// ============================================================

import { CHARS, DIFFICULTY_PRESETS } from './config.js';
import { State, player, npc, setCharButtons } from './state.js';
import { keyOf } from './hex.js';

// ── HUD DOM 物件 ─────────────────────────────────────────
export const HUD = {
  posTxt: null, npcPosTxt: null, tileTxt: null, ruleTxt: null,
  statsTxt: null, npcStatsTxt: null, logTxt: null, winTxt: null,
  stateTxt: null, elimTxt: null,
};

export function initHUD() {
  HUD.posTxt     = document.getElementById('posTxt');
  HUD.npcPosTxt  = document.getElementById('npcPosTxt');
  HUD.tileTxt    = document.getElementById('tileTxt');
  HUD.ruleTxt    = document.getElementById('ruleTxt');
  HUD.statsTxt   = document.getElementById('statsTxt');
  HUD.npcStatsTxt= document.getElementById('npcStatsTxt');
  HUD.logTxt     = document.getElementById('logTxt');
  HUD.winTxt     = document.getElementById('winTxt');
  HUD.stateTxt   = document.getElementById('stateTxt');
}

export function fmtStats(stats) {
  return `STR ${stats.STR}　AGL ${stats.AGL}　VIT ${stats.VIT}\nDEX ${stats.DEX}　LUK ${stats.LUK}　INT ${stats.INT}`;
}

export function updateHUD() {
  if (!HUD.posTxt) return;
  HUD.posTxt.textContent    = `(${player.q}, ${player.r})`;
  HUD.npcPosTxt.textContent = State.npcList.length ? `多名 NPC` : `(${npc.q}, ${npc.r})`;
  HUD.winTxt.textContent    = String(State.wins);
  HUD.stateTxt.innerHTML    = State.gameOver
    ? `<span class="ng">Game Over</span>`
    : `<span class="ok">進行中</span>`;

  const waitEl = document.getElementById('waitCdTxt');
  if (waitEl) waitEl.textContent = String(player.waitCooldown || 0);

  const t = State.tiles.get(keyOf(player.q, player.r));
  if (t) {
    const signTxt = t.sign === 1 ? "+" : "−";
    HUD.tileTxt.innerHTML = `<span class="tag ${t.sign===1?"good":"bad"}">${t.stat} ${signTxt}</span>`;
    HUD.ruleTxt.textContent = t.sign === 1 ? "正格：比大" : "負格：比小";
  } else {
    HUD.tileTxt.textContent = "-";
    HUD.ruleTxt.textContent = "-";
  }

  HUD.statsTxt.textContent = fmtStats(player.stats);
  if (State.npcList.length) {
    HUD.npcStatsTxt.textContent = State.npcList.map(n => {
      const cd = (n.stayCooldown && n.stayCooldown > 0) ? ` (CD:${n.stayCooldown})` : '';
      return `${n.name}: ${n.stats.STR}/${n.stats.AGL}/${n.stats.VIT}/${n.stats.DEX}/${n.stats.LUK}/${n.stats.INT}${cd}`;
    }).join('\n');
  } else {
    HUD.npcStatsTxt.textContent = fmtStats(npc.stats);
  }
}

export function buildCharButtons() {
  const wrap = document.getElementById('charBtns');
  wrap.innerHTML = '';
  const btns = [];
  for (const c of CHARS) {
    const b = document.createElement('button');
    b.textContent = c.name;
    b.addEventListener('click', () => {
      if (State.inGame) return;
      State.selectedChar = c.name;
      player.name = c.name;
      player.stats = Object.assign({}, c.stats);
      updateHUD();
    });
    wrap.appendChild(b);
    btns.push(b);
  }
  setCharButtons(btns);
}

// ── 設定 ─────────────────────────────────────────────────

export function setNpcRiskChance(v) {
  State.npcRiskChance = Number(v);
  const pct = Math.round(State.npcRiskChance * 100);
  const pctEl = document.getElementById('riskPct'); if (pctEl) pctEl.textContent = pct + '%';
  const inEl  = document.getElementById('riskInput'); if (inEl) inEl.value = String(pct);
}

export function applyDifficulty(key) {
  if (DIFFICULTY_PRESETS[key] !== undefined) {
    setNpcRiskChance(DIFFICULTY_PRESETS[key]);
    const sel = document.getElementById('difficultySelect');
    if (sel) sel.value = key;
  }
}

export function saveSettings() {
  const sel = document.getElementById('difficultySelect');
  const data = {
    npcRiskChance: State.npcRiskChance,
    npcAggroChance: State.npcAggroChance,
    difficulty: sel ? sel.value : 'custom',
  };
  try {
    localStorage.setItem('ppf_settings', JSON.stringify(data));
    if (HUD.logTxt) HUD.logTxt.textContent = '設定已儲存';
  } catch (e) { console.warn(e); }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem('ppf_settings');
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s && s.npcRiskChance != null) setNpcRiskChance(Number(s.npcRiskChance));
    if (s && s.npcAggroChance != null) {
      State.npcAggroChance = Number(s.npcAggroChance);
      const ap = document.getElementById('aggroPct'); if (ap) ap.textContent = Math.round(State.npcAggroChance*100) + '%';
      const ai = document.getElementById('aggroInput'); if (ai) ai.value = String(Math.round(State.npcAggroChance*100));
    }
    if (s && s.difficulty) {
      const sel = document.getElementById('difficultySelect');
      if (sel) sel.value = s.difficulty;
    }
  } catch (e) { console.warn(e); }
}

export function resetDefaults() { applyDifficulty('medium'); saveSettings(); }
