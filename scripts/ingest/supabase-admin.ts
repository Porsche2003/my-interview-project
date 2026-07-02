import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRoleKey) {
  throw new Error(
    '缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 環境變數'
  )
}

// 僅供背景擷取腳本使用。service_role 金鑰會繞過 RLS，
// 絕對不可加上 NEXT_PUBLIC_ 前綴、不可被前端程式引用。
export const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
})
