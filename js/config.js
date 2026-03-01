// ============================================================
// config.js — 靜態常數與資料表（無外部依賴）
// ============================================================

export const STATS = ["STR","AGL","VIT","DEX","LUK","INT"];

export const CHARS = [
  { name: '魯拉拉', stats: { STR:13, AGL:7,  VIT:9,  DEX:1,  LUK:3,  INT:9  } },
  { name: '烈火拳', stats: { STR:16, AGL:4,  VIT:10, DEX:2,  LUK:1,  INT:3  } },
  { name: '影迅',   stats: { STR:5,  AGL:17, VIT:6,  DEX:12, LUK:8,  INT:4  } },
  { name: '智將',   stats: { STR:4,  AGL:6,  VIT:8,  DEX:7,  LUK:5,  INT:18 } },
  { name: '混沌',   stats: { STR:8,  AGL:8,  VIT:8,  DEX:8,  LUK:8,  INT:8  } },
];

export const CHAR_FILENAME_MAP = {
  '魯拉拉': 'rularala.png',
  '烈火拳': 'liehuoquan.png',
  '影迅':   'yingxun.png',
  '智將':   'zhijiang.png',
  '混沌':   'hundun.png',
};

export const PROJECT_IMAGES = [
  "image/background/ChatGPT Image 2026年2月28日 下午05_11_02.png",
];

export const DIFFICULTY_PRESETS = { low: 0.25, medium: 0.6, high: 0.95 };

export const KNOCKER_PERSONA_STYLES = {
  'Aggressive': {
    color: '#ff7b7b', label: 'AGG',
    title: '勇猛型',
    desc:  '優先追擊最近單位，候選可立即撞擊的路徑，偏好高密度區域。',
    skill: '突破衝撞 ― 進攻 CD3，觸發後很飛距離強制 3 格',
  },
  'Defensive':  {
    color: '#7bffb3', label: 'DEF',
    title: '謹慎型',
    desc:  '優先選擇撞完後安全的落點，避免縮圈邊緣，遠離高風險區。',
    skill: '鐵甲反彈 ― 進攻 CD4，觸發後將目標往反方向彈飛',
  },
  'Opportunist':{
    color: '#ffd27b', label: 'OPP',
    title: '機會主義型',
    desc:  '優先錦上添花攻擊 VIT 最低的目標，偏好把人撞向縮圈邊緣製造二次衝突。',
    skill: '連環追擊 ― 進攻 CD3，觸發後很飛距離強制 3 格',
  },
  'Random':     {
    color: '#b3c7ff', label: 'RND',
    title: '隨性型',
    desc:  '方向與目標全部隨機，不可預測，但不會自跟出界。',
    skill: '狂亂衝刺 ― 進攻 CD2，觸發後往隨機方向衝 2 格',
  },
  'Gambler':    {
    color: '#d89bff', label: 'GMB',
    title: '賭徒型',
    desc:  '偏好負屬性格，高隨機權重，偵向把目標撞向負屬性格。',
    skill: '豪賭一擊 ― 進攻 CD4，觸發後很飛距離超大 4 格',
  },
  'Tactician':  {
    color: '#7be0ff', label: 'TAC',
    title: '智將型',
    desc:  '評估撞擊後可能的連鎖效果，優先把人撞向對方弱屬性格、多人聚集區、縮圈邊緣。',
    skill: '精算打擊 ― 進攻 CD3，觸發後自動選最優很飛方向',
  },
};

// 參戰 NPC 人格（相同類型，顏色偏柔以區分干擾單位）
export const NPC_PERSONA_STYLES = {
  'Aggressive': { color: '#ffaaaa', label: '勇' },
  'Defensive':  { color: '#aaffcc', label: '守' },
  'Opportunist':{ color: '#ffe9aa', label: '機' },
  'Random':     { color: '#ccd9ff', label: '亂' },
  'Gambler':    { color: '#e9bbff', label: '賭' },
  'Tactician':  { color: '#aaf0ff', label: '謀' },
};
