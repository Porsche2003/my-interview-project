import { describe, it, expect } from 'vitest'
import {
  mapWatchlistRows,
  StockIdSchema,
  toWatchlistMutation,
  UNIQUE_VIOLATION,
  type DbErrorLike,
  type WatchlistJoinRow,
} from './watchlist'

describe('toWatchlistMutation — 正常路徑', () => {
  it('沒有錯誤 → 成功', () => {
    expect(toWatchlistMutation(null)).toEqual({ ok: true })
  })

  it('加入收藏遇到唯一鍵衝突 → 冪等成功（重複點收藏不該噴錯）', () => {
    const dup: DbErrorLike = {
      code: UNIQUE_VIOLATION,
      message: 'duplicate key value violates unique constraint "watchlist_pkey"',
    }
    expect(toWatchlistMutation(dup, { duplicateIsSuccess: true })).toEqual({ ok: true })
  })

  it('移除收藏遇到同一個錯誤 → 仍算失敗（沒有「重複即成功」的語意）', () => {
    const dup: DbErrorLike = { code: UNIQUE_VIOLATION, message: 'duplicate key value' }
    expect(toWatchlistMutation(dup)).toEqual({ ok: false, error: 'db_error' })
  })
})

describe('toWatchlistMutation — 錯誤路徑不外洩內部細節', () => {
  // 真實世界的 Postgres / PostgREST 錯誤，訊息裡都帶著不該外流的內部資訊：
  // 表名、約束名、RLS policy 描述、schema 名稱。
  const leakyErrors: { label: string; error: DbErrorLike; secrets: string[] }[] = [
    {
      label: '資料表不存在（洩漏 schema/表名）',
      error: { code: '42P01', message: 'relation "public.watchlist" does not exist' },
      secrets: ['public.watchlist', 'relation'],
    },
    {
      label: '外鍵違反（洩漏約束名）',
      error: {
        code: '23503',
        message:
          'insert or update on table "watchlist" violates foreign key constraint "watchlist_stock_id_fkey"',
      },
      secrets: ['watchlist_stock_id_fkey', 'foreign key constraint'],
    },
    {
      label: 'RLS 擋下（洩漏安全機制細節）',
      error: {
        code: '42501',
        message: 'new row violates row-level security policy for table "watchlist"',
      },
      secrets: ['row-level security policy'],
    },
    {
      label: '未知錯誤（沒有 code）',
      error: { message: 'connection terminated unexpectedly at 10.0.0.42:5432' },
      secrets: ['10.0.0.42', '5432'],
    },
  ]

  it.each(leakyErrors)('$label → 一律回 db_error', ({ error }) => {
    expect(toWatchlistMutation(error)).toEqual({ ok: false, error: 'db_error' })
  })

  // 這是本檔最重要的一個測試：把回傳值整個序列化，確認資料庫的原始訊息
  // 一個字都沒有跟著跑出去。若日後有人為了 debug 方便把 error.message 加回
  // 回傳值裡，這個測試會立刻變紅。
  it.each(leakyErrors)('$label → 回傳值不含任何原始訊息片段', ({ error, secrets }) => {
    const serialized = JSON.stringify(toWatchlistMutation(error))
    expect(serialized).not.toContain(error.message)
    for (const secret of secrets) {
      expect(serialized).not.toContain(secret)
    }
  })

  // 就算加上 duplicateIsSuccess，非 23505 的錯誤也不能因此被誤判成成功
  it('duplicateIsSuccess 只對 23505 生效，不會放過其他錯誤', () => {
    const other: DbErrorLike = { code: '23503', message: 'foreign key violation' }
    expect(toWatchlistMutation(other, { duplicateIsSuccess: true })).toEqual({
      ok: false,
      error: 'db_error',
    })
  })

  // 封閉集合保證：對外的錯誤值只可能是這三個代碼之一
  it('失敗時的 error 值必定落在封閉的代碼集合內', () => {
    const allowed = ['unauthenticated', 'invalid_stock_id', 'db_error']
    for (const { error } of leakyErrors) {
      const result = toWatchlistMutation(error)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(allowed).toContain(result.error)
    }
  })
})

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
