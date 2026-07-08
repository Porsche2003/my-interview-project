# 測試教學：用 Vitest 寫單元測試

> 這份文件記錄怎麼在這個專案裝上 Vitest、寫第一批測試、以及**之後怎麼繼續加測試**。
> 測試層次的整體觀念（單元 / 整合 / E2E 三層金字塔）請看 [開發核心觀念教學.md 第 9 章](./開發核心觀念教學.md)。

## 目錄

1. [為什麼是 Vitest、為什麼先測這些函式](#1-為什麼是-vitest為什麼先測這些函式)
2. [安裝與設定（我們做了什麼）](#2-安裝與設定我們做了什麼)
3. [怎麼跑測試](#3-怎麼跑測試)
4. [一個測試檔逐行拆解](#4-一個測試檔逐行拆解)
5. [測試的心法：什麼該測、什麼不必測](#5-測試的心法什麼該測什麼不必測)
6. [如何繼續加測試（下一批目標）](#6-如何繼續加測試下一批目標)
7. [把測試接上 CI（建議下一步）](#7-把測試接上-ci建議下一步)

---

## 1. 為什麼是 Vitest、為什麼先測這些函式

**Vitest 是什麼**：一個測試執行器（test runner）——你寫「這個函式餵 X 應該回傳 Y」，它幫你自動跑、比對、紅燈綠燈告訴你對不對。它原生支援 TypeScript、速度快、API 跟舊世代的 Jest 幾乎一樣，是現在 Vite/前端生態的主流選擇。

**為什麼第一批選 `rocDateToIso` 和 `numOrNull` 這兩個函式**：好的第一個測試目標有三個特徵，它們剛好都符合——

1. **純函式（pure function）**：一樣的輸入永遠得到一樣的輸出，不碰資料庫、不打網路、不依賴時間。→ 不需要任何 mock，是初學測試最乾淨的起點。
2. **已知有邊界案例**：民國年 +1911 的魔術數字、ETF 沒有本益比會回空字串——這些我們在擷取時就踩過，正是最該用測試「釘住」的地方。
3. **已經上線在跑**：它們每天在 GitHub Actions 排程裡執行，卻一個測試都沒有。先補這裡，投報率最高。

---

## 2. 安裝與設定（我們做了什麼）

**① 安裝**（devDependency，因為正式上線不需要它）：

```bash
npm install -D vitest
```

**② 設定檔** [vitest.config.ts](../vitest.config.ts)：

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',                              // 純函式跑在 Node 即可，不需瀏覽器 DOM
    include: ['scripts/**/*.test.ts', 'src/**/*.test.ts'], // 測試檔放哪、怎麼命名
  },
})
```

**③ package.json 加兩個指令**：

```json
"test": "vitest run",      // 跑一次就結束（給 CI 和「檢查一下」用）
"test:watch": "vitest"     // 監看模式：改檔案就自動重跑（給邊寫邊測用）
```

**④ 測試檔**，放在被測程式**旁邊**、命名為 `*.test.ts`：

- [scripts/ingest/roc-date.test.ts](../scripts/ingest/roc-date.test.ts)
- [scripts/ingest/types.test.ts](../scripts/ingest/types.test.ts)

> 測試檔放在原始碼旁邊（co-location），而不是集中在另一個 `tests/` 資料夾——好處是改某個函式時，它的測試就在隔壁，不容易忘記更新。

---

## 3. 怎麼跑測試

```bash
npm test           # 跑一次全部測試，印出結果就結束
npm run test:watch # 監看模式，改任何檔案就自動重跑相關測試（TDD 時用這個）
```

成功長這樣：

```
 Test Files  2 passed (2)
      Tests  19 passed (19)
```

---

## 4. 一個測試檔逐行拆解

以 [roc-date.test.ts](../scripts/ingest/roc-date.test.ts) 為例：

```ts
import { describe, it, expect } from 'vitest'   // 測試用的三個核心 API
import { rocDateToIso } from './roc-date'        // 被測的函式

describe('rocDateToIso', () => {                 // describe = 把相關測試分成一組
  it('把民國年日期轉成西元 ISO 格式', () => {      // it = 一個測試案例（描述「它應該...」）
    expect(rocDateToIso('1150701')).toBe('2026-07-01')  // expect...toBe = 斷言：實際值應該等於預期值
  })

  it.each(['115070', '', 'abcdefg'])(            // it.each = 用多組資料跑同一個測試
    '格式不對時丟出錯誤："%s"',                    // %s 會被每組資料替換
    (bad) => {
      expect(() => rocDateToIso(bad)).toThrow()  // toThrow = 斷言「這個呼叫應該丟出錯誤」
    }
  )
})
```

三個核心概念：

- **`describe`**：把同一個對象的測試包成一組，報告時看得清楚。
- **`it`（或 `test`）**：一個具體案例。名字用「它應該做什麼」的句子寫，日後失敗時一眼看懂壞在哪個行為。
- **`expect(實際值).matcher(預期值)`**：斷言。常用 matcher：
  | matcher | 意思 |
  |---|---|
  | `toBe(x)` | 嚴格等於（數字、字串、boolean） |
  | `toEqual(x)` | 深層相等（比物件、陣列內容） |
  | `toBeNull()` | 是 null |
  | `toThrow()` | 這個函式呼叫會丟出錯誤 |
  | `not.toThrow()` | 不會丟錯 |

**AAA 結構**（每個測試都照這個節奏，讀起來一致）：Arrange（準備輸入）→ Act（呼叫被測函式）→ Assert（斷言結果）。簡單的案例三步會併成一行，像上面那樣。

---

## 5. 測試的心法：什麼該測、什麼不必測

初學最常見的錯誤是「什麼都想測」，反而讓測試又多又脆。判斷準則：

**該測 ✅**
- **有邏輯、有分支、有計算**的純函式（`rocDateToIso` 的格式驗證、`numOrNull` 的多種空值）。
- **你已知會踩雷**的地方（民國年、千分位逗號、`"0"` 不能被當成空值）。
- **對外契約**：例如 zod schema——它守的是「API 回傳格式沒變」，測它等於幫你上一道警報。

**不必測 ❌**
- **沒有邏輯的資料搬運**（`upsert.ts` 裡把 `stockId` 對應到 `stock_id` 這種純映射，測了只是重寫一遍程式）。
- **第三方套件本身**（不用測 zod 會不會驗證、不用測 Supabase client 會不會連線——那是它們的責任）。
- **一直在變的東西**（例如還在快速調整的 UI 版面）。

> 一句話：**測「會出錯的邏輯」，不測「顯而易見的搬運」**。每個測試都是一份要維護的資產，只寫有價值的。

---

## 6. 如何繼續加測試（下一批目標）

依「投報率」排序，接下來值得補的測試：

### ① `fetch-twse.ts` / `fetch-tpex.ts` 的「合併與正規化」邏輯

這兩支檔案把「收盤價那支 API」和「本益比那支 API」依股票代號**合併**，並轉成 `NormalizedQuote`。這裡有真正的邏輯（配對、找不到對應時怎麼辦），值得測。

做法：把「純轉換」的部分抽成一個獨立、不打網路的函式（例如 `mergeTwseRows(quoteRows, peRows)`），再餵假資料測它。**這也會順便讓程式更好——把「抓取（有副作用）」和「轉換（純邏輯）」分離**，是測試驅動改善設計的典型例子。

### ② 產品頁的查詢邏輯（做產品頁時一起寫）

接下來做本益比排行榜 / 個股頁時，DAL 會長出真正的查詢（排序、分頁、過濾掉沒有本益比的 ETF）。這些邏輯建議**邊寫邊測**（test-driven）。

- 純計算的部分（例如「漲跌幅 = (今收 − 昨收) / 昨收」）→ 直接單元測試。
- 碰資料庫的部分 → 屬於**整合測試**，需要 mock Supabase client 或連到一個測試用資料庫，比單元測試複雜，等產品頁成形後再處理。

### 加一個測試的固定步驟

1. 在被測檔案旁建 `xxx.test.ts`。
2. `import { describe, it, expect } from 'vitest'` + import 被測函式。
3. 想清楚**輸入 → 預期輸出**，尤其是邊界案例（空值、0、超大數、格式錯誤）。
4. `npm run test:watch` 開著，邊寫邊看綠燈。

---

## 7. 把測試接上 CI（建議下一步）

現在測試只在你本機跑。下一步可以讓它在**每次 push 時自動跑**，避免壞掉的程式被合併進 `main`。做法是新增一個 GitHub Actions workflow（概念和 [排程自動化教學.md](./排程自動化教學.md) 一樣，只是觸發器改成 `on: push`）：

```yaml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
```

這支不需要任何 Secrets（純函式測試不碰資料庫），所以比擷取排程更單純。有了它，你 repo 的每個 commit 都會有一個「測試通過」的綠勾，這在面試作品集裡是很強的專業訊號。

> 尚未做，留待你想加時再說。
