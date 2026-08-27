create extension if not exists pgcrypto;

create table if not exists public.minesweeper_rooms (
  id uuid primary key default gen_random_uuid(),
  room_name text not null,
  host_player_id text not null,
  host_name text not null,
  difficulty text not null default 'custom',
  width integer not null check (width between 6 and 30),
  height integer not null check (height between 6 and 24),
  mine_count integer not null check (mine_count > 0 and mine_count < width * height),
  status text not null default 'waiting' check (status in ('waiting', 'active', 'won', 'lost')),
  board_state jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  last_action_by text,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.minesweeper_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.minesweeper_rooms(id) on delete cascade,
  player_id text not null,
  player_name text not null,
  player_color text not null,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (room_id, player_id)
);

create index if not exists minesweeper_rooms_status_idx
  on public.minesweeper_rooms (status, updated_at desc);

create index if not exists minesweeper_players_room_id_idx
  on public.minesweeper_players (room_id);

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_minesweeper_rooms_updated_at on public.minesweeper_rooms;

create trigger set_minesweeper_rooms_updated_at
before update on public.minesweeper_rooms
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.minesweeper_rooms enable row level security;
alter table public.minesweeper_players enable row level security;

drop policy if exists "demo rooms select" on public.minesweeper_rooms;
drop policy if exists "demo rooms insert" on public.minesweeper_rooms;
drop policy if exists "demo rooms update" on public.minesweeper_rooms;
drop policy if exists "demo rooms delete" on public.minesweeper_rooms;
drop policy if exists "demo players select" on public.minesweeper_players;
drop policy if exists "demo players insert" on public.minesweeper_players;
drop policy if exists "demo players update" on public.minesweeper_players;
drop policy if exists "demo players delete" on public.minesweeper_players;

create policy "demo rooms select"
on public.minesweeper_rooms
for select
using (true);

create policy "demo rooms insert"
on public.minesweeper_rooms
for insert
with check (true);

create policy "demo rooms update"
on public.minesweeper_rooms
for update
using (true)
with check (true);

create policy "demo rooms delete"
on public.minesweeper_rooms
for delete
using (true);

create policy "demo players select"
on public.minesweeper_players
for select
using (true);

create policy "demo players insert"
on public.minesweeper_players
for insert
with check (true);

create policy "demo players update"
on public.minesweeper_players
for update
using (true)
with check (true);

create policy "demo players delete"
on public.minesweeper_players
for delete
using (true);

do $$
begin
  begin
    alter publication supabase_realtime add table public.minesweeper_rooms;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.minesweeper_players;
  exception
    when duplicate_object then null;
  end;
end
$$;
