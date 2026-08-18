-- NightNote Phase 2 Database Schema (Supabase / Postgres)
-- Row Level Security (RLS) enabled on all tables strictly matching auth.uid()

-- 1. PROFILES TABLE
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "own_rows_select" on public.profiles
  for select using (auth.uid() = id);

create policy "own_rows_insert" on public.profiles
  for insert with check (auth.uid() = id);

create policy "own_rows_update" on public.profiles
  for update using (auth.uid() = id);

create policy "own_rows_delete" on public.profiles
  for delete using (auth.uid() = id);


-- 2. NOTES TABLE (Raw night captures)
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  raw_text text not null,
  created_at timestamptz not null default now()
);

alter table public.notes enable row level security;

create policy "own_rows_select" on public.notes
  for select using (auth.uid() = user_id);

create policy "own_rows_insert" on public.notes
  for insert with check (auth.uid() = user_id);

create policy "own_rows_update" on public.notes
  for update using (auth.uid() = user_id);

create policy "own_rows_delete" on public.notes
  for delete using (auth.uid() = user_id);


-- 3. TASKS TABLE (Actionable tasks derived from notes)
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid references public.notes(id) on delete set null,
  text text not null,
  category text,
  priority text not null default 'medium',
  ai_urgency real,
  ai_importance real,
  duration text,
  status text not null default 'pending',
  completion_rank int,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

create policy "own_rows_select" on public.tasks
  for select using (auth.uid() = user_id);

create policy "own_rows_insert" on public.tasks
  for insert with check (auth.uid() = user_id);

create policy "own_rows_update" on public.tasks
  for update using (auth.uid() = user_id);

create policy "own_rows_delete" on public.tasks
  for delete using (auth.uid() = user_id);


-- 4. TASK EVENTS TABLE (Append-only behavioral log)
create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  event text not null,
  occurred_at timestamptz not null default now()
);

alter table public.task_events enable row level security;

create policy "own_rows_select" on public.task_events
  for select using (auth.uid() = user_id);

create policy "own_rows_insert" on public.task_events
  for insert with check (auth.uid() = user_id);

create policy "own_rows_update" on public.task_events
  for update using (auth.uid() = user_id);

create policy "own_rows_delete" on public.task_events
  for delete using (auth.uid() = user_id);


-- INDEXES FOR QUERY OPTIMIZATION
create index if not exists idx_tasks_user_status on public.tasks(user_id, status);
create index if not exists idx_task_events_user_occurred on public.task_events(user_id, occurred_at);
create index if not exists idx_notes_user_id on public.notes(user_id);
