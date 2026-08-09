import { timingSafeEqual } from 'node:crypto'

// 驗證 /api/revalidate 收到的密鑰是否正確。抽成純函式的理由：
//   1. route handler 內呼叫 revalidateTag 需要 Next 執行環境，很難單元測；
//      但「密鑰對不對」是純邏輯，抽出來就能用 Vitest 完整覆蓋（200/401 分支）。
//   2. 單一職責、好讀。
//
// 用 timingSafeEqual 做「常數時間比較」：一般 === 比字串會在第一個不同字元就回傳，
// 攻擊者能用回應時間差一個字元一個字元猜出密鑰（timing attack）。常數時間比較不論
// 對錯都花一樣久，堵掉這條側通道。作品集風險雖低，但這是能講給面試官聽的加分點。
export function isRevalidateAuthorized(
  provided: string | null | undefined,
  expected: string | undefined
): boolean {
  // 安全預設：伺服器沒設定密鑰就一律拒絕，避免「忘了設環境變數 = 任何人都能打」。
  if (!expected) return false
  if (!provided) return false

  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  // timingSafeEqual 要求等長，長度不同直接判為不符（長度本身不是機密）。
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
