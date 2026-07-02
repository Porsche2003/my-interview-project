import { getMyProfile } from '@/services/profile'
import { redirect } from 'next/navigation'
import { signOut } from '@/app/auth/actions'

export default async function DashboardPage() {
  // 直接調用 DAL，頁面組件乾淨清晰。安全檢查（getUser）在 DAL 內部完成。
  const profile = await getMyProfile()

  if (!profile) {
    redirect('/login')
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">歡迎回來，{profile.full_name}</h1>
      <p className="text-gray-600">Email: {profile.email}</p>

      <form action={signOut} className="mt-6">
        <button
          type="submit"
          className="rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-50"
        >
          登出
        </button>
      </form>
    </div>
  )
}
