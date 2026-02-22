-- Songs table
create table public.songs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  artist text,
  youtube_url text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  created_at timestamptz not null default now()
);

-- Stems table
create table public.stems (
  id uuid primary key default gen_random_uuid(),
  song_id uuid references public.songs(id) on delete cascade not null unique,
  original_url text,
  guitar_url text,
  vocals_url text,
  drums_url text,
  bass_url text
);

-- Sections table
create table public.sections (
  id uuid primary key default gen_random_uuid(),
  song_id uuid references public.songs(id) on delete cascade not null,
  label text not null,
  start_time float not null,
  end_time float not null
);

-- Enable RLS on all tables
alter table public.songs enable row level security;
alter table public.stems enable row level security;
alter table public.sections enable row level security;

-- Songs: owner can CRUD their own rows
create policy "Users can view their own songs"
  on public.songs for select
  using (auth.uid() = user_id);

create policy "Users can insert their own songs"
  on public.songs for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own songs"
  on public.songs for update
  using (auth.uid() = user_id);

create policy "Users can delete their own songs"
  on public.songs for delete
  using (auth.uid() = user_id);

-- Service role can manage all songs (for the Mac server)
create policy "Service role can manage all songs"
  on public.songs for all
  using (auth.role() = 'service_role');

-- Stems: accessible if user owns the song
create policy "Users can view stems for their songs"
  on public.stems for select
  using (exists (
    select 1 from public.songs where songs.id = stems.song_id and songs.user_id = auth.uid()
  ));

create policy "Users can insert stems for their songs"
  on public.stems for insert
  with check (exists (
    select 1 from public.songs where songs.id = stems.song_id and songs.user_id = auth.uid()
  ));

create policy "Service role can manage all stems"
  on public.stems for all
  using (auth.role() = 'service_role');

-- Sections: accessible if user owns the song
create policy "Users can view sections for their songs"
  on public.sections for select
  using (exists (
    select 1 from public.songs where songs.id = sections.song_id and songs.user_id = auth.uid()
  ));

create policy "Users can insert sections for their songs"
  on public.sections for insert
  with check (exists (
    select 1 from public.songs where songs.id = sections.song_id and songs.user_id = auth.uid()
  ));

create policy "Users can update sections for their songs"
  on public.sections for update
  using (exists (
    select 1 from public.songs where songs.id = sections.song_id and songs.user_id = auth.uid()
  ));

create policy "Users can delete sections for their songs"
  on public.sections for delete
  using (exists (
    select 1 from public.songs where songs.id = sections.song_id and songs.user_id = auth.uid()
  ));

create policy "Service role can manage all sections"
  on public.sections for all
  using (auth.role() = 'service_role');

-- Storage bucket for stems (public so audio URLs are directly playable)
insert into storage.buckets (id, name, public)
values ('stems', 'stems', true);

-- Storage RLS: users can access their own stems
create policy "Users can upload stems"
  on storage.objects for insert
  with check (
    bucket_id = 'stems'
    and auth.role() = 'authenticated'
  );

create policy "Users can view their stems"
  on storage.objects for select
  using (
    bucket_id = 'stems'
    and auth.role() = 'authenticated'
  );

create policy "Service role can manage all storage"
  on storage.objects for all
  using (
    bucket_id = 'stems'
    and auth.role() = 'service_role'
  );
