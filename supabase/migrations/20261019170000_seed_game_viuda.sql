insert into public.games (id, title, short, long, cat, cover, color)
values (
  'viuda',
  'VIUDA',
  'Póker por vidas contra la computadora.',
  'Cada jugador tiene tres vidas y cinco cartas, y en el centro espera la viuda. En tu turno cambias tus cartas por las de la viuda, pasas o llamas cuando crees tener la mejor mano de póker. Quien tenga la peor mano en el duelo pierde una vida. Enfréntate a tres rivales controlados por la computadora y sobrevive hasta ser el último en pie.',
  'ARCADE',
  'cover-viuda',
  'green'
)
on conflict (id) do nothing;
