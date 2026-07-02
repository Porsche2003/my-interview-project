import { z } from 'zod'
import { fetchJsonWithRetry } from './http'
import { rocDateToIso } from './roc-date'
import {
  TwseQuoteRowSchema,
  TwsePeRatioRowSchema,
  numOrNull,
  type NormalizedQuote,
} from './types'

const STOCK_DAY_ALL_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'
const BWIBBU_ALL_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL'

// 上市（TWSE）：收盤價/成交量 與 本益比 是兩支不同的 API，用股票代號合併。
export async function fetchTwseQuotes(): Promise<NormalizedQuote[]> {
  const [rawQuotes, rawPeRatios] = await Promise.all([
    fetchJsonWithRetry(STOCK_DAY_ALL_URL),
    fetchJsonWithRetry(BWIBBU_ALL_URL),
  ])

  const quotes = z.array(TwseQuoteRowSchema).parse(rawQuotes)
  const peRatios = z.array(TwsePeRatioRowSchema).parse(rawPeRatios)
  const peByCode = new Map(peRatios.map((r) => [r.Code, r.PEratio]))

  return quotes.map((q) => ({
    stockId: q.Code,
    stockName: q.Name,
    market: 'TWSE' as const,
    tradeDate: rocDateToIso(q.Date),
    closePrice: numOrNull(q.ClosingPrice),
    peRatio: numOrNull(peByCode.get(q.Code)),
    volume: numOrNull(q.TradeVolume),
  }))
}
