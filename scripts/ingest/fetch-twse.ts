import { z } from 'zod'
import { fetchJsonWithRetry } from './http'
import { rocDateToIso } from './roc-date'
import {
  TwseQuoteRowSchema,
  TwsePeRatioRowSchema,
  numOrNull,
  type NormalizedQuote,
} from './types'
import {
  mergeQuotes,
  logPeDateSkew,
  type MergeQuoteInput,
  type MergePeInput,
} from './merge'

const STOCK_DAY_ALL_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'
const BWIBBU_ALL_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL'

// 上市（TWSE）：收盤價/成交量 與 本益比 是兩支不同的 API。
// 先各自正規化成合併層的輸入，再交給 mergeQuotes 用「同代號＋同交易日」合併，
// 避免兩支 API 公布日期落差時把前一日 PE 接到當日報價（見 merge.ts）。
export async function fetchTwseQuotes(): Promise<NormalizedQuote[]> {
  const [rawQuotes, rawPeRatios] = await Promise.all([
    fetchJsonWithRetry(STOCK_DAY_ALL_URL),
    fetchJsonWithRetry(BWIBBU_ALL_URL),
  ])

  const quotes = z.array(TwseQuoteRowSchema).parse(rawQuotes)
  const peRatios = z.array(TwsePeRatioRowSchema).parse(rawPeRatios)

  const quoteInputs: MergeQuoteInput[] = quotes.map((q) => ({
    stockId: q.Code,
    stockName: q.Name,
    market: 'TWSE',
    tradeDate: rocDateToIso(q.Date),
    closePrice: numOrNull(q.ClosingPrice),
    volume: numOrNull(q.TradeVolume),
  }))

  const peInputs: MergePeInput[] = peRatios.map((r) => ({
    stockId: r.Code,
    tradeDate: rocDateToIso(r.Date),
    peRatio: numOrNull(r.PEratio),
  }))

  logPeDateSkew('TWSE', quoteInputs, peInputs)
  return mergeQuotes(quoteInputs, peInputs)
}
