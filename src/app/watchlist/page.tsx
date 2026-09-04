import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getWatchlist } from '@/services/watchlist'
import { WatchlistTable } from '@/components/watchlist-table'

export const metadata: Metadata = { title: '我的收藏｜股市資訊站' }

// 這頁是「每個使用者都不同」的私人資料，本質上不可能快取，
// 所以不設 revalidate（讀 cookie 也會讓 Next 自動判定為動態渲染）。
export default async function WatchlistPage() {
  const items = await getWatchlist()

  // DAL 用 null / [] 區分兩種狀況，這裡才有辦法做不同的事：
  //   null → 未登入，導去登入頁
  //   []   → 已登入但沒收藏，交給 WatchlistTable 顯示空狀態
  if (items === null) {
    redirect('/login')
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-bold">我的收藏</h1>
      <p className="mt-1 text-sm text-gray-500">
        共 {items.length} 檔。點股票名稱可查看詳細報價。
      </p>

      <WatchlistTable items={items} />
    </main>
  )
}
