-- Strum Jam online mode: run this once in your Supabase project (SQL Editor -> New query -> paste -> Run).
-- Anyone can read jams, takes and posted performances and add new ones; nobody can edit or delete
-- through the public key. Audio goes in a public "takes" bucket, audio files up to 15 MB.

create table if not exists public.jams (
  id          text primary key,                       -- short join code, e.g. K7Q2XM
  created_at  timestamptz not null default now(),
  song_title  text not null check (char_length(song_title) <= 120),
  song_artist text not null default '' check (char_length(song_artist) <= 120),
  song_code   text not null check (char_length(song_code) <= 60000),   -- the chart (a Strum Jam song code)
  host_name   text not null check (char_length(host_name) <= 24)
);

create table if not exists public.takes (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  jam_id      text not null references public.jams(id) on delete cascade,
  player_name text not null check (char_length(player_name) <= 24),
  instrument  text not null check (instrument in ('guitar', 'bass', 'piano', 'drums', 'vocals')),
  score       integer not null check (score between 0 and 10000000),
  grade       text not null check (grade in ('S', 'A', 'B', 'C', 'D', 'F')),
  accuracy    real not null default 0 check (accuracy between 0 and 1),
  audio_path  text not null check (char_length(audio_path) <= 200),
  offset_ms   integer not null default 0 check (offset_ms between -60000 and 600000)   -- recording start -> first beat
);
create index if not exists takes_jam on public.takes (jam_id, created_at);

create table if not exists public.performances (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  jam_id      text not null references public.jams(id) on delete cascade,
  title       text not null check (char_length(title) <= 80),
  song_title  text not null check (char_length(song_title) <= 120),
  song_artist text not null default '' check (char_length(song_artist) <= 120),
  total_score integer not null check (total_score between 0 and 50000000),
  take_ids    uuid[] not null check (cardinality(take_ids) between 1 and 8),
  posted_by   text not null check (char_length(posted_by) <= 24)
);
create index if not exists performances_score on public.performances (total_score desc);
create index if not exists performances_recent on public.performances (created_at desc);

alter table public.jams enable row level security;
alter table public.takes enable row level security;
alter table public.performances enable row level security;

drop policy if exists "read jams" on public.jams;           create policy "read jams" on public.jams for select using (true);
drop policy if exists "add jams" on public.jams;            create policy "add jams" on public.jams for insert with check (true);
drop policy if exists "read takes" on public.takes;         create policy "read takes" on public.takes for select using (true);
drop policy if exists "add takes" on public.takes;          create policy "add takes" on public.takes for insert with check (true);
drop policy if exists "read performances" on public.performances; create policy "read performances" on public.performances for select using (true);
drop policy if exists "add performances" on public.performances;  create policy "add performances" on public.performances for insert with check (true);

-- audio: a public bucket for the takes (audio only, 15 MB each); anyone may upload, nobody may overwrite or delete
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('takes', 'takes', true, 15728640, array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/aac'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "upload takes" on storage.objects;
create policy "upload takes" on storage.objects for insert with check (bucket_id = 'takes');
drop policy if exists "read takes audio" on storage.objects;
create policy "read takes audio" on storage.objects for select using (bucket_id = 'takes');
