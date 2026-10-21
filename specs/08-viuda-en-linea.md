# SPEC 08 — Viuda en línea (salas de 2 a 9 jugadores)

> **Estado:** Implementado
> **Depende de:** SPEC 03 (clientes Supabase), SPEC 05 (patrón de tablas con RLS abierta), SPEC 07 (juego Viuda local, motor y registro)
> **Fecha:** 2026-10-21
> **Objetivo:** Añadir a Viuda un modo en línea para 2 a 9 jugadores humanos, con salas que se crean o se unen por código de 5 caracteres (o desde una lista de salas abiertas) y una partida sincronizada por Supabase Realtime con el navegador del anfitrión como autoridad.

---

## Por qué existe este spec

SPEC 07 dejó Viuda como «tú contra 3 CPU» y dejó explícito que el modo en línea iría en un spec propio; el motor ya usa `SEATS` como constante para no impedirlo. Este spec lo aborda.

Tres restricciones condicionan el diseño:

- **No hay servidor de sockets propio.** Next.js desplegado en serverless no mantiene WebSockets, así que el transporte es **Supabase Realtime** (broadcast + presence), que ya está en el stack.
- **No hay auth real.** La identidad es un alias libre y un id anónimo; las salas no pueden proteger nada con RLS por usuario.
- **Hay información oculta** (la mano de cada jugador y la viuda cerrada). Con host autoritativo, el motor corre en el navegador del anfitrión, que por construcción ve todas las cartas. Es un riesgo aceptado por el usuario (ver «Riesgos»).

El modo VS CPU de SPEC 07 **no cambia de comportamiento**: el modo en línea es un camino nuevo que comparte las reglas.

---

## Reglas del modo en línea

Las reglas son las de SPEC 07 (3 vidas, 5 cartas más 5 en la viuda, viuda cerrada hasta que alguien cambia 5 o la vuelta regresa a quien empezó, vueltas ilimitadas hasta que alguien llama, una última vuelta tras «llamo», duelo donde pierde 1 vida la peor mano). Con las siguientes diferencias:

- **Jugadores:** de 2 a 9, **solo humanos** (sin CPU de relleno). 9 × 5 + 5 = 50 cartas, caben en la baraja de 52.
- **Sala de espera:** el anfitrión (quien crea la sala) pulsa **INICIAR** cuando hay entre 2 y 9 jugadores. Una vez iniciada, **nadie más puede unirse**.
- **Sorteo de ronda 1 y duelo:** el anfitrión avanza con **CONTINUAR**; si no lo hace, avanza solo a los 8 s (cuenta atrás visible). La pausa congela esta cuenta.
- **Sin límite de tiempo por turno.** Un jugador conectado puede tardar lo que quiera.
- **Desconexión de un jugador (no anfitrión):**
  - Todos ven su asiento marcado «desconectado».
  - El anfitrión puede **PAUSAR** la partida en cualquier momento. En pausa, ninguna acción de juego se acepta y el desconectado **puede volver a su asiento** con el mismo id (el cliente reintenta cada 3 s mientras su asiento siga reservado).
  - Con la partida en marcha (sin pausa), un desconectado **no puede reengancharse**: ve «La partida sigue en curso; espera a que el anfitrión la pause».
  - Al **REANUDAR**, los jugadores que sigan desconectados quedan **eliminados** (pierden todas sus vidas, salen de los turnos).
  - El anfitrión también dispone de **ELIMINAR** por cada jugador desconectado (con o sin pausa), para no esperar.
- **Desconexión del anfitrión:** la sala se **cierra** para todos con el aviso «El anfitrión se desconectó». No hay migración de host.
- **Eliminados:** un jugador sin vidas sigue viendo la mesa como espectador hasta el final o hasta que pulse SALIR.
- **Fin de partida:** queda un único jugador vivo. El canvas muestra ganador y clasificación (orden de eliminación; los eliminados en el mismo duelo empatan). El anfitrión puede pulsar **REVANCHA** (vuelve a la sala de espera con los jugadores presentes); cualquiera puede pulsar **SALIR**.
- **Sin puntuación:** las partidas en línea no escriben en `scores` ni abren el modal «FIN DEL JUEGO».

---

## Alcance

**Dentro:**

- Selector de modo al abrir `/juego/viuda/jugar`: **VS CPU** (flujo actual) o **JUGAR EN LÍNEA**.
- Menú en línea con **CREAR SALA**, **UNIRSE CON CÓDIGO** y una **lista de salas abiertas** (en espera) para unirse con un clic.
- Alias del jugador (campo de texto, recordado en `localStorage`) e id anónimo de sesión.
- Tabla `rooms` en Supabase (validar código, estado, listado y expiración) con RLS abierta como `games`/`scores`.
- Sala de espera con la lista de jugadores en tiempo real, código visible y copiable, e **INICIAR** para el anfitrión.
- Transporte con Supabase Realtime: canal público por sala (presence + broadcast) y canal privado por jugador para su mano.
- Host autoritativo: el navegador del anfitrión ejecuta el núcleo de reglas, valida las acciones y difunde el estado.
- Mesa para 2–9 jugadores dibujada en canvas 800×600, siempre con el jugador local abajo y el orden de turno horario.
- Pausa del anfitrión, desconexión, reconexión en pausa y eliminación manual de desconectados.
- Cierre de sala si cae el anfitrión; pantalla final con clasificación y revancha.
- Integración con `GamePlayer`: en modo en línea se ocultan PAUSA, FIN y guardado de puntuación; el HUD muestra `RONDA`, `JUGADORES` y las vidas propias.
- Refactor del motor de SPEC 07 para extraer un núcleo de reglas independiente de las CPU y del número fijo de asientos.
- Documentar el modo en `CLAUDE.md` (sección «Juegos»).

**Fuera de alcance (para otros specs):**

- CPU de relleno en partidas en línea.
- Temporizador de turno y expulsión de jugadores conectados pero ausentes (AFK).
- Migración de anfitrión y recuperación de la partida si el anfitrión cae.
- Espectadores y unirse a una partida ya iniciada.
- Auth real (incluida Supabase Auth anónima), canales privados con RLS en `realtime.messages` y servidor autoritativo (Edge Function) para impedir ver cartas ajenas.
- Puntuación, ranking o tabla de victorias de las partidas en línea.
- Enlace de invitación (`?sala=…`), chat, emotes y reacciones.
- Limpieza programada de `rooms` (`pg_cron`); se filtra por antigüedad al leer.
- Controles táctiles, audio y tests automatizados (el proyecto no tiene framework de tests).

---

## Modelo de datos

### Tabla nueva `public.rooms`

| Columna        | Tipo                   | Notas                                                                         |
| -------------- | ---------------------- | ----------------------------------------------------------------------------- |
| `code`         | `text` PK              | 5 caracteres del alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (sin I, O, 0, 1) |
| `host_id`      | `text` not null        | id anónimo del anfitrión                                                      |
| `host_name`    | `text` not null        | alias del anfitrión, 1–16 caracteres                                          |
| `status`       | `text` not null        | `waiting` \| `playing` \| `closed`; CHECK; por defecto `waiting`              |
| `player_count` | `smallint` not null    | 1–9; lo actualiza el anfitrión                                                |
| `created_at`   | `timestamptz` not null | `now()`                                                                       |
| `updated_at`   | `timestamptz` not null | `now()`; el anfitrión lo refresca cada 20 s (latido)                          |

- Una sala está **abierta** si `status = 'waiting'` y `updated_at > now() - interval '60 seconds'`. El listado usa ese filtro, `order by created_at desc limit 20`; las salas con anfitrión caído dejan de aparecer sin necesidad de borrado.
- Índice en `(status, updated_at)`.
- RLS activada con políticas abiertas de `select`, `insert` y `update` para `anon` y `authenticated`, igual que `games`/`scores` (SPEC 05). Sin `delete`: las salas se cierran con `status = 'closed'`.
- Migración: `supabase/migrations/20261021120000_create_rooms.sql`, aplicada con `apply_migration` usando el mismo nombre, con tipos regenerados en `lib/supabase/database.types.ts` y `get_advisors`.

### Identidad y sesión (cliente)

| Clave              | Almacén          | Contenido                                                      |
| ------------------ | ---------------- | -------------------------------------------------------------- |
| `av_viuda_alias`   | `localStorage`   | Último alias usado                                             |
| `av_viuda_session` | `sessionStorage` | `{ playerId, code }` para reenganchar tras recargar la pestaña |

`playerId` es un UUID generado en el cliente. Las lecturas y escrituras de almacenamiento van en `try/catch`.

### Canales y mensajes (Supabase Realtime)

- Canal público de la sala: `viuda:room:<code>` (presence con `{ playerId, name }` y broadcast).
- Canal de mano de cada jugador: `viuda:room:<code>:hand:<playerId>`; solo el host emite en él.

```ts
// lib/games/viuda/online/protocol.ts
export type OnlineAction =
  | { type: "pass" }
  | { type: "call" }
  | { type: "swap5" }
  | { type: "swap1"; handIndex: number; widowIndex: number };

// Cliente → host (canal público)
export type ClientMessage =
  | { kind: "join"; playerId: string; name: string }
  | { kind: "rejoin"; playerId: string }
  | { kind: "action"; playerId: string; action: OnlineAction }
  | { kind: "leave"; playerId: string };

export interface PublicSeat {
  playerId: string;
  name: string;
  lives: number;
  alive: boolean;
  connected: boolean;
  handCount: number;
  lastAction: string | null;
  hand: Card[] | null; // solo se rellena en el duelo
}

// Host → todos (canal público)
export interface PublicTable {
  seq: number; // creciente; el cliente descarta mensajes viejos
  phase: "waiting" | "draw" | "turn" | "showdown" | "final";
  paused: boolean;
  round: number;
  hostId: string;
  seats: PublicSeat[]; // en orden de turno
  turnPlayerId: string | null;
  callerId: string | null;
  widow: (Card | null)[]; // null = boca abajo
  widowOpen: boolean;
  ranking: string[] | null; // playerIds del primero al último, solo en `final`
  autoAdvanceIn: number | null; // segundos, sorteo y duelo
}

// Host → un jugador (canal de mano)
export interface PrivateHand {
  seq: number;
  hand: Card[];
  taken: Card[] | null; // lo que acaba de tomar de la viuda
}
```

El anfitrión envía `PublicTable` tras cada cambio de estado y ante cada `join`/`rejoin`. Un cliente que se une tarde recibe la mesa actual en esa respuesta, sin necesidad de un mensaje `sync` aparte.

### Núcleo de reglas extraído

```ts
// lib/games/viuda/rules.ts — TypeScript puro, sin window/document, sin CPU ni dibujo
export interface RulesState {
  /* asientos 2–9, mano, viuda, fase, turno, llamador, vidas, ronda */
}
export function createGame(playerIds: string[], rng: () => number): RulesState;
export function applyAction(
  state: RulesState,
  playerId: string,
  action: OnlineAction,
): RulesResult;
export function advance(state: RulesState): RulesResult; // sorteo → reparto, duelo → ronda/final
export function eliminate(state: RulesState, playerId: string): RulesResult;
```

`RulesResult` devuelve el nuevo estado (inmutable) y un error de validación («no es tu turno», «la viuda está cerrada», …). El motor VS CPU (`engine.ts`) pasa a usar este núcleo y conserva su IA y su dibujo.

### Estructura de archivos

```
supabase/migrations/20261021120000_create_rooms.sql
lib/supabase/rooms.ts                          createRoom, findRoom, listOpenRooms, heartbeat, setStatus
lib/games/viuda/rules.ts                       núcleo de reglas (extraído de engine.ts)
lib/games/viuda/engine.ts                      adaptado: usa rules.ts, mismo comportamiento VS CPU
lib/games/viuda/constants.ts                   MIN_PLAYERS = 2, MAX_PLAYERS = 9, ROOM_CODE_ALPHABET
lib/games/viuda/online/protocol.ts             tipos de mensajes (arriba)
lib/games/viuda/online/room-code.ts            generación y validación de códigos
lib/games/viuda/online/host.ts                 sesión del anfitrión: reglas, validación, difusión, pausa
lib/games/viuda/online/client.ts               sesión de jugador: presence, acciones, reenganche
lib/games/viuda/online/layout.ts               posiciones de asiento para 2–9, vistas desde el asiento local
components/games/viuda-game.tsx                selector VS CPU / EN LÍNEA (entrada del registro)
components/games/viuda-online/lobby.tsx        crear sala, unirse con código, lista de salas abiertas
components/games/viuda-online/waiting-room.tsx jugadores presentes, código, INICIAR
components/games/viuda-online/online-table.tsx canvas de la mesa en línea y controles
components/games/registry.ts                   `viuda` apunta a ViudaGame
lib/games/types.ts                             GameSnapshot.online?: boolean
```

---

## Plan de implementación

Antes de escribir código, leer en `node_modules/next/dist/docs/` la guía de Client Components y consultar la documentación de Supabase Realtime (`search_docs`: broadcast, presence y límites) porque la API puede diferir de lo conocido. El lobby y la sala de espera (DOM) se diseñan con `/frontend-design`.

1. **Tabla `rooms`.** Migración, aplicada con `apply_migration`, tipos regenerados y `get_advisors`. Verificación: `select * from rooms` vacío; un `insert` de prueba con código válido funciona y uno con código inválido o estado inválido falla.
2. **Asientos parametrizables.** Sustituir el uso de `SEATS = 4` y `HUMAN_SEAT = 0` por el número de asientos de la partida y por el asiento local; añadir `layout.ts` con posiciones para 2–9. VS CPU sigue usando 4 asientos. Verificación: lint, build y una partida VS CPU idéntica a la actual.
3. **Núcleo de reglas.** Extraer de `engine.ts` a `rules.ts` el reparto, los turnos, las acciones, la última vuelta, el duelo, las vidas y la eliminación; `engine.ts` lo consume. Verificación: el módulo no importa `window`/`document`; una partida VS CPU completa se juega igual; lint y build.
4. **Capa de salas.** `lib/supabase/rooms.ts` y `room-code.ts` (reintento ante colisión de código, hasta 5 veces). Verificación: crear una sala devuelve un código válido; `findRoom` y `listOpenRooms` respetan `status` y antigüedad.
5. **Selector de modo y lobby.** `ViudaGame` en el registro, con VS CPU (el canvas actual) y EN LÍNEA; `lobby.tsx` con alias, CREAR SALA, UNIRSE CON CÓDIGO y la lista de salas abiertas (se refresca cada 5 s y con un botón). Verificación: VS CPU funciona como antes; los errores de código inexistente, sala llena o ya iniciada muestran un mensaje.
6. **Sala de espera.** Canal público con presence: lista de jugadores en vivo, código copiable, INICIAR (habilitado con 2–9), SALIR, latido de `updated_at` y `player_count`. Verificación: dos pestañas ven entrar y salir al otro; el décimo jugador es rechazado.
7. **Host y partida.** `host.ts` crea el juego con `createGame`, valida cada `action` contra el jugador y el turno, y difunde `PublicTable` y `PrivateHand`; `client.ts` los recibe. Verificación: con 2 pestañas se juega una ronda completa; cada jugador ve solo su mano y nunca las ajenas fuera del duelo.
8. **Mesa en línea.** `online-table.tsx`: canvas 800×600 con N asientos, viuda, botones y atajos de teclado de SPEC 07. Verificación: legible con 2, 5 y 9 jugadores; el clic acierta tras el escalado.
9. **Pausa, desconexión y cierre.** PAUSAR/REANUDAR, marcado de desconectados, reenganche solo en pausa, ELIMINAR, cierre de sala si cae el anfitrión. Verificación: cerrar una pestaña de jugador muestra «desconectado»; reenganchar funciona solo en pausa; al reanudar sin él queda eliminado; cerrar la pestaña del anfitrión cierra la sala para el resto.
10. **Fin de partida y revancha.** Pantalla final con clasificación, REVANCHA del anfitrión y SALIR. Verificación: tras revancha todos vuelven a la sala de espera con vidas restauradas.
11. **Integración con la plataforma.** `GameSnapshot.online`; `GamePlayer` oculta PAUSA, FIN y guardado en modo en línea y muestra `RONDA`, `JUGADORES` y vidas propias. Verificación: VS CPU y los demás juegos conservan HUD, pausa y modal; en línea no se abre el modal ni se escribe en `scores`.
12. **Escalado y documentación.** Revisión a 375 px y actualización de `CLAUDE.md`. Verificación: sin scroll horizontal; lectura del archivo.

---

## Criterios de aceptación

- [ ] `npm run lint` y `npm run build` terminan sin errores.
- [ ] Al abrir `/juego/viuda/jugar` aparecen las opciones «VS CPU» y «JUGAR EN LÍNEA»; VS CPU se comporta exactamente como en SPEC 07.
- [ ] Al elegir «JUGAR EN LÍNEA» aparecen «CREAR SALA» y «UNIRSE CON CÓDIGO», además de la lista de salas abiertas.
- [ ] No se puede crear ni unirse sin alias; el alias se recuerda en `localStorage` (`av_viuda_alias`).
- [ ] CREAR SALA inserta una fila en `rooms` con `status = 'waiting'` y un código de 5 caracteres del alfabeto permitido, y muestra la sala de espera con el código.
- [ ] Unirse con un código inexistente, de una sala cerrada o ya iniciada, o de una sala con 9 jugadores muestra un mensaje distinto para cada caso.
- [ ] La sala de espera muestra en tiempo real a los jugadores que entran y salen; solo el anfitrión ve INICIAR, y está deshabilitado con menos de 2 jugadores.
- [ ] La lista de salas abiertas muestra solo salas `waiting` con `updated_at` de los últimos 60 s, con el alias del anfitrión y `player_count`; unirse desde la lista equivale a unirse con el código.
- [ ] Al pulsar INICIAR, `rooms.status` pasa a `playing` y la sala desaparece de la lista.
- [ ] Una partida con 2, 5 y 9 jugadores reparte 5 cartas a cada uno y 5 a la viuda sin repetir cartas.
- [ ] Cada jugador ve únicamente su mano; las manos ajenas solo se ven en el duelo.
- [ ] Las acciones fuera de turno, con la viuda cerrada (CAMBIAR 1), de un jugador eliminado o durante la pausa son rechazadas por el anfitrión y el estado no cambia.
- [ ] Las reglas de ronda, viuda, última vuelta y duelo coinciden con SPEC 07 (pierde 1 vida solo la peor mano; empate en la peor, pierden todos los empatados).
- [ ] Los jugadores eliminados salen de los turnos y siguen viendo la mesa; la partida termina al quedar uno vivo.
- [ ] El sorteo y el duelo avanzan con CONTINUAR del anfitrión o solos a los 8 s, y la cuenta se congela en pausa.
- [ ] Cuando un jugador se desconecta, todos ven su asiento como «desconectado» y el anfitrión ve PAUSAR y ELIMINAR.
- [ ] Con la partida en pausa, el jugador desconectado puede volver a su asiento y recibe de nuevo su mano.
- [ ] Con la partida en marcha, un desconectado no puede reengancharse y ve el mensaje de espera.
- [ ] Al REANUDAR, los jugadores que siguen desconectados quedan eliminados; ELIMINAR elimina al instante al desconectado elegido.
- [ ] Si se cierra la pestaña del anfitrión, los demás jugadores ven «El anfitrión se desconectó» y vuelven al menú en línea.
- [ ] La pantalla final muestra ganador y clasificación; REVANCHA (solo anfitrión) devuelve a todos a la sala de espera; SALIR vuelve al selector de modo.
- [ ] Las partidas en línea no abren el modal «FIN DEL JUEGO», no muestran PAUSA ni FIN de la plataforma y no insertan nada en `scores`.
- [ ] El HUD en línea muestra `RONDA`, `JUGADORES` y las vidas propias.
- [ ] Salir y volver, o montar en StrictMode, no duplica suscripciones a canales, listeners ni bucles (los canales se eliminan con `removeChannel` al desmontar).
- [ ] A 375 px no hay scroll horizontal y el lobby y el canvas se ven completos.
- [ ] Sin warnings de hidratación ni errores nuevos en la consola.

---

## Decisiones tomadas y descartadas

- **Sí:** Supabase Realtime (broadcast + presence) como transporte. Ya está en el stack y no exige infraestructura nueva.
- **No:** servidor Socket.IO propio ni Pusher/Ably/PartyKit. Añaden despliegue o dependencias externas.
- **Sí:** host autoritativo en el navegador del creador. Es lo más simple con Realtime; el anfitrión puede ver todas las cartas y hacer trampa (aceptado por el usuario).
- **No:** Edge Function autoritativa ni cliente confiado con semilla compartida. La primera es más trabajo del que justifica un MVP; la segunda expone las cartas de todos en cada cliente.
- **Sí:** solo humanos, el anfitrión pulsa INICIAR con 2–9 jugadores. **No:** CPU de relleno ni inicio automático.
- **Sí:** alias libre + id anónimo (`playerId` UUID). **No:** Supabase Auth anónima ni `av_user`: añaden configuración de auth fuera de alcance.
- **Sí:** tabla `rooms` con lista de salas abiertas (decisión del usuario, por encima de «solo código»). El juego en sí no pasa por la base de datos.
- **Sí:** estado de sala derivado por latido (`updated_at`) en lugar de borrar filas; evita `pg_cron` y salas fantasma en la lista.
- **Sí:** lista de salas por sondeo cada 5 s. **No:** `postgres_changes` en Realtime, que exige configurar publicaciones y suma complejidad para una lista corta.
- **Sí:** la mano de cada jugador viaja por un canal propio (`…:hand:<playerId>`), para no difundir cartas ocultas en el canal público.
- **Sí:** sin límite de tiempo por turno (decisión del usuario). La pausa y ELIMINAR del anfitrión cubren solo desconexiones, no ausentes conectados.
- **Sí:** pausa manual del anfitrión, sin eliminación automática por desconexión (decisión del usuario). Se reengancha únicamente con la partida en pausa; al reanudar, los ausentes se eliminan.
- **Sí:** si cae el anfitrión se cierra la sala. **No:** migración de host (exigiría sincronizar cartas ocultas entre clientes).
- **Sí:** sin puntuación en línea (el ganador solo se muestra). Evita falsear el top 10 con RLS abierta y que un grupo de amigos lo infle.
- **Sí:** pantalla final + REVANCHA del anfitrión; el sorteo inicial y el duelo avanzan con CONTINUAR o a los 8 s (decisión de diseño de este spec, para que una mesa de 9 no se bloquee esperando una sola pulsación).
- **Sí:** extraer un núcleo de reglas puro (`rules.ts`) compartido por VS CPU y en línea. **No:** duplicar el motor, que dejaría dos implementaciones de las reglas divergentes.
- **No:** enlace de invitación (`?sala=`) ni chat; el código y la lista bastan para el MVP.

---

## Riesgos identificados

| Riesgo                                                                | Mitigación                                                                                                                              |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| El anfitrión ve todas las cartas y puede hacer trampa                 | Aceptado por el usuario; se resuelve con servidor autoritativo en un spec posterior                                                     |
| Un cliente modificado puede escuchar el canal de mano de otro jugador | El `playerId` es visible en presence, así que el canal es adivinable: aceptado; se resuelve con Auth anónima y canales privados con RLS |
| RLS abierta en `rooms` permite crear, cerrar o falsear salas          | Mismo riesgo asumido que en SPEC 05; se resuelve en un spec de seguridad                                                                |
| Refactor de `engine.ts` rompe VS CPU                                  | Pasos 2 y 3 aislados; verificación manual de una partida VS CPU completa antes de seguir                                                |
| Caída del anfitrión pierde la partida                                 | Aviso claro a todos y vuelta al menú; migración de host queda fuera                                                                     |
| Un jugador conectado pero ausente bloquea la mesa (sin temporizador)  | Riesgo asumido por decisión del usuario; el temporizador y la expulsión de AFK van en un spec propio                                    |
| Desincronización o mensajes fuera de orden                            | `seq` creciente en cada mensaje; el cliente descarta los viejos; el anfitrión reenvía la mesa completa en cada `join`/`rejoin`          |
| Dos jugadores crean el mismo código                                   | Clave primaria en `code`; reintento con otro código hasta 5 veces                                                                       |
| Límites de mensajes o conexiones del plan de Realtime                 | Difundir solo en cambios de estado (no por frame); consultar límites con `search_docs` al implementar                                   |
| Doble montaje en StrictMode duplica canales y suscripciones           | `removeChannel` en la limpieza del efecto; probar en `npm run dev`                                                                      |
| La pestaña del anfitrión en segundo plano reduce sus temporizadores   | Los latidos y la cuenta de avance usan marcas de tiempo, no acumulación por frame; se advierte al anfitrión de no cambiar de pestaña    |
| Mesa de 9 ilegible en 800×600 o en móvil                              | Asientos compactos con layout propio por número de jugadores; verificación con 2, 5 y 9 y a 375 px                                      |
| Alias ofensivos o suplantación                                        | Sin moderación en el MVP; alias de 1–16 caracteres, recortado y sin HTML (el canvas dibuja texto plano)                                 |

---

## Qué **no** está en este spec

- CPU de relleno en línea.
- Temporizador de turno y expulsión de jugadores ausentes pero conectados.
- Migración de anfitrión.
- Espectadores y entrada a partidas iniciadas.
- Auth real, canales privados con RLS y servidor autoritativo.
- Puntuación, ranking o victorias de partidas en línea.
- Enlace de invitación y chat.
- Limpieza programada de salas.
- Controles táctiles, audio y tests automatizados.

Cada uno de estos puntos, si se aborda, va en su propio spec.
