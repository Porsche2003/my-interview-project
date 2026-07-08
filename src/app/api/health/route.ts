// 存活探針（liveness probe）：只回報「這個 app 進程本身還活著」。
//
// 刻意「零依賴」——不查資料庫、不打外部 API。原因：
//   1. 作為部署煙霧測試：回 200 就代表 build/路由/serverless function 都正常，
//      且不會跟 Supabase 環境變數的問題糾纏在一起。
//   2. liveness 的語意就是「進程活著」，不該因為資料庫暫時慢就回失敗
//      （那是另一種「就緒探針 readiness probe」的職責，見下方註解）。
//
// 這是一個 Route Handler（檔名 route.ts、export HTTP 方法函式），不是頁面：
// 它回傳的是資料（JSON/Response），不是畫面（JSX）；沒有 layout、不能被瀏覽器當網頁導覽。
export async function GET() {
  return Response.json({
    status: 'ok',
    ts: new Date().toISOString(),
  })
}

// 若之後想要「就緒探針 readiness probe」——確認相依服務（如 Supabase）也正常——
// 應該另開一個端點（例如 /api/ready），在裡面做一個輕量查詢，失敗才回 503。
// 把「活著」和「準備好服務流量」分成兩個端點，是正式系統的常見做法。
