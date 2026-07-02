import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Next.js 16：middleware 已更名為 proxy。這一層在每個請求前於伺服器執行，負責：
//   (1) 刷新 Supabase 的登入 token（Supabase SSR 必須靠這層維持登入狀態）
//   (2) 對登入頁做「樂觀」導向（真正的安全檢查在 DAL / 頁面層做）
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 安全核心：務必使用 getUser() 而非 getSession()（每次向 Auth 伺服器重新驗證 JWT）
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 已登入者不需要看到登入頁，直接送回首頁
  if (user && request.nextUrl.pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // 重要：一定要回傳這個 response，否則刷新後的 cookie 不會被寫回瀏覽器
  return response
}

export const config = {
  // 排除靜態資源與 /auth（OAuth 回呼自行處理 cookie，不需 proxy 介入）
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
