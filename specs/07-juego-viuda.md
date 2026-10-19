# SPEC 07 — Juego real: Viuda

> **Estado:** Implementado
> **Depende de:** SPEC 04 (patrón motor + canvas), SPEC 05 (tablas `games` y `scores`), SPEC 06 (registro de canvas ya creado)
> **Fecha:** 2026-10-19
> **Objetivo:** Crear Viuda, un juego de cartas de póker por vidas contra la computadora, como el juego `viuda` en `/juego/viuda/jugar`, integrado con el HUD, la pausa y el modal de la plataforma, con su fila en la tabla `games` y las puntuaciones guardadas en `scores`.

---

## Por qué existe este spec

No hay fuente en `references/started-games/`: es un diseño nuevo acordado con el usuario. Viuda es un juego de cartas con manos de póker (par, doble par, terna, escalera, color, full house, póker, escalera de color) donde cada jugador tiene 3 vidas y, en cada ronda, quien cree tener mejor mano dice "llamo". Quien pierda la ronda pierde una vida; gana quien quede vivo.

El MVP es **local, un solo jugador humano contra 3 computadoras**. El modo en línea y de 4 a 9 jugadores quedan para un spec futuro: el motor se escribe con el número de asientos como parámetro (`SEATS = 4` hoy) para no impedirlo.

Es el tercer juego real; el registro (`components/games/registry.ts`) y `GamePlayer` genérico ya existen, así que **no hay bootstrap**.

---

## Reglas del juego (definitivas para el MVP)

**Mesa:** 4 jugadores (tú, asiento 0, y 3 CPU), baraja francesa de 52 cartas, 3 vidas cada uno. El turno avanza al siguiente asiento vivo ("a la derecha", en sentido horario).

**Quién empieza (solo ronda 1):** se baraja y cada jugador saca una carta; la más alta empieza (A > K > … > 2; empate: ♠ > ♥ > ♦ > ♣). Se muestra el sorteo y se pulsa continuar. En las rondas siguientes empieza quien perdió vida en la ronda anterior (si fue eliminado, el siguiente vivo; si hubo varios, el primero en orden de asiento).

**Reparto de cada ronda:** 5 cartas a cada jugador vivo (tus cartas, boca arriba solo para ti; las de las CPU, ocultas) y 5 cartas boca abajo en el centro: **la viuda**.

**La viuda empieza siempre boca abajo y solo se abre de dos maneras:** (a) alguien **cambia las 5 cartas** (deja las suyas boca arriba en su lugar) o (b) la primera vuelta regresa al jugador que empezó sin que nadie llamara. **CAMBIAR 5 está disponible siempre** (viuda cerrada o abierta); **CAMBIAR 1 solo con la viuda abierta**.

- **Viuda cerrada:** CAMBIAR 5, PASO o LLAMO.
- **Viuda abierta:** CAMBIAR 5, CAMBIAR 1, PASO o LLAMO.

**CAMBIAR 5:** toma las 5 cartas de la viuda y deja sus 5 cartas **boca arriba** en la mesa en su lugar. Las cartas tomadas solo las ve el jugador que las tomó. **CAMBIAR 1:** toma **una** carta de la viuda y deja **una** de su mano. **PASO:** pasa el turno al siguiente. **LLAMO:** va directo al duelo.

**Primera vuelta.** Cada jugador actúa una vez, empezando por el iniciador, con la viuda cerrada salvo que alguien la abra al cambiar 5.

**Apertura y vueltas ilimitadas.** Si la vuelta regresa al jugador que empezó sin que nadie llamara, se abre la viuda (si seguía cerrada) para todos y las vueltas continúan **sin límite hasta que alguien llame**: nunca hay duelo solo porque nadie llamó.

**Llamada y última vuelta.** Cuando alguien dice "llamo", el resto de jugadores vivos juega **una vuelta más** (solo CAMBIAR 5, CAMBIAR 1 o PASO; ya no se puede volver a llamar). Al regresar el turno a quien llamó, se muestran todas las manos y hay duelo.

**Duelo.** Todos los jugadores vivos muestran su mano de 5 cartas (la viuda no participa). Gana la mejor mano de póker estándar (carta alta < par < doble par < terna < escalera < color < full house < póker < escalera de color; el as vale alto o bajo en A-2-3-4-5; los desempates se resuelven por rango de las cartas, los palos no desempatan). **Pierde 1 vida el jugador con la mano más baja**; si hay empate en la peor mano, pierden todos los empatados. Quien tenga 0 vidas queda eliminado y sale de la mesa.

**Fin de la partida:** victoria cuando eres el único vivo; derrota cuando tus vidas llegan a 0. La pantalla de resultado final se muestra en el canvas y el modal de la plataforma se abre al pulsar continuar.

**Puntuación (decisión del usuario: solo victoria):** si ganas la partida, `1000 × 3 rivales + 300 × vidas restantes` (3 300 – 3 900); si pierdes, 0. Durante la partida el HUD muestra 0.

**CPU.** Evalúan su mano por categoría de póker con un umbral de llamada que baja cuando quedan menos jugadores vivos; con mano débil cambian (viuda cerrada) o pasan; con la viuda abierta valoran el cambio de una carta. Piensan 0,8–1,4 s por jugada para que se lea la partida. El azar (`Math.random`) vive solo dentro del motor, creado en el cliente.

---

## Alcance

**Dentro:**

- Motor en `lib/games/viuda/` (TypeScript estricto, sin `window`/`document`).
- Componente cliente `components/games/viuda-canvas.tsx` con `<canvas>` 800×600, teclado y ratón, `requestAnimationFrame` y limpieza al desmontar.
- Entrada `viuda` en `components/games/registry.ts`.
- HUD de la plataforma alimentado por el snapshot: puntuación, vidas (las tuyas) y stats `RONDA` y `RIVALES`.
- Pausa, `FIN`, fin de partida → modal "FIN DEL JUEGO", "JUGAR DE NUEVO".
- Fila en `games` (migración seed) y guardado en `scores` con el `save()` existente.
- Mesa dibujada en canvas con primitivas (cartas con rango y palo en texto `♠ ♥ ♦ ♣`), sin assets externos; barra de acciones, registro de la última jugada de cada CPU y marcador de vidas por asiento.
- Cover nuevo `cover-viuda` en `app/globals.css`, diseñado con `/frontend-design`.
- Documentar el juego en `CLAUDE.md` (sección "Juegos").

**Fuera de alcance:**

- Modo en línea, salas y 4–9 jugadores (spec futuro).
- Controles táctiles / gamepad virtual (el ratón sí).
- Sonido, música y animaciones elaboradas de reparto.
- Cambios de RLS, auth real o `user_id`.
- Paginación o realtime en leaderboards.
- Tests automatizados (el proyecto no tiene framework de tests).
- Apuestas, fichas y farol más allá de la heurística simple de las CPU.

---

## Controles

| Acción                            | Ratón                                                          | Teclado                                                           |
| --------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| Continuar (sorteo, duelo, final)  | Botón CONTINUAR                                                | `Espacio` / `Enter`                                               |
| Cambiar 5 (siempre) | Botón CAMBIAR 5 | `C` |
| Paso                              | Botón PASO                                                     | `P`                                                               |
| Llamo                             | Botón LLAMO                                                    | `L`                                                               |
| Cambiar 1 (viuda abierta) | Clic en carta propia, clic en carta de la viuda, botón CAMBIAR 1 | `1`–`5` carta propia, `Q W E R T` carta de la viuda, `X` confirma |

`preventDefault` solo sobre estas teclas y nunca dentro de inputs.

---

## Modelo de datos

Fila nueva en `games` (sin tablas nuevas):

| id      | title   | short                                    | cat      | cover         | color   |
| ------- | ------- | ---------------------------------------- | -------- | ------------- | ------- |
| `viuda` | `VIUDA` | `Póker por vidas contra la computadora.` | `ARCADE` | `cover-viuda` | `green` |

`long` (no promete lo ausente): «Cada jugador tiene tres vidas y cinco cartas, y en el centro espera la viuda. En tu turno cambias tus cartas por las de la viuda, pasas o llamas cuando crees tener la mejor mano de póker. Quien tenga la peor mano en el duelo pierde una vida. Enfréntate a tres rivales controlados por la computadora y sobrevive hasta ser el último en pie.»

Interfaz entre motor y React:

```ts
// lib/games/viuda/types.ts
export interface ViudaSnapshot {
  score: number;
  lives: number; // vidas del jugador humano
  round: number;
  rivals: number; // CPU vivas
}

export interface ViudaEngineOptions {
  onChange: (snapshot: ViudaSnapshot) => void; // solo cuando cambia algún campo
  onGameOver: (finalScore: number) => void; // una única vez por partida
}

export interface ViudaEngine {
  update(dt: number): void; // segundos, acotado a 0.05; mueve el reloj de las CPU
  draw(ctx: CanvasRenderingContext2D): void;
  press(code: string): void; // KeyboardEvent.code, pulsación de un frame
  setPointer(x: number, y: number): void; // coordenadas LÓGICAS 800×600
  click(): void;
  reset(): void;
  getSnapshot(): ViudaSnapshot;
}
```

El componente canvas traduce `ViudaSnapshot` a `GameSnapshot`: `{ score, lives, stats: [{RONDA}, {RIVALES}] }` (sin `level`).

Estructura de archivos:

```
lib/games/viuda/ types.ts constants.ts utils.ts entities.ts engine.ts
components/games/viuda-canvas.tsx
supabase/migrations/20261019170000_seed_game_viuda.sql
```

- `utils.ts`: baraja, `shuffle`, `evaluateHand(cards)` → categoría + desempates, `compareHands`, helpers puros.
- `entities.ts`: `drawCard(ctx, …)`, `drawButton(ctx, …)`, asientos y viuda; reciben el `ctx` por parámetro.
- `engine.ts`: máquina de estados `draw → turn → showdown → (nextRound | final)`, turnos, IA de las CPU.

---

## Plan de implementación

Antes de escribir código, leer en `node_modules/next/dist/docs/` la guía de Client Components. La interfaz y el cover se ajustan con `/frontend-design`.

1. **Constantes, utilidades y tipos.** Baraja, evaluador y comparador de manos. Verificación: lint y build; casos manuales del evaluador (A-2-3-4-5, empates, full house vs. color).
2. **Entidades.** Dibujo de cartas, botones y asientos. Verificación: build, sin `any`.
3. **Motor.** Sorteo, reparto, vueltas, acciones, duelo, vidas, eliminación, IA y final. Verificación: el módulo no importa `window`/`document`; `onGameOver` una sola vez; build.
4. **Componente canvas y registro.** Teclado y ratón con coordenadas lógicas, rAF, limpieza. Verificación: montar/desmontar sin listeners ni rAF residuales (también en StrictMode).
5. **Pausa y foco.** Verificación: pausar 10 s y reanudar no avanza a las CPU ni cambia el estado.
6. **Escalado.** Verificación: a 375 px la mesa se ve completa, sin scroll horizontal; el clic acierta tras el escalado.
7. **Seed en Supabase.** Migración aplicada con `apply_migration` (mismo nombre), tipos regenerados, `get_advisors`. Verificación: `select * from games where id = 'viuda'`.
8. **Cover y catálogo.** `cover-viuda` en `app/globals.css`. Verificación: el juego aparece en `/games` y `/juego/viuda`.
9. **Documentación.** Actualizar `CLAUDE.md`. Verificación: lectura del archivo.

---

## Criterios de aceptación

- [x] `npm run lint` y `npm run build` terminan sin errores.
- [x] `/juego/viuda/jugar` muestra la mesa real; Asteroids, Tetris y los simulados conservan su comportamiento.
- [x] Sorteo inicial: cada jugador saca una carta y empieza la más alta; en rondas siguientes empieza quien perdió vida.
- [x] Se reparten 5 cartas por jugador y 5 a la viuda; solo ves tu mano; la viuda empieza oculta.
- [x] CAMBIAR intercambia 5 por 5, me muestra lo tomado y deja las cartas descartadas visibles en la viuda.
- [x] Si todos pasan, la viuda se abre en el jugador que empezó y las vueltas continúan sin límite hasta que alguien llame.
- [x] Tras LLAMO, los demás juegan una última vuelta (cambiar o pasar); al regresar a quien llamó se muestran todas las manos y la mano más baja pierde 1 vida (los empatados en la peor, todos).
- [x] El evaluador distingue las 9 categorías, incluida A-2-3-4-5, y desempata por rangos.
- [x] Los jugadores eliminados salen de los turnos; la partida termina al quedar uno vivo o al perder tú.
- [x] Puntuación: victoria = `3000 + 300 × vidas`; derrota = 0.
- [x] Las teclas del juego no hacen scroll ni activan botones con foco; el ratón funciona a cualquier escala.
- [x] El HUD muestra vidas reales, `RONDA` y `RIVALES`, y se actualiza al jugar.
- [x] Al terminar se abre el modal "FIN DEL JUEGO" al pulsar continuar en el resultado final; no se dibuja ningún overlay de modal en el canvas.
- [x] "FIN" abre el modal inmediatamente con el puntaje actual.
- [x] "PAUSA" congela el juego y muestra "EN PAUSA"; "REANUDAR" continúa sin saltos.
- [x] "JUGAR DE NUEVO" empieza una partida limpia.
- [x] La fila `viuda` existe en `games` y el juego aparece en `/games` y `/juego/viuda`.
- [x] "GUARDAR PUNTUACIÓN" inserta en `scores` con `game_id: "viuda"`.
- [x] El score aparece en el top 10 de `/juego/viuda` y en `/salon` al recargar; sin scores, "Sé el primero en entrar al salón de la fama".
- [x] Salir y volver no duplica listeners ni velocidad del bucle.
- [x] A 375 px no hay scroll horizontal y el canvas se ve completo.
- [x] Sin warnings de hidratación ni errores nuevos en la consola.

---

## Decisiones tomadas y descartadas

- **Sí:** motor TypeScript sin DOM + componente canvas + registro (convención de SPEC 04/06).
- **Sí:** 3 CPU fijas (4 jugadores); 4–9 queda para el modo en línea.
- **Sí:** pierde vida solo la peor mano del duelo (decisión del usuario); empate en la peor, pierden todos los empatados.
- **Sí:** puntuación solo por victoria (decisión del usuario); derrota = 0.
- **Sí:** `ARCADE` / `green` / `cover-viuda` (los CHECK solo admiten `ARCADE|PUZZLE|SHOOTER`).
- **Sí:** vueltas ilimitadas hasta que alguien llame (decisión del usuario); las CPU bajan su umbral de llamada en cada vuelta sin llamadas, así que la ronda siempre termina.
- **Sí:** el modal se abre tras pulsar continuar en el resultado final, para que se vea el duelo decisivo.
- **No:** `<iframe>` ni `next/script`.
- **No:** audio, táctil ni apuestas, por alcance de MVP.

---

## Riesgos identificados

| Riesgo                                               | Mitigación                                                           |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| Doble montaje en StrictMode duplica listeners/bucles | Limpieza completa en el `return` del efecto; probar en `npm run dev` |
| `onChange` a 60 Hz provoca re-renders                | Emitir solo cuando cambia el snapshot                                |
| Salto de `dt` al reanudar o volver a la pestaña      | `dt` acotado y `lastTime` reiniciado; el reloj de las CPU usa `dt`   |
| Aleatoriedad en render rompe hidratación             | Motor creado solo en un efecto del cliente                           |
| Canvas desproporcionado en móvil / clic desalineado  | Resolución lógica 800×600; conversión con `getBoundingClientRect()`  |
| Teclado inalcanzable en móvil                        | El ratón/clic cubre todas las acciones; táctil en un spec propio     |
| Errores en el evaluador de manos                     | Utilidades puras; casos límite revisados a mano en la verificación   |
| Partida infinita por pasos sucesivos                 | Las CPU bajan el umbral de llamada en cada vuelta sin llamadas        |
| Puntuación 0 en derrota llena el leaderboard         | Aceptado por decisión del usuario; se revisa en un spec posterior    |
| RLS abierta permite scores falsos                    | Riesgo asumido en SPEC 05; se resuelve en un spec de seguridad       |

---

## Qué **no** está en este spec

- Multijugador en línea ni 4–9 jugadores.
- Controles táctiles ni gamepad virtual.
- Audio.
- Auth real, `user_id` o cambios de RLS.
- Tests automatizados.
- Otros juegos del catálogo.

Cada uno de estos puntos, si se aborda, va en su propio spec.
