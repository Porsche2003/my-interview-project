import { z } from 'zod'
import { fetchJsonWithRetry } from './http'
import { rocDateToIso } from './roc-date'
import {
  TpexQuoteRowSchema,
  TpexPeRatioRowSchema,
  numOrNull,
  type NormalizedQuote,
} from './types'
import {
  mergeQuotes,
  logPeDateSkew,
  type MergeQuoteInput,
  type MergePeInput,
} from './merge'

const TPEX_QUOTES_URL = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes'
const TPEX_PE_RATIO_URL = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis'

// 上櫃（TPEx）：和 TWSE 一樣是兩支 API，用「SecuritiesCompanyCode」合併。
// 同樣先正規化再交給 mergeQuotes 做「同代號＋同交易日」的日期一致性檢查（見 merge.ts）。
export async function fetchTpexQuotes(): Promise<NormalizedQuote[]> {
  const [rawQuotes, rawPeRatios] = await Promise.all([
    fetchJsonWithRetry(TPEX_QUOTES_URL),
    fetchJsonWithRetry(TPEX_PE_RATIO_URL),
  ])

  const quotes = z.array(TpexQuoteRowSchema).parse(rawQuotes)
  const peRatios = z.array(TpexPeRatioRowSchema).parse(rawPeRatios)

  const quoteInputs: MergeQuoteInput[] = quotes.map((q) => ({
    stockId: q.SecuritiesCompanyCode,
    stockName: q.CompanyName,
    market: 'TPEX',
    tradeDate: rocDateToIso(q.Date),
    closePrice: numOrNull(q.Close),
    volume: numOrNull(q.TradingShares),
  }))

  const peInputs: MergePeInput[] = peRatios.map((r) => ({
    stockId: r.SecuritiesCompanyCode,
    tradeDate: rocDateToIso(r.Date),
    peRatio: numOrNull(r.PriceEarningRatio),
  }))

  logPeDateSkew('TPEx', quoteInputs, peInputs)
  return mergeQuotes(quoteInputs, peInputs)
}
