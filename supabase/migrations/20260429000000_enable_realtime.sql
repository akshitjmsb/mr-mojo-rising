-- Enable Supabase Realtime for live status updates on the import flow and
-- the library page. Replaces 3-4 second polling that drained mobile battery.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'songs'
  ) then
    execute 'alter publication supabase_realtime add table public.songs';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'processing_jobs'
  ) then
    execute 'alter publication supabase_realtime add table public.processing_jobs';
  end if;
end $$;
