# Supabase: dar de alta un juego

Proyecto remoto `mendwbsdxpwrrrqlsmxe`, accesible por el MCP `supabase`. Antes de cambiar nada, inspecciona con `list_tables` y `list_migrations`.

## Qué existe ya

`supabase/migrations/20261019150444_create_games_and_scores.sql` crea:

- `public.games` (`id` text PK, `title`, `short`, `long`, `cat` con CHECK `ARCADE|PUZZLE|SHOOTER`, `cover`, `color` con CHECK `cyan|magenta|yellow|green`, `created_at`).
- `public.scores` (`id` uuid, `game_id` FK → `games.id`, `player_name`, `score` int, `user_id` nullable, `created_at`) e índice `(game_id, score desc)`.

`20261019150612_open_policies_games_and_scores.sql` abre RLS: select público en ambas tablas e insert público en `scores`.

**Un juego nuevo no necesita tablas ni políticas nuevas.** Solo la fila en `games`.

## Migración seed

Archivo `supabase/migrations/<YYYYMMDDHHMMSS>_seed_game_<id>.sql` (timestamp posterior a la última migración):

```sql
insert into public.games (id, title, short, long, cat, cover, color)
values (
  '<id>',
  '<TÍTULO>',
  '<frase corta>',
  '<descripción larga que no prometa mecánicas que el juego no tiene>',
  '<ARCADE|PUZZLE|SHOOTER>',
  '<cover-xxx>',
  '<cyan|magenta|yellow|green>'
)
on conflict (id) do nothing;
```

1. Muestra el SQL al usuario y confirma antes de aplicarlo (escribe en el proyecto remoto).
2. Aplica con `apply_migration` del MCP usando **el mismo nombre** que el archivo (sin timestamp ni extensión).
3. Verifica con `execute_sql`: `select id, title, cat, cover, color from games;`.
4. Regenera `lib/supabase/database.types.ts` con `generate_typescript_types` (se sobrescribe el archivo completo, no se edita a mano).
5. Corre `get_advisors` (security) y reporta cualquier aviso nuevo.

## Si hace falta un `cat` o `color` nuevo

Los CHECK lo impiden. Entonces:

1. Migración `alter table public.games drop constraint <nombre>, add constraint ... check (...)` (consulta el nombre real con `execute_sql` sobre `pg_constraint`).
2. Actualiza `GameRow` en `lib/supabase/types.ts` y `CATS` en `lib/games.ts`.
3. Revisa las clases de color/filtro en `components/library-view.tsx` y `components/game-card.tsx`.

Valídalo con el usuario: es un cambio de catálogo, no solo del juego.

## Cover CSS

`cover` es una clase de `app/globals.css` (`.cover-bricks`, `.cover-tetro`, `.cover-snake`, `.cover-glot`, `.cover-invaders`, `.cover-rocas`, `.cover-rana`, `.cover-duelo`). Reutiliza una que encaje. Si creas una nueva, sigue la estructura de las existentes (fondo + `::after`/`::before` decorativos dentro de `.cover-bg`) y diséñala con `/frontend-design`.

## Qué NO hay que tocar

- `save()` en `components/game-player.tsx`: inserta con `game_id: gameId`, genérico.
- `lib/supabase/queries.ts` (`getGames`, `getGame`, `getTopScores`, `getBestScores`, `getScoreCount`): genéricos por `game_id`.
- `/juego/[id]`, `/juego/[id]/jugar`, `/salon`: ya leen de Supabase y listan todos los juegos de `games`.

## Limitaciones vigentes (no las arregles aquí)

- RLS abierta: cualquiera puede insertar scores. Se resolverá en un spec de seguridad.
- `user_id` siempre `null` hasta que exista auth real.
- Sin realtime ni paginación (top 10 fijo en detalle).

## Datos de prueba

Si insertas scores para verificar, anota sus `id` y bórralos al terminar, previa confirmación del usuario. No toques scores que no hayas creado.
