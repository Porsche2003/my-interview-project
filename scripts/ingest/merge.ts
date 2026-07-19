import type { NormalizedQuote } from './types'

// 報價端點（收盤/成交量）與本益比端點是兩支獨立的 API，各自帶自己的公布日期。
// 兩者公布時間偶爾會落差一天（例：STOCK_DAY_ALL 已是 7/15，BWIBBU_ALL 還停在 7/14）。
// 若只用股票代號 join，就會把「前一日的 PE」靜靜接到「當日的報價」上，汙染資料。
// 因此這一層要求：同一檔股票、且 PE 端點日期與報價日期一致，才採用該 PE，否則設 null
//（保留正確的價格時序，本益比存疑就留白，不中斷）。

export type MergeQuoteInput = {
  stockId: string
  stockName: string
  market: 'TWSE' | 'TPEX'
  tradeDate: string // ISO 'YYYY-MM-DD'
  closePrice: number | null
  volume: number | null
}

export type MergePeInput = {
  stockId: string
  tradeDate: string // ISO 'YYYY-MM-DD'，取自 PE 端點自己的日期欄位
  peRatio: number | null
}

export function mergeQuotes(
  quotes: readonly MergeQuoteInput[],
  peRatios: readonly MergePeInput[]
): NormalizedQuote[] {
  const peByCode = new Map(peRatios.map((p) => [p.stockId, p]))

  return quotes.map((q) => {
    const pe = peByCode.get(q.stockId)
    // 只有「同一檔、同一交易日」的 PE 才採用；日期不同步或查無 → null
    const peInSync = pe !== undefined && pe.tradeDate === q.tradeDate
    return {
      stockId: q.stockId,
      stockName: q.stockName,
      market: q.market,
      tradeDate: q.tradeDate,
      closePrice: q.closePrice,
      peRatio: peInSync ? pe.peRatio : null,
      volume: q.volume,
    }
  })
}

// 觀測用：兩支 API 都是單日快照，用第一筆的日期當代表日期。
// 若兩端點日期不同步就大聲印一行警告，讓 GitHub Actions 的 log 能看到
//「今天 PE 被整批設為 null」這件事，而不是默默發生。
export function logPeDateSkew(
  market: string,
  quotes: readonly { tradeDate: string }[],
  peRatios: readonly { tradeDate: string }[]
): void {
  const quoteDate = quotes[0]?.tradeDate
  const peDate = peRatios[0]?.tradeDate
  if (quoteDate && peDate && quoteDate !== peDate) {
    console.warn(
      `[ingest] ${market} 報價(${quoteDate})與本益比(${peDate})日期不同步，本批本益比一律設為 null`
    )
  }
}
