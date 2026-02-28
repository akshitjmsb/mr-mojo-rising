-- Reliability-first queue and status model upgrades

-- 1) Songs: richer status + observability fields
alter table public.songs
  add column if not exists processing_stage text,
  add column if not exists last_error text,
  add column if not exists updated_at timestamptz not null default now();

update public.songs
set processing_stage = coalesce(
  processing_stage,
  case
    when status = 'pending' then 'queued'
    when status = 'processing' then 'download'
    when status = 'ready' then 'complete'
    when status = 'failed' then 'failed'
    else 'queued'
  end
);

alter table public.songs
  drop constraint if exists songs_status_check;

alter table public.songs
  add constraint songs_status_check
  check (status in ('pending', 'queued', 'processing', 'ready', 'failed'));

-- 2) Durable processing jobs queue
create table if not exists public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  song_id uuid references public.songs(id) on delete cascade not null unique,
  user_id uuid references auth.users(id) on delete cascade not null,
  youtube_url text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'retryable', 'failed', 'succeeded')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  run_after timestamptz not null default now(),
  locked_by text,
  locked_at timestamptz,
  heartbeat_at timestamptz,
  last_error text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

alter table public.processing_jobs enable row level security;

create policy "Users can view their own processing jobs"
  on public.processing_jobs for select
  using (auth.uid() = user_id);

create policy "Users can insert their own processing jobs"
  on public.processing_jobs for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own processing jobs"
  on public.processing_jobs for update
  using (auth.uid() = user_id);

create policy "Users can delete their own processing jobs"
  on public.processing_jobs for delete
  using (auth.uid() = user_id);

create policy "Service role can manage all processing jobs"
  on public.processing_jobs for all
  using (auth.role() = 'service_role');

-- 3) Updated-at trigger helper
create or replace function public.set_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists songs_set_updated_at on public.songs;
create trigger songs_set_updated_at
before update on public.songs
for each row execute function public.set_timestamp_updated_at();

drop trigger if exists processing_jobs_set_updated_at on public.processing_jobs;
create trigger processing_jobs_set_updated_at
before update on public.processing_jobs
for each row execute function public.set_timestamp_updated_at();

-- 4) Queue RPC: atomically claim next ready job
create or replace function public.claim_next_job(worker_id text)
returns setof public.processing_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with next_job as (
    select pj.id
    from public.processing_jobs pj
    where pj.status in ('queued', 'retryable')
      and pj.run_after <= now()
    order by pj.run_after asc, pj.created_at asc
    limit 1
    for update skip locked
  ),
  claimed as (
    update public.processing_jobs pj
    set status = 'running',
        locked_by = worker_id,
        locked_at = now(),
        heartbeat_at = now(),
        started_at = coalesce(pj.started_at, now()),
        attempt_count = pj.attempt_count + 1,
        error_code = null
    from next_job nj
    where pj.id = nj.id
    returning pj.*
  )
  select * from claimed;
end;
$$;

revoke all on function public.claim_next_job(text) from public;
grant execute on function public.claim_next_job(text) to service_role;

-- 5) Queue RPC: recover stale running jobs based on heartbeat
create or replace function public.requeue_stale_jobs(timeout_seconds integer default 300)
returns setof public.processing_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with stale as (
    select pj.id
    from public.processing_jobs pj
    where pj.status = 'running'
      and pj.heartbeat_at is not null
      and pj.heartbeat_at < now() - make_interval(secs => timeout_seconds)
    for update skip locked
  ),
  recovered as (
    update public.processing_jobs pj
    set status = case
          when pj.attempt_count >= pj.max_attempts then 'failed'
          else 'retryable'
        end,
        run_after = case
          when pj.attempt_count >= pj.max_attempts then pj.run_after
          else now() + make_interval(
            secs => least(
              300,
              greatest(15, power(2, least(pj.attempt_count, 10))::int * 5)
            )
          )
        end,
        locked_by = null,
        locked_at = null,
        heartbeat_at = null,
        last_error = coalesce(pj.last_error, 'Worker heartbeat timed out'),
        error_code = coalesce(pj.error_code, 'heartbeat_timeout'),
        finished_at = case
          when pj.attempt_count >= pj.max_attempts then now()
          else pj.finished_at
        end
    from stale s
    where pj.id = s.id
    returning pj.*
  )
  select * from recovered;
end;
$$;

revoke all on function public.requeue_stale_jobs(integer) from public;
grant execute on function public.requeue_stale_jobs(integer) to service_role;

-- 6) Hot-path indexes
create index if not exists songs_user_created_idx
  on public.songs (user_id, created_at desc);

create index if not exists songs_status_created_idx
  on public.songs (status, created_at desc);

create index if not exists sections_song_start_idx
  on public.sections (song_id, start_time);

create index if not exists chords_song_start_idx
  on public.chords (song_id, start_time);

create index if not exists processing_jobs_status_run_after_idx
  on public.processing_jobs (status, run_after, created_at);

create index if not exists processing_jobs_heartbeat_idx
  on public.processing_jobs (heartbeat_at)
  where status = 'running';
