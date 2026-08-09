# 快取層與 On-demand Revalidation 實作教學

> 以你這個台股資訊站為例，把「讀取路徑加快取」這件事從零講到能自己做。
> 對應版本：Next.js 16.2.9、`@supabase/ssr` / `@supabase/supabase-js`。
> 相關決策：[ADR-0001](ADR-0001-快取策略與revalidate-webhook.md)、[架構總覽](架構總覽-瓶頸與擴展.md)。

---

## 第 0 章：先建立大圖像——「三種快取」各解決什麼

初學最容易混淆的是「快取」其實不只一種。這個專案同時用到三層，職責完全不同：

| 層 | 是什麼 | 範圍 | 在本專案 |
|---|---|---|---|
| **React `cache()`** | 單次請求內的記憶化（去重） | **一次 render pass** | `getStockDetail` 外層，避免 generateMetadata + 頁面本體查兩次 |
| **`unstable_cache`** | 跨請求、跨部署的**資料**快取 | **持久**（可被 tag 清） | 包住 `listStocks` / `getStockDetail` 的 DB 查詢 |
| **頁面 ISR（`export const revalidate`）** | 快取整頁**渲染結果 HTML** | **持久** | `/stocks`、`/stocks/[id]` |

一句話記法：
- `cache()` 省掉「同一次請求內」的重複查詢。
- `unstable_cache` 省掉「不同請求之間」的重複 DB round-trip ← **這是解決瓶頸的主角**。
- 頁面 ISR 連 HTML 都不用重算 ← 錦上添花。

三者可以疊加，且互不衝突。

---

## 第 1 章：怎麼決定——A-lite（`unstable_cache`）vs A-full（`cacheComponents` + `use cache`）

Next 16 有兩套快取寫法，這是動手前**最重要的一個決策**：

| 面向 | `unstable_cache`（本次選它） | `cacheComponents` + `use cache` |
|---|---|---|
| 影響範圍 | 只包你要的幾個函式，其餘不動 | **全 app 開關**：dynamic-by-default、強制 PPR、換 `<Activity>` 導覽 |
| 遷移成本 | 幾乎沒有 | 官方有整份「migrating-to-cache-components」指南＝整站改造 |
| Next 16 狀態 | 文件標「已被 use cache 取代」但**仍完全可用** | 最新方向 |
| 適合時機 | 現在：外科手術式加快取、低風險 | 未來：要做 PPR（靜態殼＋串流動態洞，例如彈幕）時 |

**決策原則**：先用 blast radius（影響半徑）最小的工具解決當下問題。`unstable_cache` 只碰兩個函式，出事範圍可控；`cacheComponents` 會改變**每一個路由**的渲染行為，對一個還在成長的專案是過度改造。而且兩者的核心觀念（tag、`revalidateTag`）相通，未來要升級 use cache 不浪費。

> 這個「怎麼選」本身就是好的面試素材：展示你懂得評估改動的影響半徑，而不是看到新 API 就全用上。

---

## 第 2 章：為什麼要先拆一個 cookieless client（cookie 陷阱）

**這是最容易卡住的雷。** `unstable_cache`（和 `use cache`）**內部不能讀 `cookies()` / `headers()`**——因為 cookie 是「每個請求都不同」的 request 範圍資料，放進「跨請求共用」的快取，語意上矛盾，Next 會直接擋。

而你原本的 `src/utils/supabase/server.ts` 的 `createClient()` **每次都 `await cookies()`**（為了帶使用者登入 session）。所以直接把 `listStocks` 包進 `unstable_cache` 會壞。

**解法**：`stocks` / `daily_quotes` 的 RLS 本來就是「公開讀」，根本不需要使用者 session。所以新開一個**不吃 cookie**的 client：

```ts
// src/utils/supabase/public.ts
import { createClient } from '@supabase/supabase-js' // 注意：是 supabase-js，不是 ssr
export const supabasePublic = createClient(URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
```

用 module 層單例即可（它無狀態、可跨請求共用），不像 server client 每次都要綁當下 cookie。

**判斷法則**：要進快取的讀取，資料流裡不能有任何 request 範圍的東西（cookie / header / searchParams）。有的話，要嘛把它當參數傳進去、要嘛換一個不依賴它的資料來源。

---

## 第 3 章：逐檔改了什麼、為什麼

### 3-1 `src/services/stocks.ts`（DAL）——包快取 + 打 tag

```ts
export const STOCKS_CACHE_TAG = 'stocks' // tag 字串單一來源，兩地才不會打錯字對不上

const getStockDetailCached = unstable_cache(
  async (id: string) => { /* 用 supabasePublic 查 */ },
  ['stock-detail'],                              // 快取鍵前綴；參數 id 會自動併入
  { tags: [STOCKS_CACHE_TAG], revalidate: 3600 } // tag 可被精準清；3600 是保底 TTL
)
export const getStockDetail = cache(getStockDetailCached) // 外層再包 React cache() 做單請求去重
```

**怎麼決定 revalidate 值**：資料一天更新一次，理論上 TTL 設一天也行。但 TTL 只是「保底」——真正即時的更新靠 webhook（下章）。設 3600（1 小時）是「就算 webhook 沒打到，最多一小時後也會自己更新」的安全網。設太長，webhook 掛掉時資料會太舊；設太短，失去快取意義。**保底 TTL 抓「可容忍的最大延遲」即可**。

`listStocks` 同理包一層，但它一個請求只被呼叫一次，所以不用外層 React `cache()`。

### 3-2 兩個頁面——加 `export const revalidate`

```ts
// src/app/stocks/page.tsx 與 src/app/stocks/[id]/page.tsx
export const revalidate = 3600
```

加了之後 build 會看到 `/stocks` 從 `ƒ`（動態、每請求渲染）變成 `○`（靜態 ISR）。`/stocks/[id]` 因為是動態參數路由、沒有 `generateStaticParams`，維持「首次造訪才產生、之後快取」的 on-demand ISR（build 表仍顯示 `ƒ`，但資料層已被 unstable_cache 快取，DB 不會每次被打）。

> **決定要不要 `generateStaticParams`**：它會在 build 時把「列出的 id」全部預先產生。股票上千檔、且會變動，不值得 build 時全產生，所以**不用**，讓它 on-demand 產生就好。

### 3-3 `POST /api/revalidate`（Route Handler）——on-demand 精準失效

```ts
export async function POST(request: Request) {
  const provided = request.headers.get('x-revalidate-secret')
  if (!isRevalidateAuthorized(provided, process.env.REVALIDATE_SECRET)) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  revalidateTag(STOCKS_CACHE_TAG, { expire: 0 })
  return Response.json({ ok: true, revalidated: STOCKS_CACHE_TAG, now: Date.now() })
}
```

三個設計決定：
- **只收 POST**：清快取是「會改變狀態」的動作，語意上不該用可被預抓、可安全重複的 GET。
- **密鑰放 header 不放 query string**：避免密鑰被寫進 URL、留在存取紀錄／瀏覽器歷史。
- **⚠️ Next 16 breaking change**：`revalidateTag(tag, profile)` **第二參數必填**，單參數形式已 deprecated（TS 會直接編譯失敗——這正是 `AGENTS.md` 要你先讀官方文件的原因）。第二參數怎麼選：

  | 值 | 語意 | 適用 |
  |---|---|---|
  | `{ expire: 0 }`（本次用） | **立即過期**：下一個請求就是 blocking cache miss、直接拿到新資料 | 官方明列「外部系統 webhook 呼叫、要資料立刻更新」 |
  | `'max'` | stale-while-revalidate：下一個訪客先看到**舊**資料、背景才更新 | 可容忍短暫延遲、要避免任何 blocking |

  我們的情境是「ingest 打完，使用者當天就要看到新股價」，所以用 `{ expire: 0 }`。

### 3-4 `src/lib/revalidate-auth.ts`——密鑰驗證（可測 + 安全）

抽成純函式的兩個理由：(1) route handler 內的 `revalidateTag` 需要 Next 執行環境、很難單元測，但「密鑰對不對」是純邏輯，抽出來就能用 Vitest 完整覆蓋；(2) 單一職責。

用 `crypto.timingSafeEqual` 做**常數時間比較**：一般 `===` 比字串會在第一個不同字元就回傳，攻擊者能用回應時間差逐字猜密鑰（timing attack）。常數時間比較不論對錯都花一樣久，堵掉這條側通道。並設**安全預設**：伺服器沒設密鑰就一律拒絕，避免「忘了設環境變數＝誰都能打」。

### 3-5 `scripts/ingest/`——寫完資料後打 webhook

`run.ts` 在 `upsertQuotes` 後呼叫 `revalidateStocksCache()`（新檔 `revalidate.ts`）。刻意**盡力而為**：沒設 env 就略過、失敗只警告、絕不改變 ingest 結束碼。因為資料已寫進 DB，「叫線上快取早點更新」失敗不是資料正確性問題，不該讓它把一次成功的擷取標記成失敗。

---

## 第 4 章：完整資料流（串起來看）

```
每天 08:00  GitHub Actions → scripts/ingest 抓證交所 → upsert 進 Supabase
                                                          │
                                                          ▼ 寫完後
                          POST /api/revalidate（帶密鑰）──► revalidateTag('stocks', {expire:0})
                                                          │
                                                          ▼ 標記 stocks 快取過期
使用者造訪 /stocks ──► 下一個請求 = cache miss ──► 查一次 Supabase ──► 重新填滿快取
其後所有訪客 ──────────────────────────────────► 直接吃快取，不碰 DB
（就算 webhook 沒打成功，revalidate:3600 保底 TTL 最多一小時後也會自己更新）
```

---

## 第 5 章：怎麼測（三層驗證）

1. **Vitest（純邏輯）**：`src/lib/revalidate-auth.test.ts` 測密鑰驗證的 200/401 分支、長度不同不丟錯、安全預設。`npm test`。
2. **curl（端點行為）**：`next build && next start`，然後：
   ```bash
   curl -i -X POST http://localhost:3000/api/revalidate                                  # 預期 401
   curl -i -X POST -H "x-revalidate-secret: <你的密鑰>" http://localhost:3000/api/revalidate  # 預期 200
   ```
3. **端到端（真行為）**：`next start` 起站 → 造訪 `/stocks` 記住內容 → 直接改 Supabase 某檔資料 → 再刷 `/stocks`（因快取，應**還是舊的**）→ 打 `/api/revalidate` → 再刷（應變**新的**）。這才證明快取＋失效真的通了。

> 為什麼要 `next start` 不用 `next dev`：dev 模式頁面永遠即時渲染、不快取，看不出 ISR 行為。

---

## 第 6 章：你要做的環境設定（部署前必做）

1. 產生一組隨機密鑰（例如 `openssl rand -hex 32`）。
2. 三個地方設 **`REVALIDATE_SECRET`**（值相同）：
   - `.env.local`（本機測試）
   - **Vercel** 專案環境變數（線上 `/api/revalidate` 要比對）
   - **GitHub Secrets**（ingest 在 CI 打 webhook 要帶）
3. ingest 端另設 **`REVALIDATE_URL`**（`.env.local` 本機、GitHub Secrets for CI）＝ `https://<你的-vercel-網址>/api/revalidate`。
4. 沒設這兩個變數時，ingest 會印「略過快取失效」照常完成——所以可以先部署、之後再補設定。

---

## 第 7 章：面試怎麼講

> 「我的讀取瓶頸是 DB：頁面本來全動態，每個請求都查一次 Supabase，但資料一天只變一次、對所有人又相同。我在讀取路徑加了快取層——用 `unstable_cache` 把 DB 查詢結果按 tag 快取起來，頁面設 `revalidate` 做 ISR，`/stocks` 因此從動態變成靜態。即時性靠 on-demand revalidation：ingest 寫完資料打一支帶密鑰的 `/api/revalidate`，`revalidateTag` 精準清掉快取，使用者當天就看到新資料，不用等 TTL。我特別選了 `unstable_cache` 而不是 `cacheComponents`，因為後者是整站級改造、影響每個路由的渲染，現階段用影響半徑最小的工具就夠了——那條路留給之後要做 PPR 的時候。過程踩到 Next 16 的 breaking change：`revalidateTag` 第二參數變必填，webhook 情境要用 `{ expire: 0 }` 立即過期。」

這段同時展示了：分辨瓶頸、三層快取觀念、安全（密鑰 + 常數時間比較）、對新版 API 的掌握、以及**懂得節制**（不過度工程）。
