import { createClient } from '@/utils/supabase/server'
import {
  mapWatchlistRows,
  StockIdSchema,
  toWatchlistMutation,
  type WatchlistItem,
  type WatchlistJoinRow,
  type WatchlistMutation,
} from '@/lib/watchlist'

// 型別定義在 lib（純層）與 pure mapper 放一起，這裡轉出給呼叫端，
// 讓 UI / Server Action 可以只從 services 這個入口 import。
export type { WatchlistErrorCode, WatchlistMutation } from '@/lib/watchlist'

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

// 個股頁的 ★ 按鈕需要的狀態。一次回傳兩件事，避免頁面為了「登入了嗎」和
// 「收藏了嗎」跑兩趟 auth 驗證。未登入時 isWatched 一律 false（也不必查 DB）。
export type WatchlistState = { isLoggedIn: boolean; isWatched: boolean }

export async function getWatchlistState(stockId: string): Promise<WatchlistState> {
  if (!StockIdSchema.safeParse(stockId).success) {
    return { isLoggedIn: false, isWatched: false }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { isLoggedIn: false, isWatched: false }

  // RLS 已限定本人；複合主鍵 (user_id, stock_id) 保證最多一列，故 maybeSingle 安全。
  const { data, error } = await supabase
    .from('watchlist')
    .select('stock_id')
    .eq('stock_id', stockId)
    .maybeSingle()

  if (error) {
    // 讀取失敗不該讓整頁掛掉：登入狀態仍然有效，收藏狀態退回「未收藏」。
    console.error('DAL Error reading watchlist state:', error.message)
    return { isLoggedIn: true, isWatched: false }
  }
  return { isLoggedIn: true, isWatched: data !== null }
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

  // 「錯誤長什麼樣」交給 pure mapper 決定（含唯一鍵衝突視為冪等成功），
  // 這裡只負責 I/O 與 log：原始訊息寫進 server log，永遠不回給呼叫端。
  const result = toWatchlistMutation(error, { duplicateIsSuccess: true })
  if (!result.ok && error) {
    console.error('DAL Error adding to watchlist:', error.message)
  }
  return result
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

  // 同上。移除沒有「重複即成功」的語意，所以不帶 duplicateIsSuccess。
  const result = toWatchlistMutation(error)
  if (!result.ok && error) {
    console.error('DAL Error removing from watchlist:', error.message)
  }
  return result
}
