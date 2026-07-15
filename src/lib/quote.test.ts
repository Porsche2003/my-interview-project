import { describe, it, expect } from 'vitest'
import { computeChange, formatPrice, formatPeRatio, formatVolume } from './quote'

describe('computeChange', () => {
  it('上漲：回傳正的漲跌與漲跌幅', () => {
    expect(computeChange(110, 100)).toEqual({ change: 10, changePercent: 10 })
  })

  it('下跌：回傳負值', () => {
    expect(computeChange(90, 100)).toEqual({ change: -10, changePercent: -10 })
  })

  it('平盤：回傳 0', () => {
    expect(computeChange(100, 100)).toEqual({ change: 0, changePercent: 0 })
  })

  it.each([
    [null, 100],
    [100, null],
    [100, 0], // 昨日為 0：不能除以零
  ])('缺值或昨日為 0 時回傳 null：current=%s previous=%s', (cur, prev) => {
    expect(computeChange(cur, prev)).toBeNull()
  })
})

describe('格式化', () => {
  it('formatVolume 加上千分位', () => {
    expect(formatVolume(37544470)).toBe('37,544,470')
  })

  it('formatPrice 固定兩位小數', () => {
    expect(formatPrice(2505)).toBe('2505.00')
  })

  it.each([formatPrice, formatPeRatio, formatVolume])(
    'null 一律顯示破折號',
    (fn) => {
      expect(fn(null)).toBe('—')
    }
  )
})
