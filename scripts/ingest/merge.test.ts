import { describe, it, expect } from 'vitest'
import {
  mergeQuotes,
  type MergeQuoteInput,
  type MergePeInput,
} from './merge'

// 一檔股票報價的預設值，測試裡只覆寫要驗的欄位，讓每個案例聚焦。
function quote(overrides: Partial<MergeQuoteInput> = {}): MergeQuoteInput {
  return {
    stockId: '2330',
    stockName: '台積電',
    market: 'TWSE',
    tradeDate: '2026-07-15',
    closePrice: 2505,
    volume: 37544470,
    ...overrides,
  }
}

function pe(overrides: Partial<MergePeInput> = {}): MergePeInput {
  return {
    stockId: '2330',
    tradeDate: '2026-07-15',
    peRatio: 28.5,
    ...overrides,
  }
}

describe('mergeQuotes', () => {
  it('同代號、同交易日 → 採用該 PE', () => {
    const [row] = mergeQuotes([quote()], [pe()])
    expect(row.peRatio).toBe(28.5)
  })

  // 這就是本檔要根治的 bug：兩支 API 公布日期落差一天時，
  // 絕不能把前一日的 PE 接到當日報價，PE 必須設 null。
  it('PE 端點日期落後一天 → PE 設 null，但報價照常保留', () => {
    const [row] = mergeQuotes(
      [quote({ tradeDate: '2026-07-15' })],
      [pe({ tradeDate: '2026-07-14' })]
    )
    expect(row.peRatio).toBeNull()
    // 價格/成交量對 tradeDate 是正確的，不受 PE 不同步影響
    expect(row.closePrice).toBe(2505)
    expect(row.volume).toBe(37544470)
    expect(row.tradeDate).toBe('2026-07-15')
  })

  it('PE 端點沒有這檔股票 → PE 設 null', () => {
    const [row] = mergeQuotes([quote({ stockId: '2330' })], [pe({ stockId: '2317' })])
    expect(row.peRatio).toBeNull()
  })

  it('PE 端點整批為空（如當天只抓到報價）→ 全部 PE 設 null，報價仍完整', () => {
    const result = mergeQuotes([quote()], [])
    expect(result).toHaveLength(1)
    expect(result[0].peRatio).toBeNull()
    expect(result[0].closePrice).toBe(2505)
  })

  it('PE 值本身就是 null（ETF 無本益比）→ 維持 null', () => {
    const [row] = mergeQuotes([quote()], [pe({ peRatio: null })])
    expect(row.peRatio).toBeNull()
  })

  it('PE 為 0 時要保留 0，不可被誤判成空值', () => {
    const [row] = mergeQuotes([quote()], [pe({ peRatio: 0 })])
    expect(row.peRatio).toBe(0)
  })

  it('多檔混合：同步的採用、不同步的設 null，各自獨立判斷', () => {
    const quotes: MergeQuoteInput[] = [
      quote({ stockId: '2330', tradeDate: '2026-07-15' }),
      quote({ stockId: '2317', tradeDate: '2026-07-15' }),
    ]
    const peRatios: MergePeInput[] = [
      pe({ stockId: '2330', tradeDate: '2026-07-15', peRatio: 28.5 }), // 同步
      pe({ stockId: '2317', tradeDate: '2026-07-14', peRatio: 10.1 }), // 落後一天
    ]
    const result = mergeQuotes(quotes, peRatios)
    expect(result.find((r) => r.stockId === '2330')?.peRatio).toBe(28.5)
    expect(result.find((r) => r.stockId === '2317')?.peRatio).toBeNull()
  })

  it('輸出筆數以報價為準（PE 多出來的代號不會憑空產生報價列）', () => {
    const result = mergeQuotes([quote()], [pe(), pe({ stockId: '9999' })])
    expect(result).toHaveLength(1)
  })
})
