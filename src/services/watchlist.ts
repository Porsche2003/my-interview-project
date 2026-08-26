import { createClient } from '@/utils/supabase/server'
import {
  mapWatchlistRows,
  StockIdSchema,
  type WatchlistItem,
  type WatchlistJoinRow,
} from '@/lib/watchlist'

// mutation 失敗的原因代碼。刻意用「代碼」而非自由文字：
//   1. 不外洩內部細節：資料庫原始錯誤（表名、約束名、SQL 片段）絕不能回給客戶端，
//      那些只寫進 server log。回給呼叫端的永遠是這個封閉集合裡的值。
//   2. 型別安全：呼叫端 switch 這個 union 時，TypeScript 會檢查有沒有漏處理。
//   3. 顯示什麼文案是 UI 層的決定（也才好做多語系），DAL 不該綁死字串。
export type WatchlistErrorCode = 'unauthenticated' | 'invalid_stock_id' | 'db_error'

// mutation 的回傳：明確回報成敗，讓呼叫端（Server Action / UI）能據以更新畫面或顯示錯誤。
export type WatchlistMutation = { ok: true } | { ok: false; error: WatchlistErrorCode }

// watchlist 是「私人、每人不同、會變動」的資料，和公開的 stocks 完全相反：
//   - 用 cookie-based 的 server client（要 auth.uid() 才知道現在是誰）
//   - 絕不快取（每人不同 + 會變動，快取會出現張冠李戴或髒讀）
//   - 安全靠兩層：DAL 內先 getUser() 擋掉未登入；DB 層再由 RLS（auth.uid() = user_id）強制隔離

// 列出目前登入使用者的收藏（join stocks 取名稱/市場）。未登入 → 空陣列。
export async function getWatchlist(): Promise<WatchlistItem[]> {
  const supabase = await createClient()

  // RLS 的 select policy（auth.uid() = user_id）會自動只回「本人」的列，
  // 所以這裡不必手動 .eq('user_id', ...)；未登入時 auth.uid() 為 null → 回 0 列。
  const { data, error } = await supabase
    .from('watchlist')
    .select('created_at, stocks ( id, name, market )')
    .order('created_at', { ascending: false }) // 最近加入的排前面

  if (error) {
    console.error('DAL Error fetching watchlist:', error.message)
    return []
  }

  // 專案未生成 DB 型別，join 結果是鬆散型別，用 pure mapper 收斂成前端型別（並防禦孤兒列）。
  return mapWatchlistRows((data ?? []) as unknown as WatchlistJoinRow[])
}

// 個股頁用：判斷「這檔是否已在我的收藏」。未登入或查無 → false。
export async function isWatchlisted(stockId: string): Promise<boolean> {
  // 輸入驗證擋在最前面：格式就不對的代號不可能在收藏裡，直接回 false，省一趟 DB。
  if (!StockIdSchema.safeParse(stockId).success) return false

  const supabase = await createClient()

  // RLS 已限定本人；複合主鍵 (user_id, stock_id) 保證最多一列，故 maybeSingle 安全。
  const { data, error } = await supabase
    .from('watchlist')
    .select('stock_id')
    .eq('stock_id', stockId)
    .maybeSingle()

  if (error) return false
  return data !== null
}

// 加入收藏。需要登入：insert 必須寫 user_id，且 RLS with check 要求 auth.uid() = user_id。
export async function addToWatchlist(stockId: string): Promise<WatchlistMutation> {
  // 信任邊界：先驗輸入格式，再談身份與寫入。
  if (!StockIdSchema.safeParse(stockId).success) {
    return { ok: false, error: 'invalid_stock_id' }
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false, error: 'unauthenticated' }

  const { error } = await supabase
    .from('watchlist')
    .insert({ user_id: user.id, stock_id: stockId })

  if (error) {
    // 23505 = unique_violation：已經收藏過了。視為「冪等成功」而非錯誤——
    // 使用者重複點「收藏」不該噴錯，結果（已在收藏中）已經達成。
    if (error.code === '23505') return { ok: true }
    // 原始訊息只進 server log；回給呼叫端的是代碼，避免洩漏資料庫內部細節。
    console.error('DAL Error adding to watchlist:', error.message)
    return { ok: false, error: 'db_error' }
  }
  return { ok: true }
}

// 移除收藏。RLS 的 delete policy（auth.uid() = user_id）已保證只能刪自己的列，
// 所以只需依 stock_id 篩選；user_id 條件由 policy 在 DB 端補上。
export async function removeFromWatchlist(stockId: string): Promise<WatchlistMutation> {
  if (!StockIdSchema.safeParse(stockId).success) {
    return { ok: false, error: 'invalid_stock_id' }
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false, error: 'unauthenticated' }

  const { error } = await supabase
    .from('watchlist')
    .delete()
    .eq('stock_id', stockId)

  if (error) {
    // 同上：細節進 log，不外洩給呼叫端。
    console.error('DAL Error removing from watchlist:', error.message)
    return { ok: false, error: 'db_error' }
  }
  return { ok: true }
}
