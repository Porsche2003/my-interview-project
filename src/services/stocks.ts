import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { supabasePublic } from '@/utils/supabase/public'

export type Stock = {
  id: string
  name: string
  market: string | null
  created_at: string
}

export type Quote = {
  stock_id: string
  trade_date: string
  close_price: number | null
  pe_ratio: number | null
  volume: number | null
  created_at: string
}

export type StockDetail = { stock: Stock; quotes: Quote[] } // quotes 依日期新→舊排序

// 快取標籤：單一來源。ingest 寫完資料後打 /api/revalidate → revalidateTag(此值)，
// 就能精準清掉下面兩個函式的快取。字串只寫在這裡一次，避免兩地打錯字對不上。
export const STOCKS_CACHE_TAG = 'stocks'

// 資料一天只更新一次、且對所有訪客相同 → 用 unstable_cache 把 DB 查詢結果快取起來，
// 把「每個請求查一次 DB」塌縮成「每個 revalidation 週期查一次」。
// revalidate: 3600 = 保底 TTL（就算 webhook 沒打到，最多一小時後也會自己更新）。
// tags: 讓 ingest 能用 revalidateTag 做 on-demand 精準失效（當天就更新，不用等 TTL）。
//
// ⚠️ 這裡一律用 supabasePublic（無 cookie）。unstable_cache 內不能讀 cookie，
//    若用 server.ts 的 createClient() 會壞。公開頁本來也不需要使用者 session。

// getStockDetail 在同一次請求裡被呼叫兩次（generateMetadata + 頁面本體），
// 所以外層再包一層 React cache() 做「單請求記憶化」：同一 render 內同一 id 只走一次快取查詢。
//   - 內層 unstable_cache：跨請求、跨部署的持久資料快取（可被 tag 清除）
//   - 外層 React cache()：單一 render pass 內的去重（純記憶體、不跨請求）
const getStockDetailCached = unstable_cache(
  async (id: string): Promise<StockDetail | null> => {
    const { data: stock, error } = await supabasePublic
      .from('stocks')
      .select('*')
      .eq('id', id)
      .maybeSingle() // 查無資料時回 null 而非丟錯，方便頁面判斷 404

    if (error || !stock) return null

    const { data: quotes } = await supabasePublic
      .from('daily_quotes')
      .select('*')
      .eq('stock_id', id)
      .order('trade_date', { ascending: false })
      .limit(30)

    return { stock: stock as Stock, quotes: (quotes ?? []) as Quote[] }
  },
  ['stock-detail'], // 快取鍵前綴；呼叫時的參數 id 會自動併入鍵，不同股票各自快取
  { tags: [STOCKS_CACHE_TAG], revalidate: 3600 }
)

export const getStockDetail = cache(getStockDetailCached)

// 列表頁用：目前僅依代號排序取前 N 檔。完整的搜尋/產業/市場篩選待後續實作。
export const listStocks = unstable_cache(
  async (limit = 100): Promise<Stock[]> => {
    const { data, error } = await supabasePublic
      .from('stocks')
      .select('*')
      .order('id')
      .limit(limit)

    if (error) return []
    return (data ?? []) as Stock[]
  },
  ['stocks-list'],
  { tags: [STOCKS_CACHE_TAG], revalidate: 3600 }
)
