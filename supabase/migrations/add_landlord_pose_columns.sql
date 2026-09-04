alter table public.landlord_players
  add column if not exists pos_x double precision not null default 0,
  add column if not exists pos_y double precision not null default 0,
  add column if not exists pos_z double precision not null default 0,
  add column if not exists yaw double precision not null default 0,
  add column if not exists pitch double precision not null default 0,
  add column if not exists is_moving boolean not null default false;
