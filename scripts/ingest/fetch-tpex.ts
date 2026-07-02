import { z } from 'zod'
import { fetchJsonWithRetry } from './http'
import { rocDateToIso } from './roc-date'
import {
  TpexQuoteRowSchema,
  TpexPeRatioRowSchema,
  numOrNull,
  type NormalizedQuote,
} from './types'

const TPEX_QUOTES_URL = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes'
const TPEX_PE_RATIO_URL = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis'

// 上櫃（TPEx）：和 TWSE 一樣是兩支 API，用「SecuritiesCompanyCode」合併。
export async function fetchTpexQuotes(): Promise<NormalizedQuote[]> {
  const [rawQuotes, rawPeRatios] = await Promise.all([
    fetchJsonWithRetry(TPEX_QUOTES_URL),
    fetchJsonWithRetry(TPEX_PE_RATIO_URL),
  ])

  const quotes = z.array(TpexQuoteRowSchema).parse(rawQuotes)
  const peRatios = z.array(TpexPeRatioRowSchema).parse(rawPeRatios)
  const peByCode = new Map(
    peRatios.map((r) => [r.SecuritiesCompanyCode, r.PriceEarningRatio])
  )

  return quotes.map((q) => ({
    stockId: q.SecuritiesCompanyCode,
    stockName: q.CompanyName,
    market: 'TPEX' as const,
    tradeDate: rocDateToIso(q.Date),
    closePrice: numOrNull(q.Close),
    peRatio: numOrNull(peByCode.get(q.SecuritiesCompanyCode)),
    volume: numOrNull(q.TradingShares),
  }))
}
