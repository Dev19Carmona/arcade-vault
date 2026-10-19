insert into public.games (id, title, short, long, cat, cover, color)
values (
  'tetris',
  'TETRIS',
  'Encaja piezas y limpia líneas.',
  'Las piezas caen sin parar sobre un tablero de 10×20. Muévelas, rótalas y encájalas para completar líneas: cada línea que limpias suma puntos, sube el nivel cada 10 y acelera la caída. Hay ocho formas, incluida la tuerca. La partida termina cuando las piezas se apilan hasta arriba.',
  'PUZZLE',
  'cover-tetro',
  'magenta'
)
on conflict (id) do nothing;
