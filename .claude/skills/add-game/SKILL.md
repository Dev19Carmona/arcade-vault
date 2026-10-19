---
name: add-game
description: Crea o porta un juego a Arcade Vault con su leaderboard en Supabase. Úsala cuando pidan crear, portar, agregar o integrar un juego a la plataforma (con o sin fuente en references/started-games), o "nuevo juego con leaderboard". Sigue Spec Driven Design: escribe la spec, espera aprobación e implementa motor, canvas, seed en Supabase e integración.
argument-hint: <id-del-juego | carpeta en references/started-games>
---

# add-game

Añade un juego jugable a la plataforma, con puntuaciones guardadas en `scores` y visibles en `/juego/<id>` y `/salon`. Los patrones salen de `specs/04-juego-asteroids.md` (motor + canvas + integración) y `specs/05-games-table-leaderboard-supabase.md` (tablas `games` y `scores`).

Documentos de apoyo (léelos cuando la fase lo indique):

- `references/engine-contract.md`: contrato motor/canvas/registro y bootstrap del registro.
- `references/porting-guide.md`: cómo portar un `game.js` vanilla.
- `references/supabase-seed.md`: migración seed, tipos y cover CSS.
- `templates/spec-template.md`: esqueleto de la spec.

Respuestas y specs siempre en español.

## Fase 0 — Pre-lectura (obligatoria)

1. `AGENTS.md`: Next 16 tiene cambios incompatibles. Lee en `node_modules/next/dist/docs/` la guía de Client Components / `use client` antes de escribir código.
2. `specs/04-juego-asteroids.md` y `specs/05-games-table-leaderboard-supabase.md`.
3. Implementación de referencia: `lib/games/asteroids/*`, `components/games/asteroids-canvas.tsx`, `components/game-player.tsx`, `lib/supabase/queries.ts`.
4. Estado real del repo, que prevalece sobre lo que digan las specs: ids en inglés (`asteroids`), rutas `/juego/[id]` y `/juego/[id]/jugar`, salón en `/salon`, `save()` de `GamePlayer` ya inserta en `scores` con `game_id`. El leaderboard es genérico por `game_id`: un juego nuevo solo necesita su fila en `games`.

## Fase 1 — Origen del juego

Resuelve `$ARGUMENTS`:

- **Con fuente**: si existe `references/started-games/*<arg>*`, lee su `CLAUDE.md`, `README.md`, `game.js` y extras (`levels.js`, `assets/`). Inventaría: acceso al DOM, listeners, bucle propio, HUD/overlays dibujados, audio, sprites, ratón y estado de teclas. Aplica `references/porting-guide.md`.
- **Sin fuente**: no escribas código todavía. Diseña el juego con el usuario usando `AskUserQuestion`: género/categoría, controles, mecánica principal, puntuación, vidas y niveles, condición de fin. Con las respuestas, define el motor desde cero siguiendo el mismo contrato.

## Fase 2 — Metadatos de catálogo

Propón y confirma con el usuario: `id` (kebab-case, inglés, igual que la carpeta `lib/games/<id>/`), `title`, `short`, `long`, `cat` ∈ {`ARCADE`,`PUZZLE`,`SHOOTER`}, `color` ∈ {`cyan`,`magenta`,`yellow`,`green`} (hay `CHECK` en la tabla) y `cover`. Reutiliza una clase `cover-*` existente de `app/globals.css` si encaja; si hace falta una nueva, diséñala con `/frontend-design` (instrucción del CLAUDE.md del proyecto).

## Fase 3 — Spec

1. Calcula el siguiente `NN` mirando `specs/`.
2. Escribe `specs/NN-juego-<id>.md` desde `templates/spec-template.md`, estado **Borrador**.
3. Si no existe `components/games/registry.ts`, incluye el bootstrap del registro como paso 1 de la spec (ver `references/engine-contract.md`).
4. Muestra un resumen de la spec y **detente a pedir aprobación**. No implementes sin ella.

## Fase 4 — Implementación

Sigue el plan de la spec. Tras cada paso corre `npm run lint` y `npm run build`.

1. Bootstrap del registro (solo si falta), manteniendo Asteroids funcionando.
2. `lib/games/<id>/`: `types.ts`, `constants.ts`, `utils.ts`, `entities.ts`, `engine.ts`.
3. `components/games/<id>-canvas.tsx` y entrada en `components/games/registry.ts`.
4. Cover CSS si es nueva (`app/globals.css`).
5. Migración `supabase/migrations/<YYYYMMDDHHMMSS>_seed_game_<id>.sql` aplicada con `apply_migration` del MCP (mismo nombre), luego `generate_typescript_types` para regenerar `lib/supabase/database.types.ts` (no se edita a mano) y `get_advisors`.
6. Actualiza la sección "Juegos" del `CLAUDE.md` del proyecto (juegos reales, fuente original, teclas).

Reglas fijas:

- Nada de `window`/`document` en `lib/games/<id>/`; sin `any`; entidades reciben `ctx` por parámetro.
- El HUD y el overlay de fin dibujados en canvas no se portan: los da la plataforma (`GamePlayer`).
- `onChange` solo cuando cambia algún campo del snapshot; `onGameOver` una única vez por partida.
- `dt` en segundos, acotado a 0,05; al pausar o volver de otra pestaña, `dt = 0` en el primer frame.
- Limpieza completa al desmontar (listeners y rAF), también en StrictMode.
- `preventDefault` solo sobre las teclas del juego y nunca dentro de inputs (el modal tiene uno).
- Nada aleatorio durante el render: el motor se crea en un efecto del cliente.
- No toques `save()` ni las queries: ya son genéricos.

## Fase 5 — Verificación

Con `npm run dev` y el MCP de Playwright (o a mano si no está disponible):

- `/juego/<id>/jugar`: controles, pausa/reanudar, `FIN`, game over → modal, guardar, jugar de nuevo.
- `/juego/<id>`: top 10 y estado vacío ("Sé el primero en entrar al salón de la fama").
- `/salon`: aparece el juego.
- 375 px de ancho sin scroll horizontal; consola sin errores ni warnings de hidratación.
- Salir y volver no duplica disparos ni velocidad del bucle.
- Confirma el insert con `execute_sql`: `select player_name, score from scores where game_id = '<id>' order by created_at desc limit 5;` y borra solo las filas de prueba que hayas creado, preguntando antes.
- Otros juegos del catálogo siguen igual.

## Fase 6 — Cierre

Marca la spec como **Implementado**, resume qué se hizo y qué quedó fuera de alcance. No hagas commit salvo que el usuario lo pida.
