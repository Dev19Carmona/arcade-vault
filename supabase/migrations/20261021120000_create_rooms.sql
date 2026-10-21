create table public.rooms (
  code text primary key check (code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$'),
  host_id text not null,
  host_name text not null check (char_length(host_name) between 1 and 16),
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'closed')),
  player_count smallint not null default 1 check (player_count between 1 and 9),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rooms_status_updated_at_idx on public.rooms (status, updated_at);

alter table public.rooms enable row level security;

create policy "rooms_select_public" on public.rooms
  for select to anon, authenticated
  using (true);

create policy "rooms_insert_public" on public.rooms
  for insert to anon, authenticated
  with check (true);

create policy "rooms_update_public" on public.rooms
  for update to anon, authenticated
  using (true)
  with check (true);
