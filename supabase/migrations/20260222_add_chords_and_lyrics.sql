-- Chords table — one row per chord occurrence
create table public.chords (
  id uuid primary key default gen_random_uuid(),
  song_id uuid references public.songs(id) on delete cascade not null,
  start_time float not null,
  end_time float not null,
  chord_label text not null,
  chord_standard text not null,
  confidence float
);

-- Lyrics table — one row per song
create table public.lyrics (
  id uuid primary key default gen_random_uuid(),
  song_id uuid references public.songs(id) on delete cascade not null unique,
  synced_lrc text,
  plain_text text,
  source text not null
);

-- Enable RLS
alter table public.chords enable row level security;
alter table public.lyrics enable row level security;

-- Chords: accessible if user owns the song (same pattern as sections)
create policy "Users can view chords for their songs"
  on public.chords for select
  using (exists (
    select 1 from public.songs where songs.id = chords.song_id and songs.user_id = auth.uid()
  ));

create policy "Users can insert chords for their songs"
  on public.chords for insert
  with check (exists (
    select 1 from public.songs where songs.id = chords.song_id and songs.user_id = auth.uid()
  ));

create policy "Users can update chords for their songs"
  on public.chords for update
  using (exists (
    select 1 from public.songs where songs.id = chords.song_id and songs.user_id = auth.uid()
  ));

create policy "Users can delete chords for their songs"
  on public.chords for delete
  using (exists (
    select 1 from public.songs where songs.id = chords.song_id and songs.user_id = auth.uid()
  ));

create policy "Service role can manage all chords"
  on public.chords for all
  using (auth.role() = 'service_role');

-- Lyrics: accessible if user owns the song (same pattern as sections)
create policy "Users can view lyrics for their songs"
  on public.lyrics for select
  using (exists (
    select 1 from public.songs where songs.id = lyrics.song_id and songs.user_id = auth.uid()
  ));

create policy "Users can insert lyrics for their songs"
  on public.lyrics for insert
  with check (exists (
    select 1 from public.songs where songs.id = lyrics.song_id and songs.user_id = auth.uid()
  ));

create policy "Users can update lyrics for their songs"
  on public.lyrics for update
  using (exists (
    select 1 from public.songs where songs.id = lyrics.song_id and songs.user_id = auth.uid()
  ));

create policy "Users can delete lyrics for their songs"
  on public.lyrics for delete
  using (exists (
    select 1 from public.songs where songs.id = lyrics.song_id and songs.user_id = auth.uid()
  ));

create policy "Service role can manage all lyrics"
  on public.lyrics for all
  using (auth.role() = 'service_role');
