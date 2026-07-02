import { supabaseAdmin } from './supabase-admin'
import type { NormalizedQuote } from './types'

const BATCH_SIZE = 500

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

export async function upsertQuotes(quotes: NormalizedQuote[]): Promise<void> {
  // 1. 先 upsert 股票主檔（同一檔會在多筆報價中重複出現，用 Map 依代號去重）
  const stocksById = new Map(
    quotes.map((q) => [
      q.stockId,
      { id: q.stockId, name: q.stockName, market: q.market },
    ])
  )

  for (const batch of chunk(Array.from(stocksById.values()), BATCH_SIZE)) {
    const { error } = await supabaseAdmin
      .from('stocks')
      .upsert(batch, { onConflict: 'id' })
    if (error) throw new Error(`upsert stocks 失敗: ${error.message}`)
  }

  // 2. 再 upsert 每日報價。複合主鍵 (stock_id, trade_date) 保證重跑同一天不會重複。
  const quoteRows = quotes.map((q) => ({
    stock_id: q.stockId,
    trade_date: q.tradeDate,
    close_price: q.closePrice,
    pe_ratio: q.peRatio,
    volume: q.volume,
  }))

  for (const batch of chunk(quoteRows, BATCH_SIZE)) {
    const { error } = await supabaseAdmin
      .from('daily_quotes')
      .upsert(batch, { onConflict: 'stock_id,trade_date' })
    if (error) throw new Error(`upsert daily_quotes 失敗: ${error.message}`)
  }
}
