// ============================================================
// state.js — 共享可變狀態（所有模組的唯一真實來源）
// ============================================================

// ── 玩家物件 ─────────────────────────────────────────────
export const player = {
  name: '',
  stats: { STR:8, AGL:8, VIT:8, DEX:8, LUK:8, INT:8 },
  q: 0, r: 0,
  x: 0, y: 0, tx: 0, ty: 0,
  moving: false,
  waiting: false,
  waitCooldown: 0,
  _waitSkip: false,
  rushCooldown: 0,
  _rushSkip: false,
  rushPending: false,
  aggressiveCooldown: 0, _aggressiveSkip: false,
  defensiveCooldown: 0,  _defensiveSkip: false,
  opportunistCooldown: 0, _opportunistSkip: false,
  randomCooldown: 0,     _randomSkip: false,
  gamblerCooldown: 0,    _gamblerSkip: false,
  tacticianCooldown: 0,  _tacticianSkip: false,
  pendingSkill: null,
  counterKnockback: false,
  intent: null,
};

// ── 相容舊版單一 NPC 物件（HUD 用） ──────────────────────
export const npc = {
  name: "紅衣對手",
  stats: { STR:8, AGL:8, VIT:8, DEX:8, LUK:8, INT:8 },
  q: 1, r: 0,
  x: 0, y: 0, tx: 0, ty: 0,
  intent: null,
  moving: false,
};

// ── 相機 ─────────────────────────────────────────────────
export const cam = { x: 0, y: 0, zoom: 1 };

// ── 角色圖片快取 ─────────────────────────────────────────
export const CHAR_IMAGES = new Map();

// ── Knocker 人格圖片快取 ──────────────────────────────────
export const KNOCKER_IMAGES = new Map();

// ── 角色選單按鈕陣列 ─────────────────────────────────────
let _charButtons = [];
export function getCharButtons() { return _charButtons; }
export function setCharButtons(arr) { _charButtons = arr; }

// ── 主要可變狀態（單例物件）──────────────────────────────
export const State = {
  // 棋盤
  R: 6,
  HEX: 48,
  tiles: new Map(),
  hoverKey: null,

  // 遊戲流程
  wins: 0,
  gameOver: false,
  overallWin: false,
  inGame: false,
  turnActive: false,
  envActive: false,

  // 角色選擇（loadRoles 後由 init() 填入）
  selectedChar: '',
  selectedNpcs: [],   // 預選 NPC 名稱陣列（最多 39 名；空陣列代表全隨機）

  // NPC
  npcList: [],
  knockers: [],
  knockersEnabled: true,
  knockersCount: 6,

  // AI 參數
  npcRiskChance: 0.75,
  npcAggroChance: 0.08,
  npcStayChance: 0.18,

  // Knocker 行為設定：是否碰到邊界即淘汰（true）或改為回彈（false）
  knockersEliminateOnOut: false,

  // 背景
  boardBgMode: 'none',
  boardBgImage: null,
  boardBgFollowCam: true,
  boardBgParallax: 0.9,
  bgImageBaseScale: null,

  // 外觀
  textReadMode: 'stroke',

  // BGM
  bgmAutoPlay: false,

  // 戰鬥動畫
  battleAnimPlayer: true,   // 玩家參戰時顯示動畫
  battleAnimNpc: false,     // NPC 對 NPC 時顯示動畫
  battleLocked: false,      // 動畫播放期間鎖定玩家輸入
};
