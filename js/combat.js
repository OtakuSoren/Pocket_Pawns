// ============================================================
// combat.js — 戰鬥判定、淘汰紀錄、勝利檢查、遭遇處理
// ============================================================

import { State, player } from './state.js';
import { keyOf } from './hex.js';
import { HUD, updateHUD, showEndModal, queueBattleAnim } from './ui.js';
import { stopBgm } from './bgm.js';

// ── LUK 平手擲骰 ─────────────────────────────────────────
export function lukTieBreak(aLuk, bLuk) {
  const aRoll = 1 + ((Math.random() * 20) | 0) + aLuk;
  const bRoll = 1 + ((Math.random() * 20) | 0) + bLuk;
  return {
    aRoll, bRoll,
    winner: aRoll === bRoll
      ? (Math.random() < 0.5 ? "A" : "B")
      : (aRoll > bRoll ? "A" : "B"),
  };
}

// ── 基礎戰鬥判定（比大/比小 + 平手 LUK 骰）───────────────
export function resolveBattle(tile, p, e) {
  const { stat, sign } = tile;
  const pv = p.stats[stat];
  const ev = e.stats[stat];
  let winner, reason;

  if (pv === ev) {
    const tb = lukTieBreak(p.stats.LUK, e.stats.LUK);
    winner = tb.winner === "A" ? "P" : "E";
    reason = `平手 → LUK 擲骰\n玩家：d20+LUK = ${tb.aRoll}\nNPC：d20+LUK = ${tb.bRoll}`;
  } else {
    winner = (sign === 1) ? (pv > ev ? "P" : "E") : (pv < ev ? "P" : "E");
    reason = sign === 1 ? "正格：比大" : "負格：比小";
  }
  return { stat, sign, pv, ev, winner, reason };
}

// ── 任意兩單位之間的戰鬥（player 或 NPC vs NPC）──────────
export function resolveBetween(a, b, tile) {
  if (!tile) tile = State.tiles.get(keyOf(a.q, a.r)) || State.tiles.get(keyOf(b.q, b.r));
  if (!tile) return null;

  if (a === player) {
    return resolveBattle(tile, player, b);
  }
  if (b === player) {
    const res = resolveBattle(tile, player, a);
    // 翻轉角色順序（原為 player=first，現 a 是敵方）
    if (res.winner === 'P') res.winner = 'B'; else res.winner = 'A';
    return res;
  }
  // NPC vs NPC：以 a 當作「攻擊方」
  return resolveBattle(tile, { name: a.name, stats: a.stats }, { name: b.name, stats: b.stats });
}

// ── 淘汰紀錄 ─────────────────────────────────────────────
export function addEliminationLog(msg) {
  try {
    const el = HUD.elimTxt;
    if (!el) return;
    const ts = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.textContent = `[${ts}] ${msg}`;
    el.insertBefore(entry, el.firstChild);
    while (el.children.length > 50) el.removeChild(el.lastChild);
  } catch (e) { console.warn(e); }
}

// ── 勝利檢查（所有 Combatant NPC 被清除）────────────────
export function checkVictory() {
  if (State.npcList.length === 0) {
    State.overallWin = true;
    State.gameOver = true;
    try { HUD.logTxt.textContent += "\n\n你已擊敗所有 Combatant NPC，勝利！"; } catch (_e) {}
    stopBgm();
    try { showEndModal('勝利！', `你已擊敗所有 Combatant NPC，勝利！\n\n${HUD.logTxt.textContent || ''}`); } catch (e) { /* ignore */ }
  }
}

// ── 遭遇判定（玩家踏上 NPC 同格）────────────────────────
export function checkEncounters() {
  const { npcList } = State;
  const idx = npcList.findIndex(n => n.q === player.q && n.r === player.r);
  if (idx === -1) return;

  const target = npcList[idx];
  const tile = State.tiles.get(keyOf(player.q, player.r));
  if (!tile) return;

  const res = resolveBattle(tile, player, target);
  const signTxt   = tile.sign === 1 ? "+" : "−";
  const header    = `【遭遇戰】格子：${res.stat} ${signTxt}（${tile.sign===1?"比大":"比小"}）`;
  const line      = `玩家 ${player.name}：${res.pv}   vs   NPC ${target.name}：${res.ev}`;
  const outcome   = res.winner === "P" ? "玩家勝利 ✅" : "玩家落敗 ❌";

  // 先播放 VS 碰撞動畫，動畫結束後顯示勝負並處理狀態
  (async () => {
    await queueBattleAnim(
      player.name, target.name,
      { stat: res.stat, sign: tile.sign }, true,
      { winner: res.winner === 'P' ? 'A' : 'B', pv: res.pv, ev: res.ev }
    );
    HUD.logTxt.textContent = `${header}\n${line}\n${outcome}\n\n${res.reason}`;

    if (res.winner === "P") {
      State.wins += 1;
      const removed = npcList.splice(idx, 1);
      addEliminationLog(`${removed[0].name} 被玩家 ${player.name} 擊敗，淘汰`);
      updateHUD();
      if (npcList.length === 0) {
        State.overallWin = true;
        State.gameOver = true;
        HUD.logTxt.textContent += "\n\n你已擊敗所有 NPC，勝利！";
        stopBgm();
        try { showEndModal('勝利！', `你已擊敗所有 NPC，勝利！\n\n${HUD.logTxt.textContent || ''}`); } catch (e) {}
      }
    } else {
      State.gameOver = true;
      addEliminationLog(`${player.name} 被 NPC ${target.name} 擊敗，淘汰`);
      updateHUD();
      stopBgm();
      try { showEndModal('敗北', `你被 NPC ${target.name} 擊敗，遊戲結束。\n\n${HUD.logTxt.textContent || ''}`); } catch (e) {}
    }
  })();
}
