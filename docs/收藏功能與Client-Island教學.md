# 收藏功能實作教學：Server Action、Client Island、與「私人狀態 vs 快取」

> 以 watchlist（收藏）功能為例，講清楚 Next 16 App Router 底下「使用者互動」該怎麼分層。
> 對應版本：Next.js 16.2.9、React 19。
> 相關：[快取與 on-demand revalidation](快取與on-demand-revalidation教學.md)、[ADR-0001](ADR-0001-快取策略與revalidate-webhook.md)、[架構總覽](架構總覽-瓶頸與擴展.md)

---

## 第 0 章：這一章最重要的一句話

> **任何「每個使用者都不一樣」的東西進入頁面，那頁的 HTML 就不能被快取。**

這不是效能取捨，是**正確性與隱私**問題：頁面 HTML 被快取後，A 使用者的收藏狀態會被原封不動送給 B 使用者看。

本專案有兩頁都要加 ★，但**用了兩種完全不同的解法**——因為它們的取捨不同。這是全篇的核心。

| 頁面 | 原本 | 加 ★ 之後 | 為什麼 |
|---|---|---|---|
| `/stocks/[id]` 個股頁 | ISR 快取 | **改成動態渲染** | 個股頁本來就是 `ƒ`，放棄 HTML 快取代價小；換來寫法最單純 |
| `/stocks` 列表頁 | **靜態 ISR（`○`）** | **維持靜態**，★ 由 client island 補上 | 這是快取那輪唯一真正靜態的頁，戰果不能丟 |

判斷法則：**先問「這頁的快取值多少錢」**，再決定要犧牲快取、還是多花工夫做 island。

---

## 第 1 章：分層——誰負責什麼

```
app/stocks/[id]/page.tsx      Server Component：取資料、決定畫面
   └─ components/watchlist-button.tsx   'use client' island：互動與樂觀更新
        └─ app/stocks/actions.ts        Server Action：只做分派
             └─ services/watchlist.ts   DAL：驗證、身份、查詢
                  └─ lib/watchlist.ts   純函式：schema、mapper、文案
                       └─ Postgres RLS  最後防線
```

**Server Action 為什麼寫得這麼薄**：

```ts
export async function toggleWatchlistAction(stockId: string, shouldWatch: boolean) {
  return shouldWatch ? await addToWatchlist(stockId) : await removeFromWatchlist(stockId)
}
```

沒有驗證、沒有 auth 檢查——因為那些**都在 DAL 裡**。在兩個地方各寫一份，最後一定會變成「改了一邊忘了另一邊」的漏洞。

### ⚠️ 一個必須知道的安全事實

Next 官方文件明載：

> Server Functions 可被**直接 POST 呼叫**，不只透過你的應用程式 UI。

意思是**攻擊者不需要你的按鈕**。他可以直接打這支 action、帶任意 `stockId` 與任意 `shouldWatch`。所以「按鈕沒顯示，所以使用者做不到」是錯誤的心智模型。

真正的防線有三層，**全部在 UI 之外**：

1. `StockIdSchema.safeParse()` —— 輸入格式（DAL 內）
2. `supabase.auth.getUser()` —— 身份驗證（DAL 內，每次都做）
3. **RLS policy `auth.uid() = user_id`** —— 資料隔離（資料庫層，就算程式全錯也擋得住）

---

## 第 2 章：為什麼不開 REST API

先前評估過「watchlist 只做 `GET` + `POST`」，結論是**不做**。判斷法則：

> **呼叫方在你的 Next.js 進程外面 → Route Handler。呼叫方是你自己的 React 樹 → Server Action。**

| | 開 `GET/POST /api/watchlist` | Server Action |
|---|---|---|
| 讀取 | SC 得「自己打自己的 HTTP」或丟給 client fetch | SC 直接 `await getWatchlist()`，零 HTTP hop |
| 寫入 | 手動解析 JSON、驗身份、**自己處理 CSRF** | 內建 CSRF 防護（Origin/Host 比對） |
| 更新畫面 | 自己管 refetch | 樂觀更新 / `refresh()` |

本專案**正當**的 Route Handler 只有三支，共同點是「呼叫方在外面」：`/api/revalidate`（GitHub Actions）、`/api/health`（部署探針）、`/auth/callback`（Google OAuth 重導）。

另外，「只做 GET + POST」還有個破綻：**表達不了「移除」**。硬做就得把 POST 超載成 `{ action: 'add' | 'remove' }`，那是用 POST 假裝 RPC。

---

## 第 3 章：樂觀更新的三種寫法（依情境選）

「樂觀更新」＝點下去畫面**立刻**變，不等網路來回；失敗再還原。

### ① `useOptimistic` 切換布林值（★ 按鈕）

```tsx
const [isWatched, setIsWatched] = useState(initialIsWatched)          // 真實狀態
const [optimisticIsWatched, setOptimistic] = useOptimistic(
  isWatched, (_current, next: boolean) => next
)

startTransition(async () => {
  setOptimistic(next)                       // 畫面立刻變
  const result = await toggleWatchlistAction(stockId, next)
  if (result.ok) setIsWatched(next)         // 成功：補上真實狀態
  else setError(watchlistErrorMessage(result.error))  // 失敗：什麼都不做
})
```

**`useOptimistic` 的精髓在「失敗時什麼都不用做」**：transition 結束時若真實狀態沒變，樂觀值會**自動回退**。不必手寫還原邏輯。

> ⚠️ **Rules of Hooks 陷阱**：「未登入就 return 一個登入連結」這種提前 return，必須放在**所有 `useXxx` 之後**。寫在最上面會讓 hook 呼叫次數在不同 render 間不一致而爆掉。你開了 `reactCompiler: true`，這類錯誤會被抓得更嚴。

### ② `useOptimistic` 移除陣列元素（收藏列表）

同一個 hook，reducer 換成對陣列 filter：

```tsx
const [optimisticList, removeOptimistic] = useOptimistic(
  list,
  (current: WatchlistItem[], removedId: string) => current.filter((i) => i.id !== removedId)
)
```

移除失敗時，那一列會**自己跳回畫面上**。

### ③ 手動樂觀更新（列表頁的 Set）

列表頁的狀態是一個 `Set<string>`、又要逐列切換。這種情況套 `useOptimistic` 的 reducer 反而繞，直接「先改、失敗還原」更好讀：

```tsx
const apply = (add: boolean) => setWatchedIds((prev) => {
  const copy = new Set(prev)
  add ? copy.add(stockId) : copy.delete(stockId)
  return copy
})

apply(next)                                  // 先改
const result = await toggleWatchlistAction(stockId, next)
if (!result.ok) { apply(!next); setError(...) }  // 失敗還原
```

**選擇標準**：`useOptimistic` 的價值是「自動回退」。當狀態單純、回退邏輯一行就寫得完時，手動反而更直觀——工具要看情境用，不是越新越好。

---

## 第 4 章：保住靜態快取的 Client Island

`/stocks` 是全站唯一真正靜態的頁（build 表上的 `○`，ISR 1h）。要在上面加 per-user 的 ★，又不能讓它掉成動態，做法是：

```
Server Component（靜態，不碰 cookie）
  └─ 把股票清單當 props 傳給 client component
       └─ client 在 hydrate 後呼叫 Server Function 取「我收藏了哪些」
```

```tsx
useEffect(() => {
  let cancelled = false
  getMyWatchlistIdsAction().then((ids) => {
    if (!cancelled && ids !== null) setWatchedIds(new Set(ids))
  })
  return () => { cancelled = true }   // 卸載後不要再 setState
}, [])
```

**關鍵理解**：client component **一樣會被伺服器渲染**進 HTML。所以那 100 列股票仍在靜態 HTML 裡（SEO、快取都不受影響），只有「★ 的狀態」是客戶端補上的。

驗證方式（不要只是相信，要看證據）：

```bash
# 靜態 HTML 裡應該找得到 100 列
curl -s http://localhost:3000/stocks | grep -oE 'href="/stocks/[0-9A-Z]{4,6}"' | wc -l   # → 100
# 未登入時不該有任何 ★ 按鈕
curl -s http://localhost:3000/stocks | grep -c 'aria-pressed'                            # → 0
```

以及 build 輸出——**這是最有力的證據**：

```
├ ○ /stocks          1h   1y   ← 加了 ★ 之後仍然是靜態
├ ƒ /stocks/[id]                ← per-user 動態
└ ƒ /watchlist                  ← per-user 動態
```

> 這正是 [ADR-0001](ADR-0001-快取策略與revalidate-webhook.md) 為「彈幕」規劃的「靜態殼 + client island」模式。彈幕之後也走同一條路，只是資料源換成 Supabase Realtime。

---

## 第 5 章：N+1 查詢與它的解法

列表頁如果每一列都問一次「這檔我收藏了嗎」，100 檔就是 **100 趟查詢**——這就是 N+1。

```ts
// ❌ N 趟：每列各問一次
stocks.map((s) => isWatchlisted(s.id))

// ✅ 1 趟：一次拿回整個集合，記憶體裡用 Set.has() 判斷
const ids = await getWatchlistStockIds()
const watched = new Set(ids)
stocks.map((s) => watched.has(s.id))
```

**辨識法則**：只要看到「在迴圈／map 裡呼叫會碰資料庫的函式」，就該警覺。解法幾乎都是「把 N 次查詢換成 1 次批次查詢 + 記憶體查找」。

> 小細節：`getWatchlistStockIds` 回傳 `string[]` 而非 `Set`。因為這個值要**跨 Server/Client 邊界序列化**，陣列一定安全，`Set` 不保證。轉成 `Set` 交給接收端做。

---

## 第 6 章：用型別把「狀態」講清楚

`getWatchlist()` 回傳 `WatchlistItem[] | null`，不是單純的 `WatchlistItem[]`：

| 回傳值 | 意義 | 頁面該做什麼 |
|---|---|---|
| `null` | **未登入** | `redirect('/login')` |
| `[]` | 已登入，但收藏是空的 | 顯示「還沒有收藏」的空狀態 |

如果全都回 `[]`，這兩種狀況就分不出來，畫面只能亂猜。**讓型別承載語意**，呼叫端才不需要臆測。

同樣的精神也用在錯誤上——DAL 回**封閉的錯誤代碼**而非自由文字：

```ts
export type WatchlistErrorCode = 'unauthenticated' | 'invalid_stock_id' | 'db_error'
```

好處有三：(1) 資料庫原始訊息（表名、約束名）永遠不會外洩到客戶端；(2) 呼叫端 `switch` 時 TypeScript 會檢查有沒有漏；(3) 文案的決定權留在 UI 層（`watchlistErrorMessage`），要做多語系只改一處。

---

## 第 7 章：面試怎麼講

> 「收藏功能我沒有開 REST API，而是用 Server Action——呼叫方是我自己的 React 樹，開 API 只是多繞一趟 HTTP，還得自己處理 CSRF。
>
> 比較有意思的是快取的取捨。★ 是 per-user 狀態，一旦頁面 HTML 被快取就會把 A 的收藏送給 B，那是隱私問題。我兩個頁面用了不同解法：個股頁本來就是動態的，我直接讓它 per-user 渲染；但列表頁是我唯一做到靜態 ISR 的頁，我不想丟掉那個成果，所以維持靜態、把 ★ 做成 client island，hydrate 後才去取收藏狀態。build 輸出可以證明列表頁仍是 `○`。
>
> 順帶解掉一個 N+1：列表頁不是逐列問『這檔收藏了嗎』，而是一次拿回收藏 id 的集合，在記憶體判斷。
>
> 安全上，官方文件提醒 Server Function 可以被直接 POST 呼叫，所以我的防線不在 UI，而是 DAL 每次都做的 zod 驗證與 getUser()，加上資料庫的 RLS——就算程式全寫錯，RLS 也擋得住。」

---

## 附錄：本次改動的檔案

| 檔案 | 角色 |
|---|---|
| `app/stocks/actions.ts` | Server Action（toggle）+ Server Function（讀 id 集合） |
| `components/watchlist-button.tsx` | 個股頁 ★，`useOptimistic` 切換 |
| `components/watchlist-table.tsx` | 收藏頁清單，`useOptimistic` 移除列 |
| `components/stock-list.tsx` | 列表頁 island，手動樂觀 + 保住靜態快取 |
| `app/watchlist/page.tsx` | 收藏頁（未登入導向 /login） |
| `services/watchlist.ts` | DAL：`getWatchlist` / `getWatchlistState` / `getWatchlistStockIds` / add / remove |
| `lib/watchlist.ts` | 純層：schema、mapper、錯誤映射、文案 |
