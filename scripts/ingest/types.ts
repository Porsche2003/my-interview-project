import { z } from 'zod'

// 四支來源 API 的原始格式。這裡只驗證「形狀」（欄位存在且是字串），
// 數值解析（"" → null、字串轉數字）交給 normalize 那層處理，關注點分離。

export const TwseQuoteRowSchema = z.object({
  Date: z.string(),
  Code: z.string(),
  Name: z.string(),
  ClosingPrice: z.string(),
  TradeVolume: z.string(),
})
export type TwseQuoteRow = z.infer<typeof TwseQuoteRowSchema>

export const TwsePeRatioRowSchema = z.object({
  Date: z.string(),
  Code: z.string(),
  PEratio: z.string(),
})
export type TwsePeRatioRow = z.infer<typeof TwsePeRatioRowSchema>

export const TpexQuoteRowSchema = z.object({
  Date: z.string(),
  SecuritiesCompanyCode: z.string(),
  CompanyName: z.string(),
  Close: z.string(),
  TradingShares: z.string(),
})
export type TpexQuoteRow = z.infer<typeof TpexQuoteRowSchema>

export const TpexPeRatioRowSchema = z.object({
  Date: z.string(),
  SecuritiesCompanyCode: z.string(),
  PriceEarningRatio: z.string(),
})
export type TpexPeRatioRow = z.infer<typeof TpexPeRatioRowSchema>

// 正規化後、要寫進 Supabase 的統一格式（對應 stocks + daily_quotes 兩張表）
export type NormalizedQuote = {
  stockId: string
  stockName: string
  market: 'TWSE' | 'TPEX'
  tradeDate: string // ISO 格式 'YYYY-MM-DD'
  closePrice: number | null
  peRatio: number | null
  volume: number | null
}

// 兩支 API 的數值欄位常見空值：""、"-"、"N/A"
export function numOrNull(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed === '-' || trimmed === 'N/A') return null
  const n = Number(trimmed.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}
