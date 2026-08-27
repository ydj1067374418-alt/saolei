create or replace function public.minesweeper_set_cell(
  p_board jsonb,
  p_index integer,
  p_cell jsonb
)
returns jsonb
language sql
immutable
as $$
  select jsonb_set(p_board, array[p_index::text], p_cell, false);
$$;

create or replace function public.minesweeper_neighbor_indexes(
  p_index integer,
  p_width integer,
  p_height integer
)
returns integer[]
language plpgsql
immutable
as $$
declare
  current_x integer := p_index % p_width;
  current_y integer := floor(p_index / p_width::numeric);
  next_x integer;
  next_y integer;
  neighbors integer[] := array[]::integer[];
begin
  for delta_y in -1..1 loop
    for delta_x in -1..1 loop
      if delta_x = 0 and delta_y = 0 then
        continue;
      end if;

      next_x := current_x + delta_x;
      next_y := current_y + delta_y;

      if next_x < 0 or next_x >= p_width or next_y < 0 or next_y >= p_height then
        continue;
      end if;

      neighbors := array_append(neighbors, next_y * p_width + next_x);
    end loop;
  end loop;

  return neighbors;
end;
$$;

create or replace function public.minesweeper_reveal_all_mines(
  p_board jsonb
)
returns jsonb
language plpgsql
immutable
as $$
declare
  board jsonb := coalesce(p_board, '[]'::jsonb);
  cell jsonb;
  total integer := coalesce(jsonb_array_length(board), 0);
begin
  if total = 0 then
    return board;
  end if;

  for idx in 0..total - 1 loop
    cell := coalesce(board -> idx, '{}'::jsonb);
    if coalesce((cell ->> 'mine')::boolean, false) then
      cell := jsonb_set(cell, '{revealed}', 'true'::jsonb, false);
      board := public.minesweeper_set_cell(board, idx, cell);
    end if;
  end loop;

  return board;
end;
$$;

create or replace function public.minesweeper_reveal_safe_area(
  p_board jsonb,
  p_start_index integer,
  p_width integer,
  p_height integer,
  p_player_name text
)
returns jsonb
language plpgsql
immutable
as $$
declare
  board jsonb := coalesce(p_board, '[]'::jsonb);
  queue integer[] := array[p_start_index];
  visited integer[] := array[]::integer[];
  current_index integer;
  current_length integer;
  cell jsonb;
  adjacent_count integer;
  neighbors integer[];
  neighbor_index integer;
begin
  while coalesce(array_length(queue, 1), 0) > 0 loop
    current_index := queue[1];
    current_length := array_length(queue, 1);

    if current_length = 1 then
      queue := array[]::integer[];
    else
      queue := queue[2:current_length];
    end if;

    if current_index = any(visited) then
      continue;
    end if;

    visited := array_append(visited, current_index);
    cell := coalesce(board -> current_index, '{}'::jsonb);

    if coalesce((cell ->> 'revealed')::boolean, false)
      or coalesce((cell ->> 'flagged')::boolean, false)
      or coalesce((cell ->> 'mine')::boolean, false) then
      continue;
    end if;

    cell := jsonb_set(cell, '{revealed}', 'true'::jsonb, false);
    cell := jsonb_set(cell, '{questioned}', 'false'::jsonb, false);
    cell := jsonb_set(cell, '{revealed_by}', to_jsonb(p_player_name), true);
    board := public.minesweeper_set_cell(board, current_index, cell);

    adjacent_count := coalesce((cell ->> 'adjacent')::integer, 0);
    if adjacent_count <> 0 then
      continue;
    end if;

    neighbors := public.minesweeper_neighbor_indexes(current_index, p_width, p_height);
    foreach neighbor_index in array neighbors loop
      if not neighbor_index = any(visited) then
        queue := array_append(queue, neighbor_index);
      end if;
    end loop;
  end loop;

  return board;
end;
$$;

create or replace function public.minesweeper_is_completed(
  p_board jsonb
)
returns boolean
language plpgsql
immutable
as $$
declare
  board jsonb := coalesce(p_board, '[]'::jsonb);
  total integer := coalesce(jsonb_array_length(board), 0);
  cell jsonb;
begin
  if total = 0 then
    return false;
  end if;

  for idx in 0..total - 1 loop
    cell := coalesce(board -> idx, '{}'::jsonb);
    if not coalesce((cell ->> 'mine')::boolean, false)
      and not coalesce((cell ->> 'revealed')::boolean, false) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.apply_minesweeper_action(
  p_room_id uuid,
  p_player_id text,
  p_player_name text,
  p_action_mode text,
  p_cell_index integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.minesweeper_rooms%rowtype;
  updated_room public.minesweeper_rooms%rowtype;
  board jsonb;
  cell jsonb;
  board_length integer;
  is_revealed boolean;
  is_flagged boolean;
  is_questioned boolean;
  is_mine boolean;
  next_status text;
  next_finished_at timestamptz;
  action_label text;
begin
  if p_action_mode not in ('reveal', 'flag', 'question') then
    return jsonb_build_object('applied', false, 'reason', 'invalid_action');
  end if;

  select *
  into room_row
  from public.minesweeper_rooms
  where id = p_room_id
  for update;

  if not found then
    return jsonb_build_object('applied', false, 'reason', 'room_not_found');
  end if;

  if room_row.status <> 'active' then
    return jsonb_build_object(
      'applied', false,
      'reason', 'room_inactive',
      'room', to_jsonb(room_row)
    );
  end if;

  board := coalesce(room_row.board_state, '[]'::jsonb);
  board_length := coalesce(jsonb_array_length(board), 0);

  if p_cell_index < 0 or p_cell_index >= board_length then
    return jsonb_build_object(
      'applied', false,
      'reason', 'cell_out_of_range',
      'room', to_jsonb(room_row)
    );
  end if;

  cell := coalesce(board -> p_cell_index, '{}'::jsonb);
  is_revealed := coalesce((cell ->> 'revealed')::boolean, false);
  is_flagged := coalesce((cell ->> 'flagged')::boolean, false);
  is_questioned := coalesce((cell ->> 'questioned')::boolean, false);
  is_mine := coalesce((cell ->> 'mine')::boolean, false);
  next_status := room_row.status;
  next_finished_at := room_row.finished_at;
  action_label := case p_action_mode
    when 'flag' then '切换了旗子'
    when 'question' then '切换了问号标记'
    else '翻开了格子'
  end;

  if p_action_mode = 'flag' then
    if is_revealed then
      return jsonb_build_object('applied', false, 'reason', 'cell_revealed', 'room', to_jsonb(room_row));
    end if;

    cell := jsonb_set(cell, '{flagged}', to_jsonb(not is_flagged), false);
    if not is_flagged then
      cell := jsonb_set(cell, '{questioned}', 'false'::jsonb, false);
    end if;

    board := public.minesweeper_set_cell(board, p_cell_index, cell);
  elsif p_action_mode = 'question' then
    if is_revealed then
      return jsonb_build_object('applied', false, 'reason', 'cell_revealed', 'room', to_jsonb(room_row));
    end if;

    cell := jsonb_set(cell, '{questioned}', to_jsonb(not is_questioned), false);
    if not is_questioned then
      cell := jsonb_set(cell, '{flagged}', 'false'::jsonb, false);
    end if;

    board := public.minesweeper_set_cell(board, p_cell_index, cell);
  else
    if is_revealed or is_flagged then
      return jsonb_build_object('applied', false, 'reason', 'cell_blocked', 'room', to_jsonb(room_row));
    end if;

    if is_mine then
      cell := jsonb_set(cell, '{revealed}', 'true'::jsonb, false);
      cell := jsonb_set(cell, '{questioned}', 'false'::jsonb, false);
      cell := jsonb_set(cell, '{revealed_by}', to_jsonb(p_player_name), true);
      board := public.minesweeper_set_cell(board, p_cell_index, cell);
      board := public.minesweeper_reveal_all_mines(board);
      next_status := 'lost';
      next_finished_at := now();
    else
      board := public.minesweeper_reveal_safe_area(
        board,
        p_cell_index,
        room_row.width,
        room_row.height,
        p_player_name
      );

      if public.minesweeper_is_completed(board) then
        next_status := 'won';
        next_finished_at := now();
      end if;
    end if;
  end if;

  update public.minesweeper_rooms
  set
    board_state = board,
    status = next_status,
    finished_at = next_finished_at,
    last_action_by = p_player_name || ' ' || action_label,
    revision = room_row.revision + 1
  where id = room_row.id
  returning *
  into updated_room;

  return jsonb_build_object(
    'applied', true,
    'room', to_jsonb(updated_room)
  );
end;
$$;

revoke all on function public.apply_minesweeper_action(uuid, text, text, text, integer) from public;
grant execute on function public.apply_minesweeper_action(uuid, text, text, text, integer) to anon;
grant execute on function public.apply_minesweeper_action(uuid, text, text, text, integer) to authenticated;
