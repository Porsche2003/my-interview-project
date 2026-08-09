import { describe, it, expect } from 'vitest'
import { isRevalidateAuthorized } from './revalidate-auth'

describe('isRevalidateAuthorized', () => {
  const SECRET = 'super-secret-token'

  it('密鑰完全相符 → 授權通過', () => {
    expect(isRevalidateAuthorized(SECRET, SECRET)).toBe(true)
  })

  it('密鑰不符 → 拒絕', () => {
    expect(isRevalidateAuthorized('wrong-token', SECRET)).toBe(false)
  })

  // 長度不同會走「提前判否」那條路，確保不會因 timingSafeEqual 要求等長而丟錯。
  it('密鑰長度不同 → 拒絕（不丟錯）', () => {
    expect(isRevalidateAuthorized('short', SECRET)).toBe(false)
  })

  it('沒帶密鑰（null / undefined / 空字串）→ 拒絕', () => {
    expect(isRevalidateAuthorized(null, SECRET)).toBe(false)
    expect(isRevalidateAuthorized(undefined, SECRET)).toBe(false)
    expect(isRevalidateAuthorized('', SECRET)).toBe(false)
  })

  // 安全預設：伺服器忘了設 REVALIDATE_SECRET 時，不能變成「誰都能打」。
  it('伺服器端未設定密鑰 → 一律拒絕（即使請求也沒帶）', () => {
    expect(isRevalidateAuthorized(SECRET, undefined)).toBe(false)
    expect(isRevalidateAuthorized(null, undefined)).toBe(false)
  })
})
