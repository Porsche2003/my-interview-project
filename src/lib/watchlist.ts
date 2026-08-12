// watchlist 領域的「純邏輯 + 型別」。
// 這裡刻意不 import 任何 Next / Supabase server 的東西，
// 才能被 Vitest 直接載入測試（server client 會相依 next/headers，測試環境載不動）。

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
