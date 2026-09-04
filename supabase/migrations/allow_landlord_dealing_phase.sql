alter table public.landlord_rooms
  drop constraint if exists landlord_rooms_phase_check;

alter table public.landlord_rooms
  add constraint landlord_rooms_phase_check
  check (phase in ('waiting', 'dealing', 'call', 'rob', 'play', 'finished'));
