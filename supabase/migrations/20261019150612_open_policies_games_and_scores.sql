create policy "games_select_public" on public.games
  for select to anon, authenticated
  using (true);

create policy "scores_select_public" on public.scores
  for select to anon, authenticated
  using (true);

create policy "scores_insert_public" on public.scores
  for insert to anon, authenticated
  with check (true);
