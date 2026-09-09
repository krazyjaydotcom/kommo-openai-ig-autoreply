begin;
create table if not exists public.message_jobs (
  id text primary key,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','done','needs_review')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  error text
);
create index if not exists message_jobs_pending on public.message_jobs(created_at) where status='pending';
alter table public.message_jobs enable row level security;
grant select, insert, update on public.message_jobs to service_role;
revoke all on public.message_jobs from anon, authenticated;
commit;
