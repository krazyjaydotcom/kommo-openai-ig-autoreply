begin;
alter table public.message_jobs add column if not exists kind text not null default 'incoming';
create index if not exists message_jobs_kind_pending on public.message_jobs(kind, created_at) where status='pending';
commit;
