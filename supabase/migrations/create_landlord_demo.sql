create extension if not exists pgcrypto;

create table if not exists public.landlord_rooms (
  id uuid primary key default gen_random_uuid(),
  room_name text not null,
  host_player_id text not null,
  host_name text not null,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished', 'closed')),
  phase text not null default 'waiting' check (phase in ('waiting', 'call', 'rob', 'play', 'finished')),
  round_no integer not null default 0,
  multiplier integer not null default 1,
  current_call_score integer not null default 0,
  call_index integer not null default 0,
  play_index integer not null default 0,
  pass_streak integer not null default 0,
  ready_count integer not null default 0,
  current_bidding_player_id text,
  bidding_anchor_player_id text,
  rob_responses_count integer not null default 0,
  landlord_player_id text,
  turn_player_id text,
  deck_state jsonb not null default '[]'::jsonb,
  bottom_cards jsonb not null default '[]'::jsonb,
  last_play_cards jsonb not null default '[]'::jsonb,
  last_play_combo jsonb,
  last_play_player_id text,
  settlement jsonb,
  last_action_by text,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.landlord_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.landlord_rooms(id) on delete cascade,
  player_id text not null,
  player_name text not null,
  player_color text not null,
  seat_index integer not null default 0,
  is_ready boolean not null default false,
  hand_cards jsonb not null default '[]'::jsonb,
  role text not null default 'farmer' check (role in ('farmer', 'landlord')),
  round_score_delta integer not null default 0,
  total_score_snapshot integer not null default 0,
  anti_peek_enabled boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (room_id, player_id)
);

create index if not exists landlord_rooms_status_idx
  on public.landlord_rooms (status, updated_at desc);

create index if not exists landlord_players_room_id_idx
  on public.landlord_players (room_id);

create or replace function public.set_landlord_rooms_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_landlord_rooms_updated_at on public.landlord_rooms;

create trigger set_landlord_rooms_updated_at
before update on public.landlord_rooms
for each row
execute function public.set_landlord_rooms_updated_at();

alter table public.landlord_rooms enable row level security;
alter table public.landlord_players enable row level security;

drop policy if exists "landlord rooms select" on public.landlord_rooms;
drop policy if exists "landlord rooms insert" on public.landlord_rooms;
drop policy if exists "landlord rooms update" on public.landlord_rooms;
drop policy if exists "landlord rooms delete" on public.landlord_rooms;
drop policy if exists "landlord players select" on public.landlord_players;
drop policy if exists "landlord players insert" on public.landlord_players;
drop policy if exists "landlord players update" on public.landlord_players;
drop policy if exists "landlord players delete" on public.landlord_players;

create policy "landlord rooms select"
on public.landlord_rooms
for select
using (true);

create policy "landlord rooms insert"
on public.landlord_rooms
for insert
with check (true);

create policy "landlord rooms update"
on public.landlord_rooms
for update
using (true)
with check (true);

create policy "landlord rooms delete"
on public.landlord_rooms
for delete
using (true);

create policy "landlord players select"
on public.landlord_players
for select
using (true);

create policy "landlord players insert"
on public.landlord_players
for insert
with check (true);

create policy "landlord players update"
on public.landlord_players
for update
using (true)
with check (true);

create policy "landlord players delete"
on public.landlord_players
for delete
using (true);

do $$
begin
  begin
    alter publication supabase_realtime add table public.landlord_rooms;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.landlord_players;
  exception
    when duplicate_object then null;
  end;
end
$$;
