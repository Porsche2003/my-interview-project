import { getMyProfile } from '@/services/profile'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  // 直接調用 DAL，頁面組件乾淨清晰
  const profile = await getMyProfile()

  if (!profile) {
    redirect('/login')
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">歡迎回來，{profile.full_name}</h1>
      <p className="text-gray-600">Email: {profile.email}</p>
    </div>
  )
}