// 擷取寫入成功後，通知線上站台清除 stocks 快取（on-demand revalidation）。
//
// 刻意「盡力而為」（best-effort）：任何失敗只印警告、不丟錯、不改變 ingest 的結束碼。
// 理由：資料已經寫進 DB 了，這一步只是「叫線上快取早點更新」。就算沒打成功，
// 頁面的保底 TTL（revalidate: 3600）最多一小時後也會自己更新——這不是資料正確性問題，
// 不該讓它把一次成功的資料擷取標記成失敗。
//
// 需要兩個環境變數（本機放 .env.local、CI 放 GitHub Secrets）：
//   REVALIDATE_URL    線上端點，例如 https://<app>.vercel.app/api/revalidate
//   REVALIDATE_SECRET 與 Next 端 /api/revalidate 比對的同一組密鑰
export async function revalidateStocksCache(): Promise<void> {
  const url = process.env.REVALIDATE_URL
  const secret = process.env.REVALIDATE_SECRET

  if (!url || !secret) {
    console.log('[ingest] 未設定 REVALIDATE_URL / REVALIDATE_SECRET，略過快取失效')
    return
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'x-revalidate-secret': secret },
    })
    if (!res.ok) {
      console.warn(`[ingest] 快取失效請求非 2xx（${res.status}），已略過`)
      return
    }
    console.log('[ingest] 已觸發線上快取失效 revalidateTag(stocks)')
  } catch (err) {
    console.warn('[ingest] 快取失效請求失敗（不影響資料寫入）:', err)
  }
}
