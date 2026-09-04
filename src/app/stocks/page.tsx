import type { Metadata } from 'next'
import { listStocks } from '@/services/stocks'
import { StockListWithStars } from '@/components/stock-list'

export const metadata: Metadata = { title: '股票列表｜股市資訊站' }

// 頁面層 ISR：這頁的 HTML 也快取，最多 3600 秒後在背景重新產生。
// 搭配 listStocks 的 unstable_cache（資料快取）+ /api/revalidate（webhook 精準失效）。
//
// ⚠️ 維持這頁靜態是刻意的：所以這裡「絕對不能」讀 cookie 去查使用者收藏了哪些股票，
// 那會讓整頁掉成動態（ƒ）。收藏狀態改由 StockListWithStars 這個 client island
// 在瀏覽器端自己取（見該元件的說明）。
export const revalidate = 3600

// 公開頁：任何人（未登入也可）都能瀏覽，因為 stocks/daily_quotes 的 RLS 允許公開讀取。
export default async function StocksPage() {
  const stocks = await listStocks(100)

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-bold">股票列表</h1>
      <p className="mt-1 text-sm text-gray-500">
        目前顯示前 {stocks.length} 檔（完整搜尋 / 產業 / 上市櫃篩選待後續實作）
      </p>

      {/* 清單本身仍由伺服器渲染進 HTML（靜態、可快取、對 SEO 友善），
          只有 ★ 的狀態是 hydrate 後才由客戶端補上 */}
      <StockListWithStars stocks={stocks} />
    </main>
  )
}
