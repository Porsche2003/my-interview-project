import { describe, it, expect } from 'vitest'
import { rocDateToIso } from './roc-date'

describe('rocDateToIso', () => {
  it('把民國年日期轉成西元 ISO 格式', () => {
    // 民國 115 年 + 1911 = 西元 2026
    expect(rocDateToIso('1150701')).toBe('2026-07-01')
  })

  it('正確處理民國 100 年（+1911 的邊界）', () => {
    expect(rocDateToIso('1000101')).toBe('2011-01-01')
  })

  it('保留月與日的前導零', () => {
    expect(rocDateToIso('1120305')).toBe('2023-03-05')
  })

  // 一次驗證多種壞格式：不是 7 位純數字時應該丟出錯誤，
  // 這樣 API 哪天改格式，會「大聲壞掉」而不是默默寫入錯誤日期。
  it.each(['115070', '11507011', '', 'abcdefg', '115-07-01'])(
    '格式不是 7 位數字時丟出錯誤："%s"',
    (bad) => {
      expect(() => rocDateToIso(bad)).toThrow()
    }
  )
})
