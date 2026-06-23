-- 1. 建立用戶基本資料表 (與 auth.users 一對一關聯)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  updated_at timestamp with time zone,
  full_name text,
  avatar_url text,
  email text unique
);

-- 2. 啟用資料庫的行級安全防禦 (RLS)
alter table public.profiles enable row level security;

-- 3. 建立 RLS 策略：允許用戶讀取所有人，但只能修改自己的資料
create policy "Public profiles are viewable by everyone." on public.profiles
  for select using (true);

create policy "Users can update their own profile." on public.profiles
  for update using (auth.uid() = id);

-- 4. 建立自動同步 Trigger：當 auth.users 有新註冊時，自動插入 profiles
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, avatar_url, email)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url', new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();