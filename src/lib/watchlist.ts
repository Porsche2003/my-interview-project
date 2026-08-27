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
