'use client'

import Link from 'next/link'
import { useOptimistic, useState, useTransition } from 'react'
import { toggleWatchlistAction } from '@/app/stocks/actions'
import { watchlistErrorMessage } from '@/lib/watchlist'

// 本專案第一個 Client Component。為什麼這裡非得是 client：
// 它需要「點擊事件」和「元件內部狀態」，這兩件事只有瀏覽器端做得到。
// 但注意範圍很小——只有這顆按鈕是 client，整個個股頁其餘部分仍是 Server Component。
// 這就是 island 架構：把互動性關在最小的島上，其餘維持伺服器渲染。

type Props = {
  stockId: string
  initialIsWatched: boolean
  isLoggedIn: boolean
}

export function WatchlistButton({ stockId, initialIsWatched, isLoggedIn }: Props) {
  // 真實狀態：只有在 server 回報成功後才更新
  const [isWatched, setIsWatched] = useState(initialIsWatched)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // 樂觀狀態：點下去「立刻」反映在畫面上，不等網路來回。
  // useOptimistic 的關鍵行為：當 transition 結束、而真實狀態沒有跟著改變時，
  // 它會「自動回退」到真實狀態——所以操作失敗時 ★ 會自己彈回去，不必手動還原。
  const [optimisticIsWatched, setOptimisticIsWatched] = useOptimistic(
    isWatched,
    (_current: boolean, next: boolean) => next
  )

  // ⚠️ Hooks 必須在任何提前 return 之前呼叫完（Rules of Hooks），
  // 所以未登入的分支放在所有 useXxx 之後，不能寫在最上面。
  if (!isLoggedIn) {
    return (
      <Link
        href="/login"
        className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
      >
        <span aria-hidden>☆</span> 登入後可收藏
      </Link>
    )
  }

  function handleClick() {
    setError(null)
    // useOptimistic 的更新必須發生在 transition 內，否則 React 會報錯
    startTransition(async () => {
      const next = !isWatched
      setOptimisticIsWatched(next) // 畫面立刻變
      const result = await toggleWatchlistAction(stockId, next)
      if (result.ok) {
        setIsWatched(next) // 確認成功，把真實狀態補上
      } else {
        // 不成功就不動真實狀態 → 樂觀值自動回退；只顯示訊息。
        // 這裡把「代碼」翻成「人話」，文案的決定權在 UI 層（見 lib/watchlist.ts）。
        setError(watchlistErrorMessage(result.error))
      }
    })
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        // 無障礙：aria-pressed 讓螢幕閱讀器知道這是一個「開/關」狀態的按鈕
        aria-pressed={optimisticIsWatched}
        aria-label={optimisticIsWatched ? '移除收藏' : '加入收藏'}
        className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition-colors disabled:opacity-60 ${
          optimisticIsWatched
            ? 'border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100'
            : 'border-gray-300 text-gray-600 hover:bg-gray-50'
        }`}
      >
        <span aria-hidden>{optimisticIsWatched ? '★' : '☆'}</span>
        {optimisticIsWatched ? '已收藏' : '加入收藏'}
      </button>

      {/* role="alert" 讓錯誤訊息出現時會被螢幕閱讀器主動播報 */}
      {error && (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      )}
    </div>
  )
}
