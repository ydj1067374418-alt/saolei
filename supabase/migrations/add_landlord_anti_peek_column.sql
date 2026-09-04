alter table public.landlord_players
  add column if not exists anti_peek_enabled boolean not null default false;
