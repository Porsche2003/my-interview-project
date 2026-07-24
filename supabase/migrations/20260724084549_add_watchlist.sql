create table public.watchlist (
  user_id uuid not null references auth.users (id) on delete cascade,
  stock_id text not null references public.stocks (id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  primary key (user_id, stock_id)   -- 一位使用者同一檔只會收藏一次
);

-- watchlist 是私人資料，必須開 RLS
alter table public.watchlist enable row level security;

-- 關鍵：使用者只能看／改自己的收藏（auth.uid() = 該列的 user_id）
create policy "Users can view their own watchlist."
  on public.watchlist for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can add to their own watchlist."
  on public.watchlist for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can remove from their own watchlist."
  on public.watchlist for delete
  to authenticated
  using (auth.uid() = user_id);