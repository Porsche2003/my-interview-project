import { signInWithGoogle } from '@/app/auth/actions'

// 登入頁是 Server Component；登入用 <form action={ServerAction}>，不需要任何 client JS。
// （已登入者會被 proxy 導回首頁，這裡不必再檢查。）
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold">登入股市資訊站</h1>

      {error && (
        <p className="text-sm text-red-600">登入失敗，請再試一次。</p>
      )}

      <form action={signInWithGoogle}>
        <button
          type="submit"
          className="rounded-md border border-gray-300 px-6 py-3 font-medium hover:bg-gray-50"
        >
          使用 Google 登入
        </button>
      </form>
    </main>
  )
}
