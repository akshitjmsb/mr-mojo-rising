-- Drop auth coupling: app is now fully public (no login).
-- Remove user-scoped RLS policies, drop FK to auth.users, make user_id nullable.

-- Drop auth-scoped RLS policies on songs
drop policy if exists "Users can view their own songs" on public.songs;
drop policy if exists "Users can insert their own songs" on public.songs;
drop policy if exists "Users can update their own songs" on public.songs;
drop policy if exists "Users can delete their own songs" on public.songs;

-- Drop auth-scoped RLS policies on stems
drop policy if exists "Users can view stems for their songs" on public.stems;
drop policy if exists "Users can insert stems for their songs" on public.stems;

-- Drop auth-scoped RLS policies on sections
drop policy if exists "Users can view sections for their songs" on public.sections;
drop policy if exists "Users can insert sections for their songs" on public.sections;
drop policy if exists "Users can update sections for their songs" on public.sections;
drop policy if exists "Users can delete sections for their songs" on public.sections;

-- Drop auth-scoped RLS policies on chords / lyrics (if present from later migration)
drop policy if exists "Users can view chords for their songs" on public.chords;
drop policy if exists "Users can insert chords for their songs" on public.chords;
drop policy if exists "Users can update chords for their songs" on public.chords;
drop policy if exists "Users can delete chords for their songs" on public.chords;
drop policy if exists "Users can view lyrics for their songs" on public.lyrics;
drop policy if exists "Users can insert lyrics for their songs" on public.lyrics;
drop policy if exists "Users can update lyrics for their songs" on public.lyrics;
drop policy if exists "Users can delete lyrics for their songs" on public.lyrics;

-- Drop auth-scoped RLS policies on processing_jobs
drop policy if exists "Users can view their own jobs" on public.processing_jobs;
drop policy if exists "Users can insert their own jobs" on public.processing_jobs;
drop policy if exists "Users can update their own jobs" on public.processing_jobs;
drop policy if exists "Users can delete their own jobs" on public.processing_jobs;

-- Open read/write to anon and authenticated roles (app has no auth)
create policy "Public can read songs" on public.songs for select using (true);
create policy "Public can write songs" on public.songs for all using (true) with check (true);

create policy "Public can read stems" on public.stems for select using (true);
create policy "Public can write stems" on public.stems for all using (true) with check (true);

create policy "Public can read sections" on public.sections for select using (true);
create policy "Public can write sections" on public.sections for all using (true) with check (true);

do $$
begin
  if to_regclass('public.chords') is not null then
    execute 'create policy "Public can read chords" on public.chords for select using (true)';
    execute 'create policy "Public can write chords" on public.chords for all using (true) with check (true)';
  end if;
  if to_regclass('public.lyrics') is not null then
    execute 'create policy "Public can read lyrics" on public.lyrics for select using (true)';
    execute 'create policy "Public can write lyrics" on public.lyrics for all using (true) with check (true)';
  end if;
end $$;

create policy "Public can read jobs" on public.processing_jobs for select using (true);
create policy "Public can write jobs" on public.processing_jobs for all using (true) with check (true);

-- Drop FKs to auth.users and make user_id nullable
alter table public.songs drop constraint if exists songs_user_id_fkey;
alter table public.songs alter column user_id drop not null;

alter table public.processing_jobs drop constraint if exists processing_jobs_user_id_fkey;
alter table public.processing_jobs alter column user_id drop not null;

-- Open storage reads on stems bucket to anon (bucket is already public, but add explicit policy)
drop policy if exists "Users can upload stems" on storage.objects;
drop policy if exists "Users can view their stems" on storage.objects;

create policy "Public can read stems bucket"
  on storage.objects for select
  using (bucket_id = 'stems');
