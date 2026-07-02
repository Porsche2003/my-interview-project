import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

// OAuth 回呼：Google → Supabase → 這裡。用一次性的 code 換取 session（寫入登入 cookie）。
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalEnv = process.env.NODE_ENV === 'development'

      if (isLocalEnv) {
        // 本機開發：沒有反向代理，直接用 origin
        return NextResponse.redirect(`${origin}${next}`)
      } else if (forwardedHost) {
        // 正式環境：Vercel 等平台前面有 load balancer，用轉發來的 host
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      } else {
        return NextResponse.redirect(`${origin}${next}`)
      }
    }
  }

  // code 缺失或交換失敗：回登入頁並附錯誤
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
