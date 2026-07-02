function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// 證交所／櫃買中心的 API 偶爾會逾時或短暫失敗，做指數退避重試。
// 實測 TPEx 會擋掉沒有瀏覽器特徵的請求（回 403），所以統一補上 User-Agent。
export async function fetchJsonWithRetry(
  url: string,
  { retries = 3, timeoutMs = 15000 }: { retries?: number; timeoutMs?: number } = {}
): Promise<unknown> {
  let lastError: unknown

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; stock-ingest-bot/1.0)',
        },
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`)
      }
      return await res.json()
    } catch (err) {
      lastError = err
      if (attempt < retries) {
        const backoffMs = 500 * 2 ** (attempt - 1)
        console.warn(
          `[fetch] 第 ${attempt} 次失敗 (${url}): ${(err as Error).message}，${backoffMs}ms 後重試`
        )
        await sleep(backoffMs)
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new Error(
    `fetchJsonWithRetry: 對 ${url} 重試 ${retries} 次仍失敗 — ${(lastError as Error)?.message}`
  )
}
