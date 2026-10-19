# SPEC 06 — Juego real: Tetris

> **Estado:** Implementado
> **Depende de:** SPEC 04 (patrón motor + canvas), SPEC 05 (tablas `games` y `scores`)
> **Fecha:** 2026-10-19
> **Objetivo:** Portar Tetris como el juego `tetris` en `/juego/tetris/jugar`, integrado con el HUD, la pausa y el modal de la plataforma, con su fila en la tabla `games` y las puntuaciones guardadas en `scores`.

---

## Por qué existe este spec

La fuente está en `references/started-games/03-tetris/` (`index.html`, `style.css`, `game.js` de ~330 líneas, README y CLAUDE.md). Es un script global con `document.getElementById`, dos `<canvas>` (tablero y vista previa), HUD y overlay en el DOM, `keydown` en `document`, un bucle `requestAnimationFrame` propio con tiempos en ms y un selector de tema claro/oscuro en `localStorage`. No se puede insertar tal cual en React sin estado global ni fugas de listeners.

Hoy el catálogo solo tiene `asteroids` en la tabla `games`; Tetris no existe todavía en Supabase. Además, `GamePlayer` sigue con la rama `isAsteroids` escrita a mano: este es el segundo juego real y el momento de generalizarla con un registro (bootstrap descrito en `.claude/skills/add-game/references/engine-contract.md`).

---

## Alcance

**Dentro:**

- Bootstrap del registro: `lib/games/types.ts` (`GameSnapshot`, `GameCanvasProps`), `components/games/registry.ts`, `GamePlayer` genérico y Asteroids migrado sin cambios de comportamiento.
- Motor en `lib/games/tetris/` (TypeScript estricto, sin `window`/`document`).
- Componente cliente `components/games/tetris-canvas.tsx` con `<canvas>` 800×600, teclado, `requestAnimationFrame` y limpieza al desmontar.
- Entrada `tetris` en `components/games/registry.ts`.
- HUD de la plataforma alimentado por el snapshot: puntuación, nivel y extra `LÍNEAS`. Sin vidas (el HUD las oculta).
- Pausa, `FIN`, fin de partida → modal "FIN DEL JUEGO", "JUGAR DE NUEVO".
- Fila `tetris` en `games` (migración seed) y guardado de puntuación en `scores` con el `save()` existente.
- Mecánicas del original: tablero 10×20, **8 piezas** (I, O, T, S, Z, J, L y la tuerca N de 3×3), rotación horaria con _wall kicks_ `[0,-1,1,-2,2]`, soft drop (+1 por fila), hard drop (+2 por celda), pieza fantasma (alpha 0,2), vista previa de la siguiente pieza, puntos por línea `[0,100,300,500,800] × nivel`, nivel = `floor(líneas/10)+1`, intervalo de caída `max(100, 1000 − (nivel−1)×90)` ms.
- Escalado responsivo del canvas 800×600 dentro de `.crt-screen` (4:3), sin cambiar el CSS: tablero 300×600 centrado y vista previa a su derecha, dibujados en el mismo canvas.
- Documentar el juego en `CLAUDE.md` (sección "Juegos").

**Fuera de alcance:**

- Controles táctiles / gamepad virtual.
- Sonido y música (el original no tiene).
- Selector de tema claro/oscuro del original (`tetris-theme` en `localStorage`): la plataforma ya fija el tema.
- Récord local: lo reemplaza el leaderboard de Supabase.
- Cambios de RLS, auth real o `user_id`.
- Paginación o realtime en leaderboards.
- Tests automatizados (el proyecto no tiene framework de tests).
- Hold, bolsa de 7 (7-bag), SRS, lock delay y otros extras modernos: el original usa piezas aleatorias uniformes.

---

## Inventario del original y destino

| En `game.js`                                                       | Destino                                                                                       |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `COLS`, `ROWS`, `BLOCK`, `COLORS`, `PIECES`, `LINE_SCORES`         | `constants.ts`, mismos valores                                                                |
| `createBoard`, `rotateCW`, `randomPiece`                           | `utils.ts` (puras; `randomPiece` usa `Math.random` solo dentro del motor)                     |
| `collide`, `tryRotate`, `merge`, `clearLines`, `ghostY`            | `engine.ts` (estado local del motor)                                                          |
| `drawBlock`, `drawGrid`, `draw`, `drawNext`                        | `entities.ts` (`drawBlock(ctx, …)`) y `engine.draw(ctx)` en un único canvas                   |
| `getComputedStyle(...).getPropertyValue('--grid-line')`            | Color fijo en `constants.ts` (el motor no toca el DOM)                                        |
| `document.getElementById` de `score`/`lines`/`level` + `updateHUD` | Se elimina; el HUD sale del snapshot                                                          |
| `overlay`, `endGame()` DOM, `togglePause()` y tecla `P`            | Se eliminan; los dan `GamePlayer` ("EN PAUSA", modal)                                         |
| `restartBtn` / `init()`                                            | `reset()` del motor, llamado al cambiar `runId`                                               |
| `keydown` en `document`                                            | Listeners en el componente canvas → `press(code)`                                             |
| `loop(ts)` con `dt` en ms, `performance.now()`                     | Bucle del componente; el motor recibe `dt` en segundos (acotado a 0,05) y acumula en segundos |
| `next-canvas` 120×120                                              | Se dibuja en el canvas principal (cuadro de 120×120 a la derecha del tablero)                 |
| `themeToggle`, `localStorage` `tetris-theme`                       | Fuera de alcance                                                                              |

---

## Modelo de datos

Fila nueva en `games` (sin tablas nuevas):

| id       | title    | short                            | cat      | cover         | color     |
| -------- | -------- | -------------------------------- | -------- | ------------- | --------- |
| `tetris` | `TETRIS` | `Encaja piezas y limpia líneas.` | `PUZZLE` | `cover-tetro` | `magenta` |

`long` (no promete mecánicas ausentes): «Las piezas caen sin parar sobre un tablero de 10×20. Muévelas, rótalas y encájalas para completar líneas: cada línea que limpias suma puntos, sube el nivel cada 10 y acelera la caída. Hay ocho formas, incluida la tuerca. La partida termina cuando las piezas se apilan hasta arriba.»

Contrato genérico nuevo (bootstrap):

```ts
// lib/games/types.ts
export interface GameSnapshot {
  score: number;
  lives?: number; // el HUD oculta "Vidas" si es undefined
  level?: number; // el HUD oculta "Nivel" si es undefined
  stats?: { label: string; value: string }[];
}

export interface GameCanvasProps {
  paused: boolean;
  runId: number;
  onChange: (snapshot: GameSnapshot) => void;
  onGameOver: (finalScore: number) => void;
}
```

Interfaz entre motor y React:

```ts
// lib/games/tetris/types.ts
export interface TetrisSnapshot {
  score: number;
  lines: number;
  level: number;
}

export interface TetrisEngineOptions {
  onChange: (snapshot: TetrisSnapshot) => void; // solo cuando cambia algún campo
  onGameOver: (finalScore: number) => void; // una única vez por partida
}

export interface TetrisEngine {
  update(dt: number): void; // segundos, acotado a 0.05
  draw(ctx: CanvasRenderingContext2D): void;
  press(code: string): void; // acción de un solo frame: mover, rotar, soft/hard drop
  reset(): void;
  getSnapshot(): TetrisSnapshot;
}
```

El canvas traduce `TetrisSnapshot` a `GameSnapshot`: `{ score, level, stats: [{ label: "LÍNEAS", value: String(lines) }] }`.

Geometría del canvas lógico: `W = 800`, `H = 600`; tablero en `BOARD_X = 250`, `BOARD_Y = 0` (300×600); vista previa 120×120 en `(580, 40)` con la etiqueta «SIGUIENTE» dibujada encima.

Estructura de archivos:

```
lib/games/types.ts
lib/games/tetris/ types.ts constants.ts utils.ts entities.ts engine.ts
components/games/tetris-canvas.tsx
components/games/registry.ts
supabase/migrations/<timestamp>_seed_game_tetris.sql
```

---

## Plan de implementación

Antes de escribir código, leer en `node_modules/next/dist/docs/` la guía de Client Components (`use-client`, ya revisada). La interfaz y el cover se ajustan con `/frontend-design` si hiciera falta; `cover-tetro` ya existe y se reutiliza.

1. **Bootstrap del registro.** Crear `lib/games/types.ts` y `components/games/registry.ts`; adaptar `AsteroidsCanvas` para emitir `GameSnapshot` (`{ score, lives, level }`); `GamePlayer` usa `GAME_CANVASES[gameId]`, `snapshot: GameSnapshot | null`, HUD con "Vidas"/"Nivel" condicionales (la simulación conserva 3 vidas y nivel derivado) y `stats` como `hud-stat` extra. Verificación: `/juego/asteroids/jugar` idéntico; lint y build.
2. **Constantes, utilidades y tipos** de Tetris. Verificación: lint y build.
3. **Entidades** (`drawBlock`, pieza activa con `shape/x/y`). Verificación: build, sin `any`.
4. **Motor:** tablero, `collide`, `tryRotate`, `merge`, `clearLines`, `ghostY`, `hardDrop`, `softDrop`, `spawn`, acumulador de caída en segundos, `draw` (rejilla, tablero, fantasma, pieza, vista previa) y emisión de `onChange`/`onGameOver`. Verificación: el módulo no importa `window`/`document`; build.
5. **Componente canvas y registro.** Teclas del juego: `ArrowLeft`, `ArrowRight`, `ArrowDown`, `ArrowUp`, `KeyX`, `Space`. Mover y soft drop aceptan repetición del teclado (como el original); rotar y hard drop solo con `!e.repeat`. Entrada `tetris` en el registro. Verificación: montar/desmontar sin listeners ni rAF residuales (también en StrictMode).
6. **Pausa y foco.** Verificación: pausar 10 s y reanudar no cambia el estado de la partida.
7. **Escalado.** Verificación: a 375 px el canvas se ve completo, sin scroll horizontal, sin tocar `.game-canvas` (Asteroids intacto).
8. **Seed en Supabase.** Migración `seed_game_tetris` aplicada con `apply_migration`, `generate_typescript_types` y `get_advisors`. Verificación: `select * from games where id = 'tetris'`.
9. **Cover y catálogo.** Verificación: el juego aparece en `/games` y `/juego/tetris` con `cover-tetro`.
10. **Documentación.** Actualizar la sección "Juegos" de `CLAUDE.md` (juego real, fuente original, teclas, registro). Verificación: lectura del archivo.

---

## Criterios de aceptación

- [ ] `npm run lint` y `npm run build` terminan sin errores.
- [ ] `/juego/tetris/jugar` muestra el canvas real con el tablero 10×20 centrado y la vista previa; `/juego/asteroids/jugar` y los demás juegos conservan su comportamiento.
- [ ] `←`/`→` mueven la pieza, `↑` o `X` la rotan en sentido horario con wall kicks, `↓` hace soft drop (+1 punto por fila) y `Espacio` hard drop (+2 por celda).
- [ ] Mantener `↑`, `X` o `Espacio` no repite la acción; mantener `←`, `→` o `↓` sí.
- [ ] Las teclas del juego no hacen scroll de la página ni activan botones con foco, y no se capturan dentro del input del modal.
- [ ] Aparecen las 8 piezas (incluida la tuerca N gris) y la pieza fantasma se dibuja con alpha 0,2.
- [ ] Limpiar 1/2/3/4 líneas suma 100/300/500/800 × nivel; el nivel sube cada 10 líneas y la caída se acelera hasta 100 ms.
- [ ] El HUD muestra puntuación, nivel y `LÍNEAS` reales, y no muestra "Vidas".
- [ ] Al colisionar una pieza recién generada se abre el modal "FIN DEL JUEGO" con la puntuación real; no se dibuja ningún overlay de fin en el canvas; `onGameOver` se llama una sola vez.
- [ ] "FIN" abre el modal inmediatamente con el puntaje actual.
- [ ] "PAUSA" congela el juego y muestra "EN PAUSA"; "REANUDAR" continúa sin saltos de caída.
- [ ] "JUGAR DE NUEVO" empieza una partida limpia (tablero vacío, puntuación 0, nivel 1, 0 líneas).
- [ ] La fila `tetris` existe en `games` y el juego aparece en `/games` y `/juego/tetris`.
- [ ] "GUARDAR PUNTUACIÓN" inserta en `scores` con `game_id: "tetris"`; el nombre se recuerda para la próxima partida.
- [ ] El score aparece en el top 10 de `/juego/tetris` y en `/salon` al recargar.
- [ ] Sin scores, el leaderboard muestra "Sé el primero en entrar al salón de la fama".
- [ ] Salir de la pantalla y volver no duplica movimientos ni velocidad de caída.
- [ ] A 375 px no hay scroll horizontal y el canvas se ve completo.
- [ ] Sin warnings de hidratación ni errores nuevos en la consola.

---

## Decisiones tomadas y descartadas

- **Sí:** motor TypeScript sin DOM + componente canvas + registro. Es la convención de SPEC 04; este spec generaliza `GamePlayer` con el registro.
- **Sí:** HUD y modal de la plataforma como única interfaz de puntuación y fin de partida.
- **Sí:** sin tablas nuevas; solo la fila en `games` (SPEC 05).
- **Sí:** 8 piezas, incluida la tuerca N. El README del original habla de 7 piezas estándar, pero `game.js` define `PIECES[8]` y `randomPiece` elige entre 8 (`Math.floor(Math.random() * 8) + 1`); gana el código.
- **Sí:** canvas lógico 800×600 con tablero 300×600 centrado y vista previa dibujada a su derecha. Llena el CRT 4:3 sin tocar `.game-canvas` ni `.crt-screen`, y la vista previa se mantiene en un único canvas (sin `next-canvas` secundario).
- **Sí:** la etiqueta «SIGUIENTE» de la vista previa se dibuja en el canvas; no es HUD de puntuación, forma parte de la propia vista previa.
- **Sí:** color de rejilla fijo en constantes en lugar de la variable CSS `--grid-line` del original.
- **Sí:** repetición de teclado en mover/soft drop (comportamiento del original, que actúa en cada `keydown`); rotar y hard drop solo sin `repeat`.
- **Sí:** la caída automática baja una fila por acumulador completo y reinicia el acumulador a 0 (igual que `dropAccum = 0` del original), no conserva el resto.
- **No:** `<iframe>` ni `next/script` con el `game.js` original.
- **No:** tecla `P` ni selector de tema: la pausa y el tema son de la plataforma.
- **No:** audio ni táctil, con el mismo criterio de SPEC 04.

---

## Riesgos identificados

| Riesgo                                               | Mitigación                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Doble montaje en StrictMode duplica listeners/bucles | Limpieza completa en el `return` del efecto; probar en `npm run dev`                      |
| `onChange` a 60 Hz provoca re-renders                | Emitir solo cuando cambia el snapshot (`score`, `lines`, `level`)                         |
| Salto de `dt` al reanudar o volver a la pestaña      | `dt` acotado y `lastTime` reiniciado; acumulador de caída intacto en pausa                |
| Aleatoriedad en render rompe hidratación             | Motor creado solo en un efecto del cliente; `Math.random` solo en el motor                |
| Refactor de `GamePlayer` rompe Asteroids o simulados | Paso 1 aislado con verificación manual de `/juego/asteroids/jugar` y de un juego simulado |
| Rotar/hard drop repetidos al mantener la tecla       | `!e.repeat` en el componente para esas acciones                                           |
| Flechas y `Espacio` desplazan la página              | `preventDefault` solo sobre teclas del juego, sin pausa y fuera de inputs                 |
| Canvas desproporcionado en móvil                     | Resolución lógica fija y `.game-canvas` existente; revisar a 375 px                       |
| Teclado inalcanzable en móvil                        | Limitación aceptada; táctil en un spec propio                                             |
| RLS abierta permite scores falsos                    | Riesgo asumido en SPEC 05; se resuelve en un spec de seguridad                            |

---

## Qué **no** está en este spec

- Controles táctiles ni gamepad virtual.
- Audio.
- Tema claro/oscuro propio del juego.
- Hold, 7-bag, SRS, lock delay u otras mecánicas modernas.
- Auth real, `user_id` o cambios de RLS.
- Tests automatizados.
- Otros juegos del catálogo.

Cada uno de estos puntos, si se aborda, va en su propio spec.
