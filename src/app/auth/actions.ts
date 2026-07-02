'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

// 發起 Google OAuth。跑在伺服器端：Supabase 會設定 PKCE 的 code verifier cookie，
// 並回傳 Google 的授權網址，我們把使用者導向它。
export async function signInWithGoogle() {
  const supabase = await createClient()
  const origin = (await headers()).get('origin')

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // Google 登入完成後，會帶著 code 導回這個 Route Handler
      redirectTo: `${origin}/auth/callback`,
    },
  })

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  redirect(data.url)
}

// 登出：清除 session 後回登入頁
export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
