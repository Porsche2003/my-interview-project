-- 股票主檔：公司基本資料，很少變動
create table public.stocks (
  id text primary key,               -- 證交所股票代號，例如 '2330'
  name text not null,                -- 公司名稱，例如 '台積電'
  market text,                       -- 'TWSE'（上市）或 'TPEX'（上櫃）
  created_at timestamp with time zone not null default now()
);

-- 每日報價：時間序列資料，每天每檔一筆
create table public.daily_quotes (
  stock_id text not null references public.stocks(id) on delete cascade,
  trade_date date not null,
  close_price numeric(10, 2),
  pe_ratio numeric(10, 2),           -- 本益比
  volume bigint,
  created_at timestamp with time zone not null default now(),
  primary key (stock_id, trade_date) -- 複合主鍵：同一檔同一天只會有一筆，讓擷取程式可安全 upsert
);

-- 查詢單一個股走勢時，依日期倒序取用，加速排序與範圍查詢
create index idx_daily_quotes_stock_date
  on public.daily_quotes (stock_id, trade_date desc);

-- 股價資訊是公開內容，任何人皆可讀
alter table public.stocks enable row level security;
alter table public.daily_quotes enable row level security;

create policy "Stocks are viewable by everyone."
  on public.stocks for select using (true);

create policy "Daily quotes are viewable by everyone."
  on public.daily_quotes for select using (true);

-- 刻意不建立 insert/update/delete 政策：
-- 前端（anon/authenticated 角色）一律無法寫入，只有擷取程式使用的
-- service_role 金鑰（繞過 RLS）能寫入這兩張表。
