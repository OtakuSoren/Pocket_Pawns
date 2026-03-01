// ============================================================
// board.js — 棋盤生成、圖片載入
// ============================================================

import { STATS, CHARS, CHAR_FILENAME_MAP, KNOCKER_PERSONA_STYLES } from './config.js';
import { State, CHAR_IMAGES, KNOCKER_IMAGES } from './state.js';
import { keyOf, inBoard } from './hex.js';

export function regenTiles() {
  State.tiles = new Map();
  for (let q = -State.R; q <= State.R; q++) {
    for (let r = -State.R; r <= State.R; r++) {
      if (!inBoard(q, r)) continue;
      const stat = STATS[(Math.random() * STATS.length) | 0];
      const sign = Math.random() < 0.5 ? 1 : -1;
      State.tiles.set(keyOf(q, r), { stat, sign });
    }
  }
}

export function randomTile(excludes = new Set()) {
  const keys = Array.from(State.tiles.keys()).filter(k => !excludes.has(k));
  return keys[(Math.random() * keys.length) | 0];
}

export function loadKnockerImages() {
  for (const persona of Object.keys(KNOCKER_PERSONA_STYLES)) {
    const img = new Image();
    img.onload = () => { KNOCKER_IMAGES.set(persona, img); };
    img.onerror = () => {};
    img.src = encodeURI(`image/Knockback/${persona}.png`);
  }
}

export function loadCharImages() {
  for (const c of CHARS) {
    const name = c.name;
    const eng = CHAR_FILENAME_MAP[name];
    const tryPath = eng ? `image/${eng}` : null;
    const fallbackPath = `image/${name}.png`;
    const img = new Image();
    let triedFallback = false;
    img.onload = () => { CHAR_IMAGES.set(name, img); };
    img.onerror = () => {
      if (!triedFallback) {
        triedFallback = true;
        img.onerror = () => {};
        img.src = encodeURI(fallbackPath);
      }
    };
    img.src = encodeURI(tryPath || fallbackPath);
  }
}
