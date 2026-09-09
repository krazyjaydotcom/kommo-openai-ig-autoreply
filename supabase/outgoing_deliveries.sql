begin;
create table if not exists public.outgoing_deliveries (
  id text primary key,
  status text not null check (status in ('sending', 'sent', 'needs_review')),
  message_text text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.outgoing_deliveries enable row level security;
revoke all on public.outgoing_deliveries from anon, authenticated;
grant select, insert, update on public.outgoing_deliveries to service_role;
commit;
