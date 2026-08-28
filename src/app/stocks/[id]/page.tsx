import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getStockDetail } from '@/services/stocks'
import { getWatchlistState } from '@/services/watchlist'
import { WatchlistButton } from '@/components/watchlist-button'
import {
  computeChange,
  formatPrice,
  formatPeRatio,
  formatVolume,
} from '@/lib/quote'

// ⚠️ 這頁刻意「不」設 export const revalidate（原本有，加入收藏功能後移除）。
//
// 原因：★ 收藏是「每個使用者都不一樣」的狀態。一旦頁面 HTML 被 ISR 快取，
// 就會把 A 使用者的收藏狀態送給 B 使用者看——那是隱私問題，不只是顯示錯誤。
// 讀取 cookie（判斷登入者是誰）本來就會讓 Next 自動把這個路由轉為動態渲染，
// 這裡把 revalidate 拿掉是讓「這頁是 per-user 的」這件事在程式碼上明確可見。
//
// 那 ADR-0001 想解的 DB 讀取壓力有沒有退步？沒有：
// 真正昂貴的股價查詢仍由 getStockDetail 的 unstable_cache 快取（可被 webhook 清除），
// 這裡放棄的只是「HTML 渲染結果」的快取。公開的 /stocks 列表頁不受影響，仍是 ISR。
type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const detail = await getStockDetail(id) // 因 getStockDetail 有 cache()，這裡不會重複查 DB
  if (!detail) return { title: '找不到股票｜股市資訊站' }
  return { title: `${detail.stock.name} (${detail.stock.id})｜股市資訊站` }
}

export default async function StockDetailPage({ params }: Props) {
  const { id } = await params

  // 兩個查詢彼此獨立，用 Promise.all 併行，避免白白多等一趟來回。
  // getStockDetail 走公開快取；getWatchlistState 走 cookie、每人不同。
  const [detail, watchlistState] = await Promise.all([
    getStockDetail(id),
    getWatchlistState(id),
  ])
  if (!detail) notFound() // 查無此股 → 交給 Next 顯示 404 頁

  const { stock, quotes } = detail
  const latest = quotes[0] ?? null
  const previous = quotes[1] ?? null
  const change = computeChange(
    latest?.close_price ?? null,
    previous?.close_price ?? null
  )

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href="/stocks" className="text-sm text-blue-600 hover:underline">
        ← 返回股票列表
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <header className="flex items-baseline gap-3">
          <h1 className="text-3xl font-bold">{stock.name}</h1>
          <span className="text-xl text-gray-500">{stock.id}</span>
          {stock.market && (
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {stock.market === 'TWSE' ? '上市' : stock.market === 'TPEX' ? '上櫃' : stock.market}
            </span>
          )}
        </header>

        {/* 唯一的 client island：其餘頁面內容仍是 Server Component */}
        <WatchlistButton
          stockId={stock.id}
          initialIsWatched={watchlistState.isWatched}
          isLoggedIn={watchlistState.isLoggedIn}
        />
      </div>

      {latest ? (
        <section className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat 
            label={`收盤價（${latest.trade_date}）`} 
            value={formatPrice(latest.close_price)}
            tone={change ? (change.change > 0 ? 'up' : change.change < 0 ? 'down' : 'flat') : 'flat'} />
          <Stat
            label="漲跌"
            value={
              change
                ? `${change.change > 0 ? '+' : ''}${change.change.toFixed(2)} (${change.changePercent.toFixed(2)}%)`
                : '—'
            }
            // 台股慣例：紅漲綠跌
            tone={change ? (change.change > 0 ? 'up' : change.change < 0 ? 'down' : 'flat') : 'flat'}
          />
          <Stat label="本益比" value={formatPeRatio(latest.pe_ratio)} />
          <Stat label="成交量" value={formatVolume(latest.volume)} />
        </section>
      ) : (
        <p className="mt-6 text-gray-500">尚無報價資料。</p>
      )}

      {quotes.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-semibold">近期報價</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2">日期</th>
                  <th className="py-2 text-right">收盤</th>
                  <th className="py-2 text-right">本益比</th>
                  <th className="py-2 text-right">成交量(張)</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.trade_date} className="border-b">
                    <td className="py-2">{q.trade_date}</td>
                    <td className="py-2 text-right">{formatPrice(q.close_price)}</td>
                    <td className="py-2 text-right">{formatPeRatio(q.pe_ratio)}</td>
                    <td className="py-2 text-right">{formatVolume(q.volume)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  )
}

function Stat({
  label,
  value,
  tone = 'flat',
}: {
  label: string
  value: string
  tone?: 'up' | 'down' | 'flat'
}) {
  const color =
    tone === 'up' ? 'text-red-600' : tone === 'down' ? 'text-green-600' : 'text-gray-900'
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${color}`}>{value}</div>
    </div>
  )
}
