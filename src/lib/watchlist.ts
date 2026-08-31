import { z } from 'zod'

// watchlist 領域的「純邏輯 + 型別」。
// 這裡刻意不 import 任何 Next / Supabase server 的東西，
// 才能被 Vitest 直接載入測試（server client 會相依 next/headers，測試環境載不動）。

// 台股代號的「健全性檢查」（sanity gate）——不是完整格式規格。
//
// 邊界值來自實際資料全量掃描（2395 檔，2026-08-26）：
//   長度分布：4 碼 1986 筆、5 碼 143 筆、6 碼 266 筆 → 範圍就是 4~6
//   字元集：全部落在 [0-9A-Z]，零例外
//   但「結構」很多變：純數字(2330)、數字+字母(00410A)、數字+字母+數字(2887Z1)
//   → 所以只約束長度與字元集，不硬套 /^\d{4}[A-Z]?$/ 這種樣式，否則會誤殺真實證券。
//
// 為什麼還是要驗：Server Action / DAL 的參數來自客戶端，是不可信輸入——
// TypeScript 的型別在 runtime 不存在，惡意呼叫可以送任何東西進來。
// 這層擋掉明顯垃圾（空字串、超長字串、小寫、符號）；至於「這檔到底存不存在」，
// 由資料庫的外鍵約束把關，那才是唯一的權威。
export const StockIdSchema = z.string().regex(/^[0-9A-Z]{4,6}$/)

// 用 z.infer 把型別接出來，避免手寫 interface 跟 schema 各改各的而漂移
export type StockId = z.infer<typeof StockIdSchema>

// mutation 失敗的原因代碼。刻意用「代碼」而非自由文字：
//   1. 不外洩內部細節：資料庫原始錯誤（表名、約束名、SQL 片段）絕不能回給客戶端，
//      那些只寫進 server log。回給呼叫端的永遠是這個封閉集合裡的值。
//   2. 型別安全：呼叫端 switch 這個 union 時，TypeScript 會檢查有沒有漏處理。
//   3. 顯示什麼文案是 UI 層的決定（也才好做多語系），DAL 不該綁死字串。
export type WatchlistErrorCode = 'unauthenticated' | 'invalid_stock_id' | 'db_error'

// mutation 的回傳：明確回報成敗，讓呼叫端（Server Action / UI）能據以更新畫面或顯示錯誤。
export type WatchlistMutation = { ok: true } | { ok: false; error: WatchlistErrorCode }

// Postgres 唯一鍵衝突的錯誤碼
export const UNIQUE_VIOLATION = '23505'

// 只取我們需要的形狀，不綁死 Supabase 的 PostgrestError 型別——
// 純函式不依賴外部套件型別，測試才好餵假資料。
export type DbErrorLike = { code?: string; message: string }

// 把資料庫錯誤映射成對外的結果。抽成純函式的理由：
// 「不外洩內部細節」是一個安全保證，保證就該有測試釘死；
// 混在 DAL 的 async 函式裡只能靠 mock Supabase 才測得到，那種測試又脆又假。
export function toWatchlistMutation(
  error: DbErrorLike | null | undefined,
  options: { duplicateIsSuccess?: boolean } = {}
): WatchlistMutation {
  if (!error) return { ok: true }

  // 加入收藏時，唯一鍵衝突代表「已經收藏過了」→ 結果已達成，視為冪等成功。
  // 移除收藏沒有這個語意，所以由呼叫端用 options 明確指定，而不是預設行為。
  if (options.duplicateIsSuccess && error.code === UNIQUE_VIOLATION) {
    return { ok: true }
  }

  // 核心保證：不論資料庫吐出什麼（表名、約束名、RLS policy 名稱、SQL 片段），
  // 回傳值永遠只有封閉集合裡的代碼。原始訊息由呼叫端寫進 server log。
  return { ok: false, error: 'db_error' }
}

// 錯誤代碼 → 使用者看得懂的中文訊息。
// 這是「UI 層決定文案」那個設計的落腳處：DAL 只回封閉的代碼，這裡翻成人話。
// 寫成純函式（而非散在元件裡的 if/else）才能被測試涵蓋，日後要做多語系也只改這裡。
// 用 Record 而非 switch：新增代碼到 WatchlistErrorCode 時，TypeScript 會強制你補上對應文案。
const ERROR_MESSAGES: Record<WatchlistErrorCode, string> = {
  unauthenticated: '請先登入才能使用收藏功能',
  invalid_stock_id: '股票代號格式不正確',
  db_error: '操作失敗，請稍後再試',
}

export function watchlistErrorMessage(code: WatchlistErrorCode): string {
  return ERROR_MESSAGES[code]
}

// 前端要用的乾淨型別（把 DB 巢狀結構攤平）
export type WatchlistItem = {
  id: string
  name: string
  market: string | null
  added_at: string // 加入收藏的時間（ISO）
}

// PostgREST 用外鍵巢狀 join 回來的原始列形狀：
// watchlist.stock_id → stocks.id 是「多對一」，所以 stocks 是「單一物件或 null」。
export type WatchlistJoinRow = {
  created_at: string
  stocks: { id: string; name: string; market: string | null } | null
}

// 把 join 結果轉成前端型別：
//   - 過濾掉 stocks 為 null 的孤兒列（理論上 FK + on delete cascade 不該發生，防禦性處理）
//   - 保留輸入順序（排序由查詢的 .order('created_at') 決定，這裡不重排）
export function mapWatchlistRows(rows: WatchlistJoinRow[]): WatchlistItem[] {
  const items: WatchlistItem[] = []
  for (const row of rows) {
    if (!row.stocks) continue
    items.push({
      id: row.stocks.id,
      name: row.stocks.name,
      market: row.stocks.market,
      added_at: row.created_at,
    })
  }
  return items
}
