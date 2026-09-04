'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { getMyWatchlistIdsAction, toggleWatchlistAction } from '@/app/stocks/actions'
import { watchlistErrorMessage } from '@/lib/watchlist'
import type { Stock } from '@/services/stocks'

// 列表 + 每列的 ★。這個元件存在的理由是「保住 /stocks 的靜態快取」：
//
// 如果讓 Server Component 去讀 cookie 判斷「你收藏了哪些」，整頁會立刻從
// 靜態 ISR（build 表的 ○）掉成動態（ƒ），快取那輪的主要戰果就沒了。
// 所以改成：頁面維持靜態、把股票清單當 props 傳進來（這些 rows 一樣會被
// 伺服器渲染進 HTML，SEO 與快取都不受影響），收藏狀態則由這個 island
// 在 hydrate 後自己去拿。公開的殼被快取，私人的部分在客戶端補上。
//
// 這就是 ADR-0001 描述給「彈幕」的那個「靜態殼 + client island」模式。
export function StockListWithStars({ stocks }: { stocks: Stock[] }) {
  // null 代表「還沒載入完成」或「未登入」——兩者都不顯示 ★，避免閃爍或誤導
  const [watchedIds, setWatchedIds] = useState<Set<string> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // 掛載後取一次收藏集合。官方文件明列這是 useEffect + Server Function 的正當用法。
  useEffect(() => {
    let cancelled = false
    getMyWatchlistIdsAction()
      .then((ids) => {
        // 元件已卸載就不要再 setState；未登入（null）則維持不顯示 ★
        if (!cancelled && ids !== null) setWatchedIds(new Set(ids))
      })
      .catch(() => {
        // 取不到收藏狀態不該讓整個列表壞掉，靜默降級成「不顯示 ★」
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 這裡用「手動樂觀更新」而非 useOptimistic：狀態是一個 Set、又要逐列切換，
  // 手寫 add/delete 與還原比套 useOptimistic 的 reducer 更直觀好讀。
  function handleToggle(stockId: string) {
    if (!watchedIds) return
    const next = !watchedIds.has(stockId)

    const apply = (add: boolean) =>
      setWatchedIds((prev) => {
        const copy = new Set(prev)
        if (add) copy.add(stockId)
        else copy.delete(stockId)
        return copy
      })

    setError(null)
    apply(next) // 先改畫面
    startTransition(async () => {
      const result = await toggleWatchlistAction(stockId, next)
      if (!result.ok) {
        apply(!next) // 失敗還原
        setError(watchlistErrorMessage(result.error))
      }
    })
  }

  return (
    <>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <ul className="mt-4 divide-y">
        {stocks.map((s) => {
          const isWatched = watchedIds?.has(s.id) ?? false
          return (
            <li key={s.id} className="flex items-center justify-between gap-2">
              <Link
                href={`/stocks/${s.id}`}
                className="flex flex-1 items-center justify-between py-3 hover:bg-gray-50"
              >
                <span>
                  <span className="font-medium">{s.id}</span>{' '}
                  <span className="text-gray-600">{s.name}</span>
                </span>
                <span className="text-xs text-gray-400">
                  {s.market === 'TWSE' ? '上市' : s.market === 'TPEX' ? '上櫃' : s.market}
                </span>
              </Link>

              {/* watchedIds 為 null（未登入／未載入）時整顆不渲染，畫面不會閃爍 */}
              {watchedIds && (
                <button
                  type="button"
                  onClick={() => handleToggle(s.id)}
                  disabled={isPending}
                  aria-pressed={isWatched}
                  aria-label={`${isWatched ? '移除收藏' : '加入收藏'} ${s.name}`}
                  className={`rounded px-2 py-1 text-lg leading-none transition-colors disabled:opacity-60 ${
                    isWatched ? 'text-amber-500 hover:bg-amber-50' : 'text-gray-300 hover:bg-gray-100'
                  }`}
                >
                  {isWatched ? '★' : '☆'}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
