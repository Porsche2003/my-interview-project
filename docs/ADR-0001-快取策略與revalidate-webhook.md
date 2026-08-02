# ADR-0001：股價讀取採全動態，暫不建置 revalidate webhook

> **狀態**：已採納（Accepted）
> **日期**：2026-07-24
> **決策者**：專案作者
> **相關**：`docs/開發核心觀念教學.md`（快取章節）、`src/services/stocks.ts`、`scripts/ingest/`

這是本專案第一份 **ADR（Architecture Decision Record，架構決策紀錄）**。ADR 的用途是把「我們**為什麼**這樣決定、當時的權衡、以及**何時該重新考慮**」寫下來，避免半年後自己或面試官問起時只能靠記憶。它記錄的是**決策**，不是教學。

---

## 背景（Context）

本專案的架構本意是**擷取與讀取分離**：背景排程（GitHub Actions）每天抓證交所資料寫入 Supabase，使用者端只讀「已算好的資料＋快取」。順著這個本意，一個很自然的建議是：

> 加一支 `POST /api/revalidate`：讀 `REVALIDATE_SECRET` 比對 header → 呼叫 `revalidateTag('stocks')` → 回 200；由 ingest 寫完資料後觸發，讓使用者端快取失效、看到新資料。

問題是：**這只有在「讀取端真的有快取可以被清」時才有意義。** 於是我們盤點了現況（驗證於 2026-07-24）：

| 事實 | 出處 |
|---|---|
| `/stocks`、`/stocks/[id]` 都是 **ƒ 全動態**，每次請求都重跑 DAL、即時查 Supabase | `npm run build` 輸出 |
| DAL 用 **Supabase client `.from().select()`**，不是 Next 的 `fetch`，不吃 fetch 的 tag 機制 | `src/services/stocks.ts` |
| 全專案**沒有** `unstable_cache` / `"use cache"` / `cacheTag` / fetch tags | 程式碼搜尋 |
| `cacheComponents` **沒開**（`next.config.ts` 只有 `reactCompiler`），故 `"use cache"` 指示詞尚不可用 | `next.config.ts` |
| `getStockDetail` 的 `cache()` 只是**單次請求內記憶化**（去重），不是跨請求持久快取 | `src/services/stocks.ts:24` |
| server 端 `createClient()` 每次都 `await cookies()`，屬 request 範圍動態資料 | `src/utils/supabase/server.ts:5` |

**結論：目前沒有任何快取項掛著 `stocks` tag。** 現在加這支 webhook，`revalidateTag('stocks')` 會成功回 200，但**什麼都清不掉**——它是一個空轉的端點。

### 一個容易混淆的重點：兩條獨立的軸

規劃「個股頁未來要有彈幕（bullet comments）」時，很容易誤以為「頁面要有即時互動 → 就需要 revalidate webhook」。這是把兩件不相干的事綁在一起。它們是**兩條獨立的軸**：

| 軸 | 解決什麼 | 用什麼解 |
|---|---|---|
| **資料新鮮度**（股價 / 本益比） | 使用者看到的價格夠不夠新 | 全動態（永遠最新）或 ISR＋webhook（快取，由 ingest 打掉） |
| **即時互動**（彈幕） | 使用者留言即時飛出來 | **client component ＋ Supabase Realtime（或輪詢）** |

**彈幕是一個 `"use client"` 的 island**：它在瀏覽器 hydrate 後自己訂閱 Realtime、自己收發留言，**永遠不會被 ISR 快取，也永遠不會用到 `/api/revalidate`**。它掛在全動態頁或 ISR 頁上，行為完全相同——因為 client 元件不在乎它的 server 父層有沒有被快取。所以「未來要做彈幕」**並不構成現在要建 webhook 的理由**。

---

## 決策（Decision）

**股價讀取維持全動態（每次請求即時查 Supabase）；暫不建置讀取快取層，亦不建置 `/api/revalidate` webhook。**

決策理由（decision drivers）：

1. **需求不存在**：排程一天只跑一次、資料日更一次，且目前是低流量的面試作品集。全動態代表使用者**永遠看到最新資料**，完全不需要快取失效機制。
2. **成本 > 收益**：要讓 webhook 有意義，必須先做「讀取快取＋打 tag」。而現有 DAL 依賴 `cookies()`，**不能直接包進 `unstable_cache` / `"use cache"`**（快取層讀不到 request 範圍的 cookie，會壞）。得先另做一個 **cookieless 的公開 client**（anon key、不掛 cookie adapter）給快取路徑，再包快取、加 tag、加 webhook、改 ingest 觸發——一整串工程，目前不划算。
3. **可測性是假象**：`帶 header→200／缺 secret→401` 的 curl 測試只驗到「密鑰門」，永遠會過；但它**驗不到 revalidate 真的清掉了什麼**，因為沒有快取狀態可觀察。等於測了保全、沒測到功能。
4. **展現判斷力**：知道「什麼時候該**不**建基礎設施」比硬蓋一個空轉的 webhook 更像資深工程師的選擇。

---

## 後果（Consequences）

**正面**
- 使用者永遠看到最新資料，零 stale 風險。
- 程式最單純：沒有快取失效機制、沒有 cookie／`unstable_cache` 陷阱、沒有 webhook 密鑰要管。
- 少一個對外端點 = 少一塊攻擊面。

**負面（可接受）**
- 每次頁面請求都會打一趟 Supabase 查詢。高流量時，這會變成 DB 讀取壓力與延遲來源。
- 目前低流量、日更一次 → 完全在可接受範圍。這個負面正是下面「重啟條件」要盯的訊號。

---

## 曾評估的替代方案（Alternatives Considered）

**路徑 A：把股價讀取包一層快取 + tag，讓 webhook 真的清得到。** 又分兩種子版本：

- **A-lite（`unstable_cache`）**：`unstable_cache(fn, keys, { tags:['stocks'], revalidate:3600 })`。今天就能用、不用開 flag，但屬 legacy API，且一樣要先做 cookieless client。
- **A-full（`cacheComponents` + `"use cache"` + `cacheTag`）**：Next 16 的現代做法，需在 `next.config.ts` 開 `cacheComponents`。這條路能解鎖 **PPR（Partial Prerendering）**——「預先算好的靜態外殼 ＋ Suspense 包住的動態洞、串流補上」。

兩者共同的前置成本：**cookieless 公開 client 重構**。目前收益不足以支撐這個成本，故不採用。

> ⚠️ Next 16 的快取 API（`use cache`、`cacheComponents`、`cacheLife`）與舊版差異很大。真的要走路徑 A 時，**先讀 `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md`**，不要照網路舊教學（見 `AGENTS.md`）。

---

## 何時該重新考慮（Revisit Triggers）

出現以下任一情況，就重開一份 ADR-0002 評估路徑 A：

1. **讀取量明顯成長**，Supabase 讀取成為延遲或成本瓶頸（監控指標：頁面 P95 延遲、Supabase DB 用量）。
2. **要做 PPR 展示**：想在履歷／面試秀「靜態價格外殼 ＋ Suspense 動態洞」的 Next 16 架構。
3. **加入彈幕等即時互動，且想走「靜態殼 ＋ live island」的 PPR 故事**（見下節）。

---

## 未來：彈幕與本決策的關係

當個股頁要加彈幕時：

- 彈幕自成一個 **client island**（`"use client"` ＋ Supabase Realtime），有自己的即時資料生命週期，**永不 ISR 快取、不使用 `/api/revalidate`**。它需要的是自己的資料表（如 `stock_comments`）＋ RLS（使用者只能新增自己的留言，語意類似 `watchlist`）＋ Realtime 訂閱。
- 因此彈幕**掛在全動態頁（本決策）上就能運作**，不必為了彈幕改動快取策略。
- **唯一**會讓路徑 A 值得做的情境：想秀 **PPR** ——用 `cacheComponents` + `"use cache"` + `cacheTag('stocks')` 快取「價格外殼」，把彈幕包在 `<Suspense>` 當動態洞串流補上；此時 `/api/revalidate` webhook 才**真正有意義**（ingest 寫完 → 打 webhook → 打掉價格外殼快取）。這是一個完整、當代、面試吃香的故事——但要**跟彈幕一起做**才成立，屆時另立 ADR-0002。

---

## 面試講法

> 「我評估過 on-demand ISR ＋ revalidate webhook 這套模式。但現階段頁面全動態、資料一天只更新一次、流量又低，這個 webhook 會是一塊**空轉的基礎設施**——而且我的 server client 吃 cookie，要快取還得先拆出一個 cookieless 的公開 client，成本不小。所以我選擇**寫一份 ADR 記錄這個決策、並定義好重啟條件**：等讀取量變大、或要做 PPR＋彈幕的『靜態殼＋live island』架構時，再連同快取一起上。這樣既不過度工程，未來要擴充時也有清楚的藍圖。」
