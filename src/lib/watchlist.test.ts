import { describe, it, expect } from 'vitest'
import { mapWatchlistRows, StockIdSchema, type WatchlistJoinRow } from './watchlist'

describe('StockIdSchema', () => {
  // 這些全是資料庫裡真實存在的格式（2395 檔全量掃描歸納），不是想像出來的案例。
  it.each([
    ['2330', '4 碼純數字（最常見，1986 筆）'],
    ['0050', '4 碼、開頭為 0'],
    ['00878', '5 碼純數字'],
    ['00410A', '5 碼數字 + 大寫字母（ETF 變體）'],
    ['2887Z1', '數字 + 字母 + 數字（特別股；曾打臉過於嚴格的 regex）'],
    ['123456', '6 碼純數字'],
  ])('接受真實代號 %s（%s）', (id) => {
    expect(StockIdSchema.safeParse(id).success).toBe(true)
  })

  it.each([
    ['', '空字串'],
    ['233', '太短（3 碼）'],
    ['1234567', '太長（7 碼）'],
    ['2330a', '小寫字母'],
    ['23 30', '含空白'],
    ["2330'; DROP TABLE stocks;--", '注入字串'],
    ['../../etc/passwd', '路徑穿越字串'],
  ])('拒絕不合法輸入 %s（%s）', (bad) => {
    expect(StockIdSchema.safeParse(bad).success).toBe(false)
  })
})

describe('mapWatchlistRows', () => {
  it('把 join 列攤平成前端型別（created_at → added_at）', () => {
    const rows: WatchlistJoinRow[] = [
      {
        created_at: '2026-08-01T10:00:00Z',
        stocks: { id: '2330', name: '台積電', market: 'TWSE' },
      },
    ]
    expect(mapWatchlistRows(rows)).toEqual([
      { id: '2330', name: '台積電', market: 'TWSE', added_at: '2026-08-01T10:00:00Z' },
    ])
  })

  it('保留輸入順序（排序交給查詢層，mapper 不重排）', () => {
    const rows: WatchlistJoinRow[] = [
      { created_at: '2026-08-02T00:00:00Z', stocks: { id: '2317', name: '鴻海', market: 'TWSE' } },
      { created_at: '2026-08-01T00:00:00Z', stocks: { id: '2330', name: '台積電', market: 'TWSE' } },
    ]
    expect(mapWatchlistRows(rows).map((i) => i.id)).toEqual(['2317', '2330'])
  })

  // 防禦：理論上 FK + on delete cascade 不會有孤兒列，但若 join 回 null 也不能爆。
  it('過濾掉 stocks 為 null 的孤兒列', () => {
    const rows: WatchlistJoinRow[] = [
      { created_at: '2026-08-01T00:00:00Z', stocks: null },
      { created_at: '2026-08-01T00:00:00Z', stocks: { id: '2330', name: '台積電', market: 'TWSE' } },
    ]
    const result = mapWatchlistRows(rows)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2330')
  })

  it('market 為 null 時原樣保留（不硬填預設值）', () => {
    const rows: WatchlistJoinRow[] = [
      { created_at: '2026-08-01T00:00:00Z', stocks: { id: '9999', name: '某股', market: null } },
    ]
    expect(mapWatchlistRows(rows)[0].market).toBeNull()
  })

  it('空輸入 → 空輸出', () => {
    expect(mapWatchlistRows([])).toEqual([])
  })
})
