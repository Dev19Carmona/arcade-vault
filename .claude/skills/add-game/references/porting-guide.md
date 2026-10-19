# Guía de portado: `game.js` vanilla → módulos TypeScript

Referencia completada: Asteroids (`references/started-games/02-asteroids/game.js` → `lib/games/asteroids/`).

## Equivalencias

| En el original                                              | En la plataforma                                                                                         |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `const`/`let` sueltos de configuración                      | `constants.ts`, mismos valores                                                                           |
| Funciones auxiliares                                        | `utils.ts`, tipadas                                                                                      |
| Clases/objetos con `update`/`draw` que usan `ctx` global    | `entities.ts`; `draw(ctx)` recibe el contexto por parámetro                                              |
| Estado global (`score`, `lives`, `level`…)                  | Variables locales dentro de `createXEngine`                                                              |
| `document.getElementById(...)` y HUD en DOM                 | Se elimina; el HUD sale del snapshot (`GameSnapshot`)                                                    |
| Overlays de pausa y "GAME OVER" (DOM o dibujados en canvas) | Se eliminan; los da `GamePlayer` (modal y "EN PAUSA")                                                    |
| Botón de reiniciar                                          | `reset()` del motor, llamado al cambiar `runId`                                                          |
| `keydown`/`keyup` en `document`/`window`                    | Listeners en el componente canvas; el motor recibe `setKeys(held)` con `KeyboardEvent.code`              |
| `mousemove`/`click` en el canvas                            | Listeners en el componente; el motor recibe coordenadas lógicas (`setPointer`, `click`)                  |
| `requestAnimationFrame` propio y `performance.now()`        | Bucle del componente; el motor recibe `dt` en segundos (acotado a 0,05)                                  |
| Temporizadores en ms (`setTimeout`, acumuladores)           | Acumuladores en segundos dentro de `update(dt)`; nada de `setTimeout` en el motor                        |
| Pausa con tecla `P`/`Esc`                                   | La pausa la controla `GamePlayer` (prop `paused`); quita la tecla del motor o déjala sin efecto          |
| `Math.random()`                                             | Solo dentro de `engine`/`entities`, nunca durante el render de React                                     |
| `new Image()`, spritesheet                                  | Copiar a `public/games/<id>/`; cargar en el componente y pasar al motor ya cargado                       |
| `new Audio(...)`                                            | Fuera de alcance salvo petición explícita (WebAudio, mute, autoplay); si se pide, va en el componente    |
| Varios `<canvas>` (preview "siguiente pieza")               | Dibujar en el canvas principal o exponer el dato por `stats`; no crear canvas secundarios sin justificarlo |
| `localStorage` para récord                                  | Se elimina; el récord es el leaderboard de Supabase                                                      |

## Pasos

1. Inventario del original: lista cada acceso al DOM, listener, temporizador, asset y overlay. Cada ítem debe tener destino en la tabla.
2. Constantes y utilidades; luego entidades; luego motor; luego componente. `npm run build` entre cada paso.
3. Define el snapshot mínimo que necesita el HUD: `score` siempre; `lives`, `level` y `stats` solo si el juego los tiene.
4. Fin de partida: identifica exactamente cuándo el original muestra "game over" y llama a `onGameOver(score)` en ese punto, una sola vez.
5. Compara comportamiento con el original abriendo su `index.html` (o `python -m http.server`) junto a la versión portada: velocidades, puntuación, niveles.

## Discrepancias

Si el README del original contradice su código, gana el código. Anótalo en "Decisiones" de la spec (como en SPEC 04 con la tabla de puntos de Asteroids).

## Notas por juego de referencia

### `03-tetris`

- Tablero 300×600 (10×20) + canvas `next-canvas` 120×120 + HUD con puntaje, líneas y nivel.
- Proporción 1:2, no 4:3: revisa `.game-canvas`/`.crt-screen` y documenta el ajuste.
- Teclas: flechas, `ArrowDown` soft drop, `Space` hard drop, rotación. Todas con `preventDefault`. Las pulsaciones de un solo frame (rotar, hard drop) no deben repetirse al mantener la tecla (`!e.repeat`).
- `dropAccum`/`dropInterval` en ms → segundos. Velocidad: `max(100, 1000 − (nivel−1)×90)` ms; nivel = `floor(líneas/10)+1`.
- Sin vidas: `GameSnapshot` con `score`, `level` y `stats: [{ label: "LÍNEAS", value }]`. El fin llega cuando `spawn()` colisiona.
- Sugerencia de catálogo: `cat: "PUZZLE"`, cover `cover-tetro`.

### `04-arkanoid`

- Canvas 800×600 (4:3, encaja directo), `levels.js` con 5 niveles (`blocks[]`, `ballSpeedMultiplier`) → `levels.ts` tipado.
- Spritesheet (`assets/spritesheet-breakout.png`, helpers `drawSprite`/`drawFrame` en `spritesheet.js`) → `public/games/arkanoid/`; el componente carga la imagen y la pasa al motor. Mientras carga, no arrancar el bucle.
- Ratón: `mousemove` mueve la pala y `click` lanza la bola → `setPointer(x)`/`click()` con conversión a coordenadas lógicas.
- Sonidos (`ball-bounce.mp3`, `break-sound.mp3`): fuera de alcance por defecto; decidirlo con el usuario.
- El original trae specs propios en `references/started-games/04-arkanoid/specs/` (explosión de bloques, sonidos y niveles): sirven como contexto, no se portan salvo que se pidan.
- Sugerencia de catálogo: `cat: "ARCADE"`, cover `cover-bricks`.
