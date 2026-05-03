-- 在 Supabase 控制台 → SQL Editor 中粘贴执行一次

create table if not exists public.operation_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists operation_logs_user_id_created_at_idx
  on public.operation_logs (user_id, created_at desc);

alter table public.operation_logs enable row level security;

create policy "operation_logs_select_own"
  on public.operation_logs for select
  using (auth.uid() = user_id);

create policy "operation_logs_insert_own"
  on public.operation_logs for insert
  with check (auth.uid() = user_id);

-- 学习记录（动量守恒实验）：每用户最多保留最近 20 条由应用层 limit，库中可存更多
create table if not exists public.learning_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  experiment_type text not null default 'collision',
  v1i double precision not null,
  v2i double precision not null,
  v1f double precision not null,
  v2f double precision not null,
  mass1 real not null,
  mass2 real not null,
  friction_air real not null default 0.004,
  restitution real not null default 0.9,
  friction real not null default 0,
  created_at timestamptz not null default now()
);

-- 兼容已存在的 learning_records 表
alter table public.learning_records
  add column if not exists experiment_type text not null default 'collision';
alter table public.learning_records
  add column if not exists friction_air real not null default 0.004;
alter table public.learning_records
  add column if not exists restitution real not null default 0.9;
alter table public.learning_records
  add column if not exists friction real not null default 0;

create index if not exists learning_records_user_id_created_at_idx
  on public.learning_records (user_id, created_at desc);

alter table public.learning_records enable row level security;

create policy "learning_records_select_own"
  on public.learning_records for select
  using (auth.uid() = user_id);

create policy "learning_records_insert_own"
  on public.learning_records for insert
  with check (auth.uid() = user_id);

create policy "learning_records_delete_own"
  on public.learning_records for delete
  using (auth.uid() = user_id);

-- 用户资料：昵称
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null default '',
  updated_at timestamptz not null default now()
);

create index if not exists profiles_updated_at_idx
  on public.profiles (updated_at desc);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = user_id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = user_id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 演示环境可在 Authentication → Providers → Email 中关闭「Confirm email」，
-- 否则注册后需先点击邮件链接再登录。
