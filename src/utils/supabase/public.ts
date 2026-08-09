import { createClient } from '@supabase/supabase-js'

// 「公開讀取」專用的 Supabase client：不吃 cookie、不帶使用者 session。
//
// 為什麼需要它（這一步的關鍵）：
//   src/utils/supabase/server.ts 的 createClient() 每次都 await cookies()，
//   而 Next 的快取（unstable_cache / "use cache"）內部「不支援讀取 cookies/headers」
//   ——因為 cookie 是每個請求都不同的 request 範圍資料，放進跨請求共用的快取會語意矛盾。
//   stocks / daily_quotes 的 RLS 本來就是「公開讀」，根本不需要使用者 session，
//   所以這裡用 anon key 開一個「無 cookie」的 client，才能安全地被快取包起來。
//
// 用 module 層單例即可：它無狀態、可跨請求共用，不像 server client 每次都要綁當下的 cookie。
export const supabasePublic = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: false, // 伺服器端無瀏覽器儲存，不需保存 session
      autoRefreshToken: false, // 不需背景刷新 token，避免多餘計時器
    },
  }
)
