'use server'

import { addToWatchlist, removeFromWatchlist } from '@/services/watchlist'
import type { WatchlistMutation } from '@/services/watchlist'

// 個股頁 ★ 按鈕用的 Server Action。
//
// 這一層刻意很薄：只決定「要加還是要移除」，其餘一律交給 DAL。
// 商業規則（重複收藏視為冪等成功）、輸入驗證（StockIdSchema）、身份驗證
// （getUser）、資料隔離（RLS）全部在下層，這裡不重複實作也不繞過。
//
// ⚠️ 安全重點（Next 官方文件明載）：Server Function 可以被「直接 POST 呼叫」，
// 不只是透過你的 UI。所以絕不能假設「按鈕沒顯示，使用者就不會呼叫」——
// 攻擊者可以直接打這個 action、帶任意 stockId 和任意 shouldWatch。
// 我們的防線不在 UI，而在 DAL 內部每次都做的 getUser() + zod 驗證 + DB 的 RLS。
//
// 為什麼不用 revalidatePath：watchlist 是每人不同的私人資料，本來就沒有被快取，
// 沒有快取要清。畫面更新由呼叫端的樂觀更新負責（見 components/watchlist-button.tsx）。
// 等日後做出 /watchlist 列表頁、需要跨頁同步時，再用 next/cache 的 refresh() 處理。
export async function toggleWatchlistAction(
  stockId: string,
  shouldWatch: boolean
): Promise<WatchlistMutation> {
  return shouldWatch
    ? await addToWatchlist(stockId)
    : await removeFromWatchlist(stockId)
}
