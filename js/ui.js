// ============================================================
// ui.js — HUD 元素、角色選單、設定管理
// ============================================================

import { CHARS, DIFFICULTY_PRESETS } from './config.js';
import { State, player, npc, setCharButtons, CHAR_IMAGES, KNOCKER_IMAGES } from './state.js';
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

// ── 選角分頁常數 ─────────────────────────────────────────
const CHAR_PAGE_SIZE = 10;   // 每頁最多幾張卡
let _charPage = 0;           // 目前頁碼（0-based）

// ── 開始選單 / 人物選單 Overlay （建立於 body）────────
let startOverlay = null;
let charOverlay = null;

export function initMenus() {
  if (startOverlay) return;
  // start overlay
  startOverlay = document.createElement('div');
  startOverlay.id = 'startOverlay';
  startOverlay.className = 'overlay';
  startOverlay.innerHTML = `
    <div class="menu">
      <h1>口袋棋兵</h1>
      <div class="desc">Demo A-1</div>
      <div class="btns">
        <button id="start_to_char">選擇角色</button>
        <button id="start_direct">直接開始</button>
      </div>
    </div>`;
  document.body.appendChild(startOverlay);

  // char overlay
  charOverlay = document.createElement('div');
  charOverlay.id = 'charOverlay'; charOverlay.className = 'overlay';
  charOverlay.innerHTML = `
    <div class="menu char-select-menu">
      <h2>選擇角色</h2>
      <div id="charGrid" class="char-grid"></div>
      <div class="char-pager">
        <button id="charPrev">&#9664;</button>
        <span id="charPageInfo">1 / 1</span>
        <button id="charNext">&#9654;</button>
      </div>
      <div class="btns">
        <button id="charBack">返回</button>
        <button id="charConfirm">開始遊戲</button>
      </div>
    </div>`;
  document.body.appendChild(charOverlay);

  // ── 輔助：產生單張卡片 HTML ───────────────────────────
  function _cardStatsHTML(stats) {
    return ['STR','AGL','VIT','INT','DEX','LUK'].map(k =>
      `<div class="cc-sv"><span class="cv">${stats[k]}</span><span class="cl">${k}</span></div>`
    ).join('');
  }

  // ── 輔助：渲染指定頁 ─────────────────────────────────
  function _renderCharPage(page) {
    const grid = charOverlay.querySelector('#charGrid');
    const info = charOverlay.querySelector('#charPageInfo');
    const totalPages = Math.max(1, Math.ceil(CHARS.length / CHAR_PAGE_SIZE));
    _charPage = Math.max(0, Math.min(page, totalPages - 1));

    const slice = CHARS.slice(_charPage * CHAR_PAGE_SIZE, (_charPage + 1) * CHAR_PAGE_SIZE);

    grid.innerHTML = '';
    for (const c of slice) {
      const card = document.createElement('div');
      card.className = 'char-card';
      card.dataset.name = c.name;
      if (c.name === State.selectedChar) card.classList.add('selected');
      const psrc = c.portrait ? encodeURI(`image/Role/${c.portrait}`) : '';
      card.innerHTML = `
        <div class="cc-frame-corner tl"></div>
        <div class="cc-frame-corner tr"></div>
        <div class="cc-frame-corner bl"></div>
        <div class="cc-frame-corner br"></div>
        <div class="cc-portrait">${psrc ? `<img src="${psrc}" alt="${c.name}">` : '<span class="cc-portrait-ph">👤</span>'}</div>
        <div class="cc-stats-row">${_cardStatsHTML(c.stats)}</div>
        <div class="cc-nameplate"><span>${c.name}</span></div>`;
      card.addEventListener('click', () => {
        for (const el of grid.querySelectorAll('.char-card')) el.classList.remove('selected');
        card.classList.add('selected');
        State.selectedChar = c.name;
        player.name = c.name; player.stats = Object.assign({}, c.stats);
        updateHUD();
      });
      grid.appendChild(card);
    }

    if (info) info.textContent = `${_charPage + 1} / ${totalPages}`;
    charOverlay.querySelector('#charPrev').disabled = _charPage === 0;
    charOverlay.querySelector('#charNext').disabled = _charPage >= totalPages - 1;
  }

  _renderCharPage(0);

  charOverlay.querySelector('#charPrev').addEventListener('click', () => _renderCharPage(_charPage - 1));
  charOverlay.querySelector('#charNext').addEventListener('click', () => _renderCharPage(_charPage + 1));

  // buttons
  document.getElementById('start_to_char').addEventListener('click', () => showCharSelect());
  document.getElementById('start_direct').addEventListener('click', () => {
    // 如果已選角就直接發出啟動請求，否則打開選角
    if (State.selectedChar) document.dispatchEvent(new CustomEvent('ui:startRequested'));
    else showCharSelect();
  });
  document.getElementById('charBack').addEventListener('click', () => showStartMenu());
  document.getElementById('charConfirm').addEventListener('click', () => {
    if (!State.selectedChar) { alert('請先選擇角色'); return; }
    document.dispatchEvent(new CustomEvent('ui:startRequested'));
  });

  // 初始顯示設定
  hideMenus();

  // 結束對話框
  const endOverlay = document.createElement('div');
  endOverlay.id = 'endOverlay'; endOverlay.className = 'overlay';
  endOverlay.innerHTML = `
    <div class="menu end-menu">
      <h2 id="endTitle">比賽結束</h2>
      <div id="endMsg" style="white-space:pre-wrap; margin:10px 0; color:#dfe8f3"></div>
      <div style="display:flex; gap:8px; justify-content:center; margin-top:12px;">
        <button id="endConfirm">確定</button>
      </div>
    </div>`;
  document.body.appendChild(endOverlay);
  endOverlay.style.display = 'none';

  document.getElementById('endConfirm').addEventListener('click', () => {
    hideEndModal();
    // 觸發一個事件讓外層流程回到開始選單（game.js 監聽）
    document.dispatchEvent(new CustomEvent('ui:endConfirmed'));
  });
}

export function showStartMenu() { if (!startOverlay) initMenus(); startOverlay.style.display = 'flex'; if (charOverlay) charOverlay.style.display = 'none'; }
export function showCharSelect() { if (!charOverlay) initMenus(); charOverlay.style.display = 'flex'; if (startOverlay) startOverlay.style.display = 'none'; }
export function hideMenus() { if (startOverlay) startOverlay.style.display = 'none'; if (charOverlay) charOverlay.style.display = 'none'; }

export function showEndModal(title, msg) {
  if (!document.getElementById('endOverlay')) initMenus();
  const ov = document.getElementById('endOverlay');
  const t = document.getElementById('endTitle');
  const m = document.getElementById('endMsg');
  if (t) t.textContent = title || '比賽結束';
  if (m) m.textContent = msg || '';
  if (ov) ov.style.display = 'flex';
}

export function hideEndModal() { const ov = document.getElementById('endOverlay'); if (ov) ov.style.display = 'none'; }

// ── 戰鬥動畫佇列 ─────────────────────────────────────────
const _animQueue = [];
let _animRunning = false;
let _flushDoneCallbacks = [];  // 佇列全部清空後的回呼

async function _flushAnimQueue() {
  if (_animRunning) return;
  _animRunning = true;
  State.battleLocked = true;
  while (_animQueue.length > 0) {
    const task = _animQueue.shift();
    await task();
  }
  State.battleLocked = false;
  _animRunning = false;
  // 通知所有等待佇列空的呼叫者
  const cbs = _flushDoneCallbacks.splice(0);
  for (const cb of cbs) cb();
}

/** 回傳一個 Promise，從佇列全部播完時 resolve（若目前空閒則立即 resolve）*/
export function waitAnimQueueEmpty() {
  if (!_animRunning && _animQueue.length === 0) return Promise.resolve();
  return new Promise(resolve => _flushDoneCallbacks.push(resolve));
}

function _portraitHTML(name) {
  const img = CHAR_IMAGES.get(name);
  if (img && img.complete && img.naturalWidth > 0) {
    return `<img src="${img.src}" alt="${name}" draggable="false">`;
  }
  return `<div class="battle-portrait-placeholder">👤</div>`;
}

function _knockerPortraitHTML(persona) {
  const img = KNOCKER_IMAGES.get(persona);
  if (img && img.complete && img.naturalWidth > 0) {
    return `<img src="${img.src}" alt="${persona}" draggable="false">`;
  }
  return `<div class="battle-portrait-placeholder">⚡</div>`;
}

// ensureOverlay — 取得或建立 battleOverlay DOM
function _ensureOverlay() {
  let ov = document.getElementById('battleOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'battleOverlay';
    ov.className = 'overlay';
    document.body.appendChild(ov);
  }
  return ov;
}

function _doAnim(aName, bName, statInfo, isPlayerBattle, resultInfo = null) {
  return new Promise(resolve => {
    const enabled = isPlayerBattle ? State.battleAnimPlayer : State.battleAnimNpc;
    if (!enabled) { resolve(); return; }

    const ov = _ensureOverlay();

    const statLabel = statInfo
      ? `格子屬性：${statInfo.stat} ${statInfo.sign === 1 ? '+（比大）' : '−（比小）'}`
      : '';

    const renderVS = () => {
      ov.innerHTML = `
        <div class="battle-box">
          <div class="battle-title">⚔ 比拚開始</div>
          ${statLabel ? `<div class="battle-stat">${statLabel}</div>` : ''}
          <div class="battle-arena">
            <div class="battle-side battle-side-a">
              <div class="battle-portrait-wrap">${_portraitHTML(aName)}</div>
              <div class="battle-char-name">${aName}</div>
            </div>
            <div class="battle-center">
              <div class="battle-spark">✦</div>
              <div class="battle-vs">VS</div>
            </div>
            <div class="battle-side battle-side-b">
              <div class="battle-portrait-wrap">${_portraitHTML(bName)}</div>
              <div class="battle-char-name">${bName}</div>
            </div>
          </div>
          <button id="battleSkipBtn" class="battle-skip-btn">▶▶ 跳過</button>
        </div>`;
      ov.style.display = 'flex';
      // clearTimeout 互斥：點跳過或計時器其中一個觸發，另一個即被取消
      let vsTimer = null;
      const onceShowResult = () => { clearTimeout(vsTimer); vsTimer = null; showResult(); };
      document.getElementById('battleSkipBtn')
        .addEventListener('click', onceShowResult, { once: true });
      vsTimer = setTimeout(onceShowResult, 3500);
    };

    const showResult = () => {
      if (!resultInfo) { ov.style.display = 'none'; resolve(); return; }
      const winnerName = resultInfo.winner === 'A' ? aName : bName;
      const loserName  = resultInfo.winner === 'A' ? bName : aName;
      const box = ov.querySelector('.battle-box');
      if (!box) { ov.style.display = 'none'; resolve(); return; }
      box.innerHTML = `
        <div class="battle-title">🏆 ${winnerName} 獲勝！</div>
        ${statLabel ? `<div class="battle-stat">${statLabel}</div>` : ''}
        <div class="br-row">
          <div class="br-winner-side">
            <div class="battle-portrait-wrap br-win">${_portraitHTML(winnerName)}</div>
            <div class="br-winner-label">🏆 ${winnerName}</div>
          </div>
          <div class="br-vs-col"><span class="br-vs-text">勝</span></div>
          <div class="br-loser-side">
            <div class="battle-portrait-wrap br-lose">${_portraitHTML(loserName)}</div>
            <div class="battle-char-name">✕ ${loserName}</div>
          </div>
        </div>
        <div class="br-values">${aName}&nbsp;${resultInfo.pv}&nbsp;:
          &nbsp;${resultInfo.ev}&nbsp;${bName}</div>
        <button id="battleSkipBtn" class="battle-skip-btn">確認</button>`;
      let resTimer = null;
      const onceDone = () => { clearTimeout(resTimer); resTimer = null; ov.style.display = 'none'; resolve(); };
      document.getElementById('battleSkipBtn')
        .addEventListener('click', onceDone, { once: true });
      resTimer = setTimeout(onceDone, 2300);
    };

    renderVS();
  });
}

/** Knocker 擊飛淨出界動畫 */
function _doKnockoutAnim(knockerPersona, knockerDisplayName, targetName) {
  return new Promise(resolve => {
    const ov = _ensureOverlay();
    ov.innerHTML = `
      <div class="battle-box">
        <div class="battle-title">💥 撑出界淘汰</div>
        <div class="battle-stat">${knockerDisplayName} 將 ${targetName} 擊出界外！</div>
        <div class="ko-arena">
          <div class="ko-attacker">
            <div class="battle-portrait-wrap">${_knockerPortraitHTML(knockerPersona)}</div>
            <div class="battle-char-name">${knockerDisplayName}</div>
          </div>
          <div class="ko-mid">➡</div>
          <div class="ko-victim">
            <div class="battle-portrait-wrap">${_portraitHTML(targetName)}</div>
            <div class="battle-char-name">${targetName}</div>
          </div>
        </div>
        <button id="battleSkipBtn" class="battle-skip-btn">▶▶ 跳過</button>
      </div>`;
    ov.style.display = 'flex';
    let koTimer = null;
    const onceDoneKo = () => { clearTimeout(koTimer); koTimer = null; ov.style.display = 'none'; resolve(); };
    document.getElementById('battleSkipBtn')
      .addEventListener('click', onceDoneKo, { once: true });
    koTimer = setTimeout(onceDoneKo, 3200);
  });
}

/** 將一組戰鬥動畫加入佇列，依序播放、播完自動繼續 */
export function queueBattleAnim(aName, bName, statInfo, isPlayerBattle = true, resultInfo = null) {
  return new Promise(resolve => {
    _animQueue.push(() => _doAnim(aName, bName, statInfo, isPlayerBattle, resultInfo).then(resolve));
    _flushAnimQueue();
  });
}

/** Knocker 擊飛淨出界動畫（加入同一佇列）*/
export function queueKnockoutAnim(knockerPersona, knockerDisplayName, targetName) {
  return new Promise(resolve => {
    _animQueue.push(() => _doKnockoutAnim(knockerPersona, knockerDisplayName, targetName).then(resolve));
    _flushAnimQueue();
  });
}
