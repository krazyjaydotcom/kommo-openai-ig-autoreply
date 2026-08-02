create table if not exists public.app_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

drop policy if exists "service role can manage app state" on public.app_state;

create policy "service role can manage app state"
on public.app_state
for all
to service_role
using (true)
with check (true);
