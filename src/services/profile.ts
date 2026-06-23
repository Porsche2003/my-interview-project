import { createClient } from '@/utils/supabase/server'

// 將商業與資料庫查詢邏輯抽離，未來極易進行單元測試
export async function getMyProfile() {
  const supabase = await createClient()
  
  // 1. 先驗證安全身份
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return null

  // 2. 查詢資料
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error) {
    console.error('DAL Error fetching profile:', error.message)
    return null
  }
  return data
}