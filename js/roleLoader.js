// ============================================================
// roleLoader.js — 從 db/Role.csv 動態載入角色資料
// ============================================================
import { CHARS } from './config.js';

/**
 * 讀取 db/Role.csv，解析後填入 CHARS 陣列。
 * 每個 char 物件格式：{ name, stats: {STR,AGL,VIT,DEX,LUK,INT}, portrait }
 * portrait 為檔名（如 rularala.png），實際路徑為 image/Role/<portrait>
 */
export async function loadRoles() {
  try {
    const resp = await fetch('db/Role.csv');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();

    // 移除 BOM、統一換行、分行
    const lines = text.replace(/^\uFEFF/, '').replace(/\r/g, '').trim().split('\n');
    if (lines.length < 2) throw new Error('Role.csv 內容不足');

    const headers = lines[0].split(',').map(h => h.trim());

    // 清空舊資料（保留陣列參考）
    CHARS.splice(0);

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const vals  = line.split(',');
      const row   = {};
      headers.forEach((h, idx) => { row[h] = (vals[idx] ?? '').trim(); });

      CHARS.push({
        name:    row.name,
        portrait: row.portrait || '',
        stats: {
          STR: +row.STR || 0,
          AGL: +row.AGL || 0,
          VIT: +row.VIT || 0,
          DEX: +row.DEX || 0,
          LUK: +row.LUK || 0,
          INT: +row.INT || 0,
        },
      });
    }
    console.log(`[roleLoader] 已載入 ${CHARS.length} 個角色`);
  } catch (err) {
    console.error('[roleLoader] 載入失敗，使用內建預設：', err);
    // fallback：只有在 CHARS 仍為空時才插入預設
    if (CHARS.length === 0) {
      CHARS.push(
        { name: '魯拉拉', portrait: 'rularala.png',   stats: { STR:13, AGL:7,  VIT:9,  DEX:1,  LUK:3,  INT:9  } },
        { name: '烈火拳', portrait: 'liehuoquan.png', stats: { STR:16, AGL:4,  VIT:10, DEX:2,  LUK:1,  INT:3  } },
        { name: '影迅',   portrait: 'yingxun.png',    stats: { STR:5,  AGL:17, VIT:6,  DEX:12, LUK:8,  INT:4  } },
        { name: '智將',   portrait: 'zhijiang.png',   stats: { STR:4,  AGL:6,  VIT:8,  DEX:7,  LUK:5,  INT:18 } },
        { name: '混沌',   portrait: 'hundun.png',     stats: { STR:8,  AGL:8,  VIT:8,  DEX:8,  LUK:8,  INT:8  } },
      );
    }
  }
}
