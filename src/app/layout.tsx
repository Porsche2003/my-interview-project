import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "股市資訊站",
  description: "台股股價與本益比資訊查詢",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-Hant"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* 全站共用導覽：/stocks 是公開頁，放這裡讓訪客從任何頁（含被導向的 /login）都到得了 */}
        <header className="border-b border-gray-200">
          <nav className="flex items-center gap-6 px-8 py-4">
            <Link href="/" className="font-bold">
              股市資訊站
            </Link>
            <Link
              href="/stocks"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              個股列表
            </Link>
            {/* 未登入時點這個會被導去 /login（見 app/watchlist/page.tsx） */}
            <Link
              href="/watchlist"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              我的收藏
            </Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
