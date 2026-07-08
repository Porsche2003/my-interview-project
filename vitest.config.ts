import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 目前的測試都是純函式，跑在 Node 環境即可（不需要瀏覽器 DOM）
    environment: 'node',
    // 測試檔放在被測程式旁邊，統一命名為 *.test.ts
    include: ['scripts/**/*.test.ts', 'src/**/*.test.ts'],
  },
})
