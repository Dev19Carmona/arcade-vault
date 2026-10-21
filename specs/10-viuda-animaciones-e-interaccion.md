# SPEC 10 — Viuda: animaciones, claridad de acciones y orden de la mano

> **Estado:** Implement
> **Depende de:** SPEC 07 (Viuda VS CPU, motor y canvas), SPEC 08 (Viuda en línea, `rules.ts`, `table-view.ts`)
> **Fecha:** 2026-10-21
> **Objetivo:** Hacer que Viuda (VS CPU y en línea) se entienda y se sienta viva: cada reparto, cambio de carta, paso, llamada y duelo se anima de forma breve y legible, y el jugador puede reordenar su mano arrastrando las cartas.

---

## Por qué existe este spec

Hoy Viuda es **plana**. Todo se dibuja a partir del estado actual (`draw(ctx)` en `engine.ts` y `drawOnlineTable` en `online/table-view.ts`), sin ninguna animación ni transición:

- Al cambiar una carta con la viuda, la carta propia y la de la viuda **saltan** a su nuevo sitio en un fotograma. No se ve qué carta se fue ni cuál llegó.
- Lo único que dice qué hizo un jugador es el texto pequeño `caption` / `lastAction` («PASO», «LLAMO», «CAMBIÓ 1») en el panel del asiento. Cuando una CPU pasa o llama, apenas se nota; no hay forma de saber de un vistazo quién llamó ni que ahora se juega la última vuelta.
- El reparto, la apertura de la viuda, el duelo y la pérdida de vidas también ocurren de golpe.
- Las cartas no se pueden mover: la mano queda en el orden del reparto.

Los cambios son **visuales y de experiencia de usuario**. Las reglas, las puntuaciones, el protocolo de acciones y la autoridad del anfitrión **no cambian**. La única adición fuera del dibujo es un dato informativo («último evento») que las reglas ya conocen y hoy se pierde, necesario para animar el modo en línea sin adivinar por diferencias de texto.

Las decisiones de diseño visual (lenguaje de movimiento, carteles, color) se toman con `/frontend-design` y `/ui-ux-pro-max`, como exige el `CLAUDE.md`.

---

## Alcance

**Dentro:**

- Una **capa de animación** de TypeScript puro (`lib/games/viuda/fx/`) compartida por VS CPU y en línea: reloj por `dt`, interpolaciones con easing, cola de animaciones y bloqueo de turno.
- Animaciones de:
  - **CAMBIAR 1:** la carta propia vuela hacia su hueco en la viuda y la de la viuda hacia el hueco de la mano, con origen y destino resaltados antes y después del vuelo.
  - **CAMBIAR 5:** las 5 cartas cruzan entre la mano y la viuda (escalonadas); si la viuda estaba cerrada, se **voltea** al abrirse.
  - **PASO:** cartel breve sobre el asiento (color propio) y el asiento cede el foco al siguiente.
  - **LLAMO:** cartel de mayor énfasis, **marca persistente** de quién llamó y aviso «ÚLTIMA VUELTA» mientras dure.
  - **Reparto:** las cartas salen del mazo hacia cada asiento, escalonadas.
  - **Duelo:** las manos rivales se voltean, la peor mano se resalta y el corazón perdido se rompe.
- Indicador claro del **turno actual** (asiento activo con pulso) en ambos modos.
- Los jugadores no se ven obligados a esperar: **la animación bloquea el siguiente turno pero es corta** (ver «Presupuesto de tiempo») y se puede saltar con clic o tecla.
- **Reordenar la mano arrastrando** las cartas propias, con ratón y táctil (Pointer Events), también fuera del turno.
- Dato `lastEvent` en el estado de reglas y campo opcional `event` en `PublicTable` para que el modo en línea sepa qué ocurrió.
- Documentar en `CLAUDE.md` (sección «Juegos»).

**Fuera de alcance (para otros specs):**

- Sonido y vibración (se decidió que sea solo visual).
- Ajuste de velocidad o modo «sin animaciones» y soporte de `prefers-reduced-motion`.
- Cambios en las reglas, la IA de las CPU, la puntuación o los tiempos del anfitrión (sorteo y duelo siguen avanzando a los 8 s).
- Cambios en el protocolo de acciones, los canales, `rooms` o el esquema de Supabase.
- Reordenar o sincronizar el orden de la mano con otros jugadores (es una vista local).
- Botón ORDENAR automático por valor o palo.
- Emotes, chat y reacciones.
- Rediseño del lobby, la sala de espera o el diseño general de la mesa (colores, fuentes, posiciones de asientos).
- Controles táctiles para el resto de acciones del juego más allá de clic y arrastre sobre el canvas.
- Tests automatizados (el proyecto no tiene framework de tests).

---

## Modelo de datos

### Evento de juego (reglas y protocolo)

Dato **informativo**: no participa en ninguna decisión de las reglas.

```ts
// lib/games/viuda/types.ts
export type GameEvent =
  | { n: number; kind: "deal" }
  | { n: number; kind: "pass"; seat: number }
  | { n: number; kind: "call"; seat: number }
  | { n: number; kind: "swap5"; seat: number }
  | {
      n: number;
      kind: "swap1";
      seat: number;
      handIndex: number;
      widowIndex: number;
    }
  | { n: number; kind: "showdown" };
```

- `n` crece de uno en uno; el cliente lo usa para no animar dos veces el mismo evento y para saber cuántos eventos se perdió.
- `RulesState.lastEvent: GameEvent | null` lo fija `applyAction` / `advance` y viaja en `PublicTable.event?: GameEventPublic` (el mismo evento con `playerId` en lugar del índice de asiento). Es **opcional**: un cliente que no lo conozca lo ignora.
- `swap1` incluye `handIndex` y `widowIndex` porque los observadores necesitan saber qué huecos se intercambiaron; no revela cartas.

### Escena de animación (solo cliente)

```ts
// lib/games/viuda/fx/timeline.ts
export interface Pose {
  x: number;
  y: number;
  rot: number;
  scale: number;
  flip: number;
} // flip 0 = dorso, 1 = cara
export interface FlyingCard {
  card: Card | null;
  from: Pose;
  to: Pose;
  start: number;
  dur: number;
  delay: number;
}
export interface Badge {
  seat: number;
  text: string;
  color: string;
  start: number;
  dur: number;
  sticky?: boolean;
}
export interface Fx {
  flights: FlyingCard[];
  badges: Badge[];
  hidden: Set<string>; // huecos que no se dibujan quietos mientras una carta vuela (p. ej. "own:2", "widow:4")
  lockedUntil: number; // el turno siguiente no empieza antes
}
```

- El tiempo avanza con `update(dt)`, no con `Date.now()`, para que la pausa de `GamePlayer` congele las animaciones.
- Las constantes de duración viven en `lib/games/viuda/constants.ts` (`FX_*`).

### Orden local de la mano

```ts
// lib/games/viuda/hand-order.ts
export type CardKey = string; // `${suit}-${rank}`
export interface HandOrder {
  keys: CardKey[];
} // orden visual, de izquierda a derecha
export function reconcile(order: HandOrder, hand: readonly Card[]): HandOrder;
export function visualToRules(
  order: HandOrder,
  hand: readonly Card[],
  visual: number,
): number;
```

- El orden se guarda **por identidad de carta**, no por índice, para sobrevivir tanto a `swap1` (se reemplaza una carta) como a `swap5` (se reemplaza toda la mano).
- `reconcile`: las cartas que siguen en la mano conservan su posición; las nuevas ocupan los huecos libres de izquierda a derecha. Con `swap1`, la carta nueva entra en el hueco de la que salió.
- Se reinicia al orden de reparto cada ronda nueva (`phase` pasa a `turn` con una `round` distinta).
- Es **estado local**: no viaja por la red ni se guarda en `localStorage`.
- Las teclas `1`–`5` y los índices de selección (`selOwn`) pasan a ser **posiciones visuales**; `visualToRules` las convierte al `handIndex` que ya esperan las reglas (`OnlineAction.swap1`). El protocolo no cambia.

### Presupuesto de tiempo

| Evento              | Duración total | Notas                                                               |
| ------------------- | -------------- | ------------------------------------------------------------------- |
| PASO                | ≤ 450 ms       | Cartel + cesión de foco                                             |
| LLAMO               | ≤ 800 ms       | Cartel grande; la marca persistente no cuenta para el bloqueo       |
| CAMBIAR 1           | ≤ 700 ms       | Resalte 150 ms + vuelo 450 ms                                       |
| CAMBIAR 5           | ≤ 900 ms       | 5 vuelos escalonados (60 ms) + volteo de la viuda si estaba cerrada |
| Reparto de la ronda | ≤ 900 ms       | Escalonado por asiento                                              |
| Duelo               | ≤ 1000 ms      | Volteo de manos + resalte de la peor + corazón roto                 |

El bloqueo nunca supera `FX_MAX_MS = 1000`. Si llegan varios eventos seguidos (modo en línea), se encolan y cada uno se acelera ×2 mientras haya más de uno pendiente, para no quedarse atrasado. Un clic o una tecla de continuar durante el bloqueo termina de golpe la animación en curso.

### Estructura de archivos

```
lib/games/viuda/fx/timeline.ts       reloj, cola, easing, bloqueo de turno
lib/games/viuda/fx/scenes.ts         de GameEvent a Fx (vuelos, carteles) con las posiciones de la mesa
lib/games/viuda/fx/draw.ts           dibujo de cartas en vuelo, carteles, marca de llamador, corazón roto, foco de turno
lib/games/viuda/hand-order.ts        orden local por identidad y arrastre (estado de drag)
lib/games/viuda/types.ts             GameEvent
lib/games/viuda/constants.ts         FX_* (duraciones, easing, FX_MAX_MS)
lib/games/viuda/entities.ts          drawCard / drawCardBack aceptan Pose (rotación, escala, volteo) y huecos ocultos
lib/games/viuda/rules.ts             lastEvent informativo; sin cambio de comportamiento
lib/games/viuda/engine.ts            usa fx y hand-order; la CPU espera el bloqueo
lib/games/viuda/online/protocol.ts   PublicTable.event? (opcional) y su validador
lib/games/viuda/online/host.ts       rellena event al difundir la mesa
lib/games/viuda/online/table-view.ts usa fx y hand-order en la mesa en línea
components/games/viuda-canvas.tsx            Pointer Events (down/move/up) en lugar de solo click
components/games/viuda-online/online-table.tsx  Pointer Events y bloqueo de entrada mientras anima
app/globals.css                      touch-action: none solo en los canvas de Viuda
CLAUDE.md                            sección «Juegos» actualizada
```

---

## Plan de implementación

Antes de escribir código: usar `/frontend-design` y `/ui-ux-pro-max` para fijar el lenguaje de movimiento (curvas, carteles, énfasis de LLAMO, resalte de origen y destino) y leer en `node_modules/next/dist/docs/` lo que toque de Client Components si se modifica un `.tsx`.

1. **Núcleo de animación.** Crear `fx/timeline.ts` (reloj por `dt`, easing, cola, bloqueo) y las constantes `FX_*`. Sin conectar a nada. Verificación: `npm run lint` y `npm run build`; el módulo no importa `window` ni `document`.
2. **Evento de juego.** Añadir `GameEvent` y `lastEvent` en `rules.ts` (fijado por `applyAction` y `advance`). Sin efecto visible. Verificación: una partida VS CPU completa se juega igual; lint y build.
3. **Cartas con pose.** `drawCard` / `drawCardBack` aceptan `Pose` (posición, rotación, escala, volteo) y los huecos de `hidden`. Verificación: el dibujo de la mesa es idéntico al actual cuando no hay pose.
4. **VS CPU: CAMBIAR 1 y CAMBIAR 5.** `fx/scenes.ts` y `fx/draw.ts` generan los vuelos; `engine.ts` consume el evento tras cada acción y bloquea el turno de la CPU hasta `lockedUntil`. Verificación: al cambiar 1 se ve salir una carta y entrar la otra; al cambiar 5 con la viuda cerrada se ve el volteo; clic o tecla salta la animación.
5. **VS CPU: PASO y LLAMO.** Carteles por asiento, marca persistente del llamador, aviso «ÚLTIMA VUELTA» y pulso en el asiento con el turno. Verificación: una CPU que pasa y una que llama se distinguen sin leer el `caption`; la marca persiste hasta el duelo.
6. **VS CPU: reparto, duelo y vidas.** Reparto escalonado, volteo de manos rivales, resalte de la peor mano y corazón que se rompe. Verificación: una ronda completa de principio a fin con todas las animaciones, sin bloquear la partida más de `FX_MAX_MS` por evento.
7. **Orden de la mano y arrastre en VS CPU.** `hand-order.ts`; `viuda-canvas.tsx` pasa a Pointer Events (diferenciar clic de arrastre por umbral de movimiento, p. ej. 6 px); las cartas vecinas se desplazan para abrir hueco; la selección sigue a la carta; `touch-action: none` en el canvas. Verificación: reordenar, seleccionar una carta reordenada y cambiarla con la viuda envía el `handIndex` correcto; el orden se conserva en la ronda y se reinicia en la siguiente.
8. **Protocolo.** `PublicTable.event?` con validador en `protocol.ts`; `host.ts` lo rellena al difundir. Verificación: clientes sin cambios siguen funcionando; lint y build.
9. **Mesa en línea: animaciones.** `table-view.ts` consume `event` con la misma capa `fx`; la entrada local queda bloqueada mientras anima; la cola acelera ×2 si hay más de un evento pendiente. Verificación con 2 pestañas: lo que hace el otro jugador se anima con claridad en tu pantalla.
10. **Mesa en línea: arrastre.** `online-table.tsx` con Pointer Events y `hand-order.ts`; un `rejoin` o una recarga recomponen el orden desde la mano recibida. Verificación: reordenar en una pestaña no afecta a la otra; cambiar 1 con orden alterado envía el índice correcto.
11. **Escalado, táctil y documentación.** Revisión a 375 px (arrastre táctil sin scroll de la página) y actualización de `CLAUDE.md`. Verificación: sin scroll horizontal; lectura del archivo.

---

## Criterios de aceptación

- [ ] `npm run lint` y `npm run build` terminan sin errores.
- [ ] Las reglas no cambian: una partida VS CPU y una en línea terminan con las mismas condiciones de victoria, vidas y puntuación que antes.
- [ ] Al CAMBIAR 1 se ve volar la carta propia hacia la viuda y la de la viuda hacia tu mano; el origen y el destino quedan resaltados durante la animación.
- [ ] Al CAMBIAR 5 se ven cruzar las 5 cartas; si la viuda estaba cerrada, se voltea al abrirse.
- [ ] Cuando cualquier jugador (incluidas las CPU o los otros humanos en línea) pasa o llama, aparece un cartel sobre su asiento con texto y color propios.
- [ ] Tras un «LLAMO», el asiento del llamador queda marcado y aparece «ÚLTIMA VUELTA» hasta que se muestran las manos.
- [ ] El asiento al que le toca jugar tiene un indicador visible distinto del resto, en VS CPU y en línea.
- [ ] El reparto de cada ronda se anima de forma escalonada y las manos rivales se voltean en el duelo.
- [ ] La vida perdida en el duelo se anima (corazón que se rompe) y la peor mano queda resaltada.
- [ ] Ninguna animación bloquea el turno más de `FX_MAX_MS` (1000 ms); con varios eventos encolados, el último termina en menos de 1,5 s tras llegar.
- [ ] Un clic o `Espacio`/`Enter` durante una animación la termina al instante y habilita el turno.
- [ ] La pausa de `GamePlayer` congela las animaciones en VS CPU y se reanudan al continuar.
- [ ] Se puede arrastrar cualquiera de las cartas propias a otra posición con el ratón; las demás se desplazan para dejar hueco.
- [ ] El arrastre funciona también fuera de tu turno y mientras la viuda está cerrada, y no está disponible si no tienes mano (eliminado, sorteo inicial).
- [ ] Un clic corto sin movimiento sigue seleccionando la carta (viuda abierta), igual que antes.
- [ ] Tras reordenar, seleccionar una carta propia y una de la viuda y pulsar CAMBIAR 1 cambia exactamente las cartas seleccionadas (verificado por el `caption` y por las cartas vistas antes y después).
- [ ] Tras CAMBIAR 1 la carta nueva ocupa el hueco de la que salió; tras CAMBIAR 5 las nuevas ocupan las posiciones en orden.
- [ ] El orden elegido se conserva durante la ronda y vuelve al orden de reparto en la ronda siguiente.
- [ ] Las teclas `1`–`5` seleccionan por posición visual tras reordenar.
- [ ] En línea, reordenar la mano en una pestaña no cambia la mano ni la vista de la otra y no se envía ningún mensaje por la red.
- [ ] En línea, un cliente que se reconecta con `rejoin` ve su mano completa y reordenable sin animaciones de reparto atrasadas.
- [ ] Con el dedo (o emulación táctil) se puede arrastrar una carta sin que la página haga scroll y los botones del canvas siguen respondiendo.
- [ ] A 375 px no hay scroll horizontal y el canvas se ve completo.
- [ ] Sin errores nuevos en consola ni warnings de hidratación; los listeners de `pointer*` se retiran al desmontar.

---

## Decisiones tomadas y descartadas

- **Sí:** misma capa de animación para VS CPU y en línea (decisión del usuario). **No:** animar solo VS CPU, porque ambos modos comparten dibujo y el modo en línea es donde más hace falta entender qué hizo el otro.
- **Sí:** la animación **bloquea** el siguiente turno, pero es corta (decisión del usuario: «que no se vuelva aburrido»). Límite duro de 1000 ms por evento. **No:** animaciones en paralelo sin bloqueo; se solapan cuando las CPU actúan seguidas.
- **Sí:** clic o tecla para saltar la animación en curso. Es la contrapartida del bloqueo para que el juego no se sienta lento.
- **Sí:** solo visual, sin sonido (decisión del usuario). **No:** Web Audio ni archivos de audio; se queda para un spec propio.
- **Sí:** eventos explícitos (`lastEvent`) en las reglas y `event?` en `PublicTable`. **No:** deducir lo ocurrido comparando `caption` / `lastAction` entre mesas: dos «PASO» seguidos del mismo jugador en vueltas distintas serían indistinguibles y una mesa perdida rompería la animación.
- **Sí:** `event` opcional en `PublicTable`. Un cliente viejo lo ignora y un cliente nuevo sin evento (p. ej. tras `rejoin`) simplemente no anima.
- **Sí:** el tiempo de la animación avanza con `dt` del bucle del juego, no con `Date.now()`, para respetar la pausa. En línea no hay pausa de `GamePlayer`, pero la pausa del anfitrión congela las acciones y por tanto no genera eventos.
- **Sí:** arrastre permitido siempre que haya cartas, también fuera de turno (decisión del usuario): es organizar la vista, no una acción de juego. **No:** limitarlo a tu turno.
- **Sí:** orden por identidad de carta (`suit-rank`) y no por índice, para que `swap1` y `swap5` no desordenen lo que el jugador organizó. La carta nueva ocupa el hueco de la que salió (decisión del usuario).
- **Sí:** el orden vive solo en el cliente y se reinicia cada ronda. **No:** enviarlo al anfitrión ni guardarlo en `localStorage`; las cartas cambian cada ronda y no aporta nada.
- **Sí:** Pointer Events para ratón y táctil con un solo camino de código (decisión del usuario). Se abre el táctil solo para clic y arrastre sobre el canvas de Viuda; el resto del táctil sigue fuera.
- **Sí:** `touch-action: none` únicamente en los canvas de Viuda, para no afectar a Asteroids y Tetris.
- **Sí:** teclas `1`–`5` por posición visual, lo que ve el jugador. El motor traduce a `handIndex` con `visualToRules`.
- **Sí:** diseño visual con `/frontend-design` y `/ui-ux-pro-max` antes de codificar (petición del usuario y regla del `CLAUDE.md`).
- **No:** botón ORDENAR automático ni ajuste de velocidad. El usuario eligió el modo simple; ambos pueden ir en un spec posterior.

---

## Riesgos identificados

| Riesgo                                                                         | Mitigación                                                                                                                                                                                |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La animación hace que la partida se sienta lenta o aburrida                    | Presupuesto de tiempo por evento y `FX_MAX_MS = 1000`; saltar con clic o tecla; revisar con una ronda completa antes de dar por buena la duración                                         |
| En línea, el estado real va por delante de lo que se anima                     | La animación es una capa sobre la mesa más reciente: las cartas en vuelo se ocultan de su hueco con `hidden` y, al terminar, se muestra el estado actual; la cola se acelera si se atrasa |
| Se pierde un mensaje y el evento no llega, o llega repetido                    | `n` creciente: se descartan repetidos y, si falta alguno, se salta a la mesa actual sin animar                                                                                            |
| En línea, los observadores animan un cambio sin ver las cartas (viuda cerrada) | Los vuelos de cartas ocultas se dibujan boca abajo; el volteo ocurre cuando la viuda llega abierta en la mesa                                                                             |
| Reordenar rompe el `handIndex` enviado en CAMBIAR 1                            | Orden por identidad y `visualToRules`; criterio de aceptación explícito con carta antes y después                                                                                         |
| Un arrastre se interpreta como clic (o al revés) y cambia la selección         | Umbral de movimiento de 6 px entre clic y arrastre; el `click` nativo se suprime tras un arrastre                                                                                         |
| `touch-action: none` impide hacer scroll sobre el canvas en móvil              | El canvas ocupa el escenario de juego; la página se desplaza por fuera de él. Revisar a 375 px                                                                                            |
| La pestaña del anfitrión o del cliente en segundo plano acumula `dt` o eventos | `MAX_DT` ya limita el paso por fotograma; al volver, la cola descarta animaciones atrasadas y muestra el estado actual                                                                    |
| StrictMode duplica listeners o bucles al añadir `pointerdown/up`               | Registrar y retirar los mismos manejadores en el efecto, igual que `pointermove`; comprobar en `npm run dev`                                                                              |
| La mesa de 9 jugadores se satura con carteles y vuelos                         | Los carteles usan el tamaño del panel de cada asiento; revisar con 2, 5 y 9 jugadores                                                                                                     |

---

## Qué **no** está en este spec

- Sonido, vibración y música.
- Ajuste de velocidad, modo sin animaciones y `prefers-reduced-motion`.
- Cambios de reglas, IA, puntuación o tiempos del anfitrión.
- Cambios de protocolo de acciones, canales, `rooms` o Supabase.
- Sincronizar o guardar el orden de la mano; botón ORDENAR automático.
- Chat, emotes y reacciones.
- Rediseño del lobby, la sala de espera o la disposición de la mesa.
- Controles táctiles para el resto de la plataforma.
- Tests automatizados.

Cada uno de estos puntos, si se aborda, va en su propio spec.
