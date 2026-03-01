// ============================================================
// bgm.js — BGM 播放清單管理（開始遊戲才循環播放）
// ============================================================

import { State } from './state.js';

const PLAYLIST = [
  'sound/BGM/BGM.mp3',
  'sound/BGM/Heralds_of_the_Sundered_Crown.mp3',
  'sound/BGM/The_Grand_Strategist_s_Overture.mp3',
  'sound/BGM/The_Strategist_s_Gambit.mp3',
];

let bgmEl = null;
let bgmIndex = Math.floor(Math.random() * PLAYLIST.length);

function loadTrack(i) {
  if (!bgmEl || !PLAYLIST.length) return;
  bgmIndex = ((i % PLAYLIST.length) + PLAYLIST.length) % PLAYLIST.length;
  bgmEl.src = PLAYLIST[bgmIndex];
  try { bgmEl.load(); } catch (_e) {}
}

function pickNextIndex() {
  if (PLAYLIST.length <= 1) return 0;
  let next;
  do { next = Math.floor(Math.random() * PLAYLIST.length); } while (next === bgmIndex);
  return next;
}

export function initBgm() {
  bgmEl = document.getElementById('bgm');
  if (!bgmEl) return;

  bgmEl.loop = false;

  // 還原已儲存的音量
  const saved = localStorage.getItem('ppf_bgm_volume');
  const vol = (saved !== null && !Number.isNaN(Number(saved))) ? Number(saved) : 0.6;
  bgmEl.volume = vol;

  const volEl  = document.getElementById('bgmVolume');
  const volTxt = document.getElementById('bgmVolTxt');
  const muteBtn = document.getElementById('bgmMute');

  const refreshVolUI = (v) => {
    if (volEl)  volEl.value = String(Math.round(v * 100));
    if (volTxt) volTxt.textContent = Math.round(v * 100) + '%';
    if (muteBtn) muteBtn.textContent = v > 0 ? '靜音' : '還原';
  };

  refreshVolUI(bgmEl.volume);

  if (volEl) {
    volEl.addEventListener('input', (e) => {
      const v = Number(e.target.value) / 100;
      bgmEl.volume = v;
      localStorage.setItem('ppf_bgm_volume', String(v));
      refreshVolUI(v);
    });
  }

  if (muteBtn) {
    let prevVol = Math.max(0.1, bgmEl.volume);
    muteBtn.addEventListener('click', () => {
      if (bgmEl.volume > 0) {
        prevVol = bgmEl.volume;
        bgmEl.volume = 0;
        localStorage.setItem('ppf_bgm_volume', '0');
      } else {
        bgmEl.volume = prevVol;
        localStorage.setItem('ppf_bgm_volume', String(bgmEl.volume));
      }
      refreshVolUI(bgmEl.volume);
    });
  }

  bgmEl.addEventListener('ended', () => {
    if (!State.bgmAutoPlay) return;
    loadTrack(pickNextIndex());
    bgmEl.play().catch(() => {});
  });

  // 初始載入起始曲目（但不自動播放）
  loadTrack(bgmIndex);
}

export function tryPlayBgm() {
  if (!bgmEl) return;
  State.bgmAutoPlay = true;
  const p = bgmEl.play();
  if (p && typeof p.catch === 'function') {
    p.catch(() => {
      // 自動播放被瀏覽器阻擋 → 等待使用者點擊後再播
      const unlock = () => {
        bgmEl.play().catch(() => {});
        document.removeEventListener('click', unlock);
      };
      document.addEventListener('click', unlock);
    });
  }
}

export function stopBgm() {
  State.bgmAutoPlay = false;
  if (bgmEl) {
    try { bgmEl.pause(); } catch (_e) {}
  }
}
