// ============================================================
// hex.js — 六角形棋盤座標數學（純計算，無副作用）
// ============================================================

import { State } from './state.js';

export const keyOf = (q, r) => `${q},${r}`;

export function axialToPixel(q, r) {
  const H = State.HEX;
  return {
    x: H * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r),
    y: H * (3 / 2 * r),
  };
}

export function pixelToAxial(px, py) {
  const H = State.HEX;
  const q = (Math.sqrt(3) / 3 * px - 1 / 3 * py) / H;
  const r = (2 / 3 * py) / H;
  return hexRound(q, r);
}

export function hexRound(q, r) {
  let x = q, z = r, y = -x - z;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const xd = Math.abs(rx - x), yd = Math.abs(ry - y), zd = Math.abs(rz - z);
  if (xd > yd && xd > zd) rx = -ry - rz;
  else if (yd > zd) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
}

export function dist(aq, ar, bq, br) {
  const dq = aq - bq, dr = ar - br;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

export function inBoard(q, r) {
  return dist(0, 0, q, r) <= State.R;
}
