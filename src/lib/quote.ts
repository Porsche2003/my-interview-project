// 報價相關的純函式：計算與顯示格式化。無副作用、不碰資料庫，方便單元測試。

export type Change = { change: number; changePercent: number }

// 漲跌與漲跌幅。需要今日與昨日收盤價；任一缺失、或昨日為 0（無法算百分比）則回傳 null。
export function computeChange(
  current: number | null,
  previous: number | null
): Change | null {
  if (current == null || previous == null || previous === 0) return null
  const change = current - previous
  return { change, changePercent: (change / previous) * 100 }
}

const DASH = '—'

// 價格固定兩位小數；null（例如停牌無收盤價）顯示破折號
export function formatPrice(v: number | null): string {
  return v == null ? DASH : v.toFixed(2)
}

// 本益比固定兩位小數；null（例如 ETF 無本益比）顯示破折號
export function formatPeRatio(v: number | null): string {
  return v == null ? DASH : v.toFixed(2)
}

// 成交量加上千分位；null 顯示破折號
export function formatVolume(v: number | null): string {
  return v == null ? DASH : v.toLocaleString('en-US')
}
