import { fetchTwseQuotes } from './fetch-twse'
import { fetchTpexQuotes } from './fetch-tpex'
import { upsertQuotes } from './upsert'
import { revalidateStocksCache } from './revalidate'
import type { NormalizedQuote } from './types'

async function main() {
  const startedAt = Date.now()
  console.log('[ingest] 開始擷取 TWSE / TPEx 資料...')

  // 兩個市場獨立抓取：其中一邊失敗，另一邊的資料仍然要能正常寫入
  const [twseResult, tpexResult] = await Promise.allSettled([
    fetchTwseQuotes(),
    fetchTpexQuotes(),
  ])

  const quotes: NormalizedQuote[] = []
  let hasFailure = false

  if (twseResult.status === 'fulfilled') {
    quotes.push(...twseResult.value)
    console.log(`[ingest] TWSE 上市：${twseResult.value.length} 筆`)
  } else {
    hasFailure = true
    console.error('[ingest] TWSE 擷取失敗:', twseResult.reason)
  }

  if (tpexResult.status === 'fulfilled') {
    quotes.push(...tpexResult.value)
    console.log(`[ingest] TPEx 上櫃：${tpexResult.value.length} 筆`)
  } else {
    hasFailure = true
    console.error('[ingest] TPEx 擷取失敗:', tpexResult.reason)
  }

  if (quotes.length === 0) {
    console.error('[ingest] 兩個市場都沒有抓到資料，中止寫入')
    process.exit(1)
  }

  await upsertQuotes(quotes)

  // 資料寫入成功後，通知線上站台清除 stocks 快取（盡力而為，失敗不影響本次擷取）
  await revalidateStocksCache()

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(`[ingest] 完成，共寫入 ${quotes.length} 筆，耗時 ${elapsedSec}s`)

  // 部分市場失敗時，資料照樣寫入完整那一邊，但仍以非 0 結束碼結束，
  // 讓 GitHub Actions 把這次執行標記為失敗、觸發通知。
  if (hasFailure) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[ingest] 未預期的錯誤:', err)
  process.exit(1)
})
