import { revalidateTag } from 'next/cache'
import { isRevalidateAuthorized } from '@/lib/revalidate-auth'
import { STOCKS_CACHE_TAG } from '@/services/stocks'

// On-demand revalidation 端點：ingest 寫完當日資料後打這裡，
// 立刻清掉 stocks 快取，使用者當天就看到新資料（不用等 3600 秒保底 TTL）。
//
// 這是 Route Handler（route.ts + export HTTP 方法），回資料不回畫面。
// 只收 POST：清快取是「會改變狀態」的動作，語意上不該用 GET（GET 應可安全重複、可被預抓）。
export async function POST(request: Request) {
  const provided = request.headers.get('x-revalidate-secret')

  // 沒帶密鑰或密鑰不符 → 401。用 header 帶密鑰而非 query string，
  // 避免密鑰被寫進 URL、留在存取紀錄／瀏覽器歷史裡。
  if (!isRevalidateAuthorized(provided, process.env.REVALIDATE_SECRET)) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  // ⚠️ Next 16 breaking change：revalidateTag 第二參數必填，單參數形式已 deprecated。
  // 用 { expire: 0 } = 立即過期：下一個請求就是 blocking 的 cache miss、直接拿到當日新資料。
  // 這正是官方建議「外部系統（webhook）呼叫 Route Handler、要資料立刻更新」的用法。
  // （另一選項 'max' 是 stale-while-revalidate：下個訪客先看到舊資料、背景才更新，
  //  對「當天就要看到新股價」不夠即時，故不用。）
  revalidateTag(STOCKS_CACHE_TAG, { expire: 0 })

  return Response.json({ ok: true, revalidated: STOCKS_CACHE_TAG, now: Date.now() })
}
