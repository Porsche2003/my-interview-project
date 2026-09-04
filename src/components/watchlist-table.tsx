'use client'

import Link from 'next/link'
import { useOptimistic, useState, useTransition } from 'react'
import { toggleWatchlistAction } from '@/app/stocks/actions'
import { watchlistErrorMessage, type WatchlistItem } from '@/lib/watchlist'

// 收藏列表。這裡的樂觀更新和 ★ 按鈕不同：
//   按鈕是「切換一個布林值」，這裡是「從清單中移除一列」——
//   同樣用 useOptimistic，但 reducer 是對陣列做 filter。
// 一樣享有自動回退：移除失敗時該列會自己跳回來。
export function WatchlistTable({ items }: { items: WatchlistItem[] }) {
  const [list, setList] = useState(items)
  const [optimisticList, removeOptimistic] = useOptimistic(
    list,
    (current: WatchlistItem[], removedId: string) =>
      current.filter((item) => item.id !== removedId)
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleRemove(stockId: string) {
    setError(null)
    startTransition(async () => {
      removeOptimistic(stockId) // 該列立刻消失
      const result = await toggleWatchlistAction(stockId, false)
      if (result.ok) {
        setList((current) => current.filter((item) => item.id !== stockId))
      } else {
        // 不動真實清單 → 該列自動回到畫面上
        setError(watchlistErrorMessage(result.error))
      }
    })
  }

  if (optimisticList.length === 0) {
    return (
      <div className="mt-6 rounded-lg border border-dashed border-gray-300 p-8 text-center">
        <p className="text-gray-500">還沒有收藏任何股票。</p>
        <Link
          href="/stocks"
          className="mt-3 inline-block text-sm text-blue-600 hover:underline"
        >
          去股票列表看看 →
        </Link>
      </div>
    )
  }

  return (
    <>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <ul className="mt-4 divide-y">
        {optimisticList.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 py-3">
            <Link href={`/stocks/${item.id}`} className="flex-1 hover:underline">
              <span className="font-medium">{item.id}</span>{' '}
              <span className="text-gray-600">{item.name}</span>
              {item.market && (
                <span className="ml-2 text-xs text-gray-400">
                  {item.market === 'TWSE' ? '上市' : item.market === 'TPEX' ? '上櫃' : item.market}
                </span>
              )}
            </Link>

            <button
              type="button"
              onClick={() => handleRemove(item.id)}
              disabled={isPending}
              aria-label={`移除收藏 ${item.name}`}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            >
              移除
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
