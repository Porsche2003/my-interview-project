import Link from 'next/link'
import type { Metadata } from 'next'
import { listStocks } from '@/services/stocks'

export const metadata: Metadata = { title: '股票列表｜股市資訊站' }

// 公開頁：任何人（未登入也可）都能瀏覽，因為 stocks/daily_quotes 的 RLS 允許公開讀取。
export default async function StocksPage() {
  const stocks = await listStocks(100)

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-bold">股票列表</h1>
      <p className="mt-1 text-sm text-gray-500">
        目前顯示前 {stocks.length} 檔（完整搜尋 / 產業 / 上市櫃篩選待後續實作）
      </p>

      <ul className="mt-4 divide-y">
        {stocks.map((s) => (
          <li key={s.id}>
            <Link
              href={`/stocks/${s.id}`}
              className="flex items-center justify-between py-3 hover:bg-gray-50"
            >
              <span>
                <span className="font-medium">{s.id}</span>{' '}
                <span className="text-gray-600">{s.name}</span>
              </span>
              <span className="text-xs text-gray-400">
                {s.market === 'TWSE' ? '上市' : s.market === 'TPEX' ? '上櫃' : s.market}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
