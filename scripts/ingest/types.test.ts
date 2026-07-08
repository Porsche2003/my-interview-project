import { describe, it, expect } from 'vitest'
import { numOrNull, TwseQuoteRowSchema } from './types'

describe('numOrNull', () => {
  it('解析正常的數字字串', () => {
    expect(numOrNull('33.68')).toBe(33.68)
  })

  it('移除千分位逗號後再解析', () => {
    expect(numOrNull('37,544,470')).toBe(37544470)
  })

  it('把 "0" 正確保留為 0（不可誤判成空值）', () => {
    // 這是容易寫錯的地方：若用「falsy 判斷」會把 0 當成空值
    expect(numOrNull('0')).toBe(0)
  })

  // ETF 沒有本益比、停牌股票沒有收盤價，來源 API 會回傳這些空值變體，
  // 全部要轉成 null，不能讓 NaN 或空字串汙染資料庫。
  it.each([undefined, '', '   ', '-', 'N/A', 'abc'])(
    '無效或空值一律回傳 null：%s',
    (raw) => {
      expect(numOrNull(raw)).toBeNull()
    }
  )
})

describe('TwseQuoteRowSchema', () => {
  it('接受欄位齊全的原始資料', () => {
    const row = {
      Date: '1150701',
      Code: '2330',
      Name: '台積電',
      ClosingPrice: '2505.00',
      TradeVolume: '37544470',
    }
    expect(() => TwseQuoteRowSchema.parse(row)).not.toThrow()
  })

  it('缺少欄位時驗證失敗（及早發現 API 改格式）', () => {
    const bad = { Date: '1150701', Code: '2330' }
    expect(() => TwseQuoteRowSchema.parse(bad)).toThrow()
  })
})
