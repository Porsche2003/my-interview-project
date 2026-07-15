import { cache } from 'react'
import { createClient } from '@/utils/supabase/server'

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

// 用 React 的 cache() 記憶化：同一次請求裡（頁面本體 + generateMetadata）
// 重複呼叫同一個 id，只會實際查一次資料庫。
export const getStockDetail = cache(
  async (id: string): Promise<StockDetail | null> => {
    const supabase = await createClient()

    const { data: stock, error } = await supabase
      .from('stocks')
      .select('*')
      .eq('id', id)
      .maybeSingle() // 查無資料時回傳 null 而非丟錯，方便頁面判斷 404

    if (error || !stock) return null

    const { data: quotes } = await supabase
      .from('daily_quotes')
      .select('*')
      .eq('stock_id', id)
      .order('trade_date', { ascending: false })
      .limit(30)

    return { stock: stock as Stock, quotes: (quotes ?? []) as Quote[] }
  }
)

// 列表頁用：目前僅依代號排序取前 N 檔。完整的搜尋/產業/市場篩選待後續實作。
export async function listStocks(limit = 100): Promise<Stock[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('stocks')
    .select('*')
    .order('id')
    .limit(limit)

  if (error) return []
  return (data ?? []) as Stock[]
}
