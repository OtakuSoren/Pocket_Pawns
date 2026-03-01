# 《口袋棋兵 Pocket Chess Fighters》
## Interference Knockback NPC 擴充 SDD v1.0

---

# 1. 目的

本文件為《口袋棋兵》現有基礎遊戲完成後的功能擴充說明。

✅ **重要：本擴充不是修改既有「參戰 NPC（參賽者）」的 AI 行為**。

本擴充要新增一種「第三方單位類型」：

> **干擾型撞棋 NPC（Interference Knockback Units）**

因此遊戲中的單位分類會變成：

1. **玩家（Player）**：你操控的角色
2. **參戰 NPC（Combatant NPC）**：原本就會參與比屬性、淘汰、排名的 NPC（參賽者）
3. **干擾單位：撞棋 NPC（Interference Knockback NPC）**：新增的干擾者，只負責撞人彈飛、製造混亂

干擾型撞棋 NPC 的目標為：
- 打亂站位
- 製造混戰
- 加速戰局收斂
- 增加不可預測性

本系統不改動既有回合制核心規則與參戰 NPC 的既有 AI，只在 Environment 階段額外插入一批「干擾單位」行動。

---

# 2. 系統整合位置

撞棋 NPC 於：

TurnController 四階段中的

3️⃣ Environment 階段執行

流程順序：

1. 玩家與一般 NPC 完成移動
2. 進入 Environment
3. 撞棋 NPC 決策並移動
4. 若發生撞擊 → 執行 Knockback
5. 若產生連鎖衝突 → 立即結算
6. 結束後進入 Resolution

---

# 3. 新增單位類型定義（避免誤改既有參戰 NPC）

## 3.1 Combatant NPC（既有：參戰 NPC／參賽者）

- 會參與比屬性（正格比大、負格比小）
- 會被淘汰、計入排名
- 使用你原本已完成的 NPC 行為系統（不在此文件更動）

## 3.2 Interference Knockback NPC（新增：干擾撞棋 NPC）

- **不等同於參戰 NPC**，是另一套單位類型
- 不參與比屬性勝負（除非你刻意設計，預設不參戰）
- 核心功能是：**撞到人 → 讓對方隨機彈飛 2 或 3 格**
- 行動階段固定在 TurnController 的 **Environment** 階段

---

# 4. 撞棋 NPC 基本規格

## 3.1 數量

- 建議初期：3~5
- 可隨縮圈階段增加

## 3.2 行動特性

- 每回合移動 1 格
- 不參與屬性對戰
- 目標為「撞擊」而非佔格

---

# 5. 撞擊與彈飛系統（Knockback）

## 4.1 觸發條件

當撞棋 NPC 最終落點與任一單位（玩家 / NPC）同格時觸發。

---

## 4.2 彈飛距離

被撞者沿撞擊方向彈飛：

```
knockbackDistance = Random(2, 3)
```

僅可能為 2 格或 3 格。

---

## 4.3 彈飛判定流程

1. 逐格推進
2. 若超出棋盤 → 停在最後合法格
3. 若落入縮圈外 → 立即淘汰
4. 若落點已有單位 → 觸發連鎖衝突

---

# 6. 連鎖衝突（Chain Reaction）

若彈飛落地後與其他單位同格：

- 立即執行 CombatResolver
- 套用該格 TileData 屬性規則
- 可連鎖多次

事件記錄順序：

NPC撞擊 → A彈飛3格 → 落地撞到B → A/B結算

---

# 7. 撞棋 NPC 人格系統

每個撞棋 NPC 擁有一種人格。

人格僅影響「決策邏輯」，不影響戰鬥公式。

---

## 6.1 勇猛型 Aggressive

特徵：STR 高

行為：
- 優先追擊最近目標
- 優先選擇可立即撞擊的路徑
- 偏好高密度區域

---

## 6.2 謹慎型 Defensive

特徵：VIT / AGL 高

行為：
- 優先選擇撞完後安全的落點
- 避免縮圈邊緣
- 避免高風險區

---

## 6.3 機會主義型 Opportunist

特徵：DEX 高

行為：
- 優先攻擊血量低目標
- 偏好把人撞向縮圈邊緣
- 偏好製造二次衝突

---

## 6.4 隨性型 Random

特徵：INT 低

行為：
- 方向隨機
- 目標隨機
- 仍避免出界

---

## 6.5 賭徒型 Gambler

特徵：LUK 高

行為：
- 偏好負格
- 高隨機權重
- 偏好把人撞向負屬性格

---

## 6.6 智將型 Tactician

特徵：INT 高

行為：
- 評估撞擊後可能連鎖效果
- 優先把人撞向
  - 對方弱屬性格
  - 多人聚集區
  - 縮圈邊緣

---

# 8. 決策模型

每回合產生候選移動：

```
candidateMoves = neighbors(pos) + current
```

對每個候選格評分：

- HitScore
- TargetValue
- TilePreference
- Risk
- PersonalityWeight

最終選擇最高分行動。

---

# 9. 平衡參數（建議 JSON 控制）

- knockbackDistanceOptions: [2,3]
- personalityType
- noiseRange
- countByPhase
- tilePreferenceWeight

---

# 10. 演出規格（Presentation）

- Hit-stop：50ms
- 震動：6px / 0.12s
- 彈飛動畫：每格 0.12~0.16s
- 連鎖時可加音效與特效

---

# 11. 設計原則

1. 不影響 Simulation 可測性
2. 所有隨機需支援 Seed
3. Environment 與 Resolution 嚴格分離
4. 可關閉本系統進行純戰棋測試

---

本文件可直接交由 AI 實作 Interference Knockback NPC 系統。

