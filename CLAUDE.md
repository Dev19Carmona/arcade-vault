# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Comandos

```bash
npm run dev     # servidor de desarrollo (next dev)
npm run build   # build de producción
npm run start   # servir el build
npm run lint    # eslint (flat config en eslint.config.mjs)
```

No hay framework de tests configurado.

## Estado del proyecto

Arcade Vault es una plataforma para jugar online y competir por puntos. Se desarrolla con **Spec Driven Design** (comandos `/spec` y `/spec-impl`, skills de `Klerith/fernando-skills`).

El código actual en `app/` es todavía el scaffold de Create Next App (`app/page.tsx`, metadata por defecto en `app/layout.tsx`). La implementación real aún no está portada.

## Stack

Next.js 16 (App Router) + React 19 + TypeScript estricto + Tailwind CSS v4 (`@import "tailwindcss"` y `@theme inline` en `app/globals.css`, sin `tailwind.config`). Alias de imports: `@/*` → raíz del repo. Los tipos globales como `LayoutProps<"/">` vienen de Next (ver `app/layout.tsx`).

Backend: Supabase (`@supabase/supabase-js` + `@supabase/ssr`) contra el proyecto remoto `mendwbsdxpwrrrqlsmxe`, también accesible por MCP (`.mcp.json`). La sesión y las puntuaciones de la app siguen siendo simuladas en `localStorage` hasta las specs de auth y puntuaciones.

## Supabase

- **Variables de entorno** (en `.env.local`, ignorado por git; plantilla en `.env.example`): `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`). El `.env` existente solo guarda `SUPABASE_DB_PASSWORD`. No se usa secret/service role key.
- **Clientes** en `lib/supabase/`, tipados con `Database`:
  - `client.ts`: `createClient()` para client components.
  - `server.ts`: `createClient()` asíncrono para Server Components, Server Functions y Route Handlers.
  - `proxy.ts`: `updateSession()`, invocado desde `proxy.ts` (raíz) para refrescar la sesión en cada petición. Next 16 usa `proxy.ts`, no `middleware.ts`.
- **Tipos**: `lib/supabase/database.types.ts` es generado (MCP `generate_typescript_types`); no se edita a mano y se regenera tras cada migración.
- **Migraciones**: archivos `supabase/migrations/<YYYYMMDDHHMMSS>_<nombre>.sql` versionados en git, aplicados al remoto con `apply_migration` del MCP usando el mismo nombre.
- **Salas de Viuda en línea**: tabla `rooms` (migración `20261021120000_create_rooms.sql`, RLS abierta como `games`/`scores`, sin `delete`) con funciones en `lib/supabase/rooms.ts`. El transporte de la partida es Supabase Realtime (broadcast + presence), sin `postgres_changes`. Detalle en «Juegos».
- **Health check**: `GET /api/health` responde `200 { ok: true }` o `503 { ok: false, error }`.

## Juegos

Convención para portar un juego real (el resto del catálogo en `lib/games.ts` sigue simulado en `components/game-player.tsx`):

- **Motor** en `lib/games/<juego>/`: TypeScript sin `window`/`document`; expone `createXEngine({ onChange, onGameOver })` con `update(dt)`, `draw(ctx)`, `setKeys`, `reset` y `getSnapshot`. Las entidades reciben el `ctx` por parámetro.
- **Componente** en `components/games/<juego>-canvas.tsx` (client): monta el `<canvas>`, registra teclado y `requestAnimationFrame`, y los limpia al desmontar. Props: `paused`, `runId` (cambiarlo reinicia), `onChange`, `onGameOver`. Escalado con `.game-canvas` en `app/globals.css`.
- **Integración**: `GamePlayer` elige el canvas real según `gameId`; el HUD, la pausa y el modal de fin son de la plataforma y el puntaje se guarda con `saveScore` (`av_scores`).
- **Registro**: `components/games/registry.ts` mapea el `id` de la tabla `games` al canvas real (`GAME_CANVASES`); `GamePlayer` lo consulta y, sin entrada, usa la simulación. Los canvas emiten `GameSnapshot` (`lib/games/types.ts`: `score`, y opcionales `lives`, `level`, `stats`, `online`); el HUD solo muestra lo que el juego reporta. Con `online: true` `GamePlayer` oculta PAUSA, FIN y puntuación, no abre el modal de fin y no guarda nada en `scores`. `viuda` apunta a `ViudaGame` (selector VS CPU / EN LÍNEA), no al canvas directamente.
- **Juegos reales**:
  - `asteroids` (Asteroids, `lib/games/asteroids/`; solo teclado: `←` `→` `↑` `Espacio`). Fuente original en `references/started-games/02-asteroids/`.
  - `tetris` (Tetris, `lib/games/tetris/`; canvas 800×600 con tablero 10×20 centrado y vista previa a la derecha; 8 piezas, incluida la tuerca; solo teclado: `←` `→` mover, `↑`/`X` rotar, `↓` soft drop, `Espacio` hard drop). Fuente original en `references/started-games/03-tetris/`.
  - `viuda` (Viuda, `lib/games/viuda/`; juego de cartas de póker por vidas, diseño propio sin fuente original, ver `specs/07-juego-viuda.md`; canvas 800×600; modo VS CPU: tú contra 3 CPU, 3 vidas cada uno; hay además un modo en línea, abajo). Las reglas completas y vigentes están en `lib/games/viuda/REGLAS.md` (fuente: el reglamento `.docx` de esa carpeta; ver `specs/11-viuda-reglamento-y-correcciones.md`). Cada ronda: sorteo inicial (solo ronda 1, gana el rango más alto y, en igualdad, la pinta ♦ > ♥ > ♠ > ♣), 5 cartas por jugador y 5 en la viuda; **la ronda 1 la abre el ganador del sorteo y cada ronda siguiente el siguiente jugador vivo en el orden de turnos** (rota, no depende de quién perdió vida); la viuda empieza cerrada y se abre cuando alguien cambia las 5 o cuando el turno vuelve a quien abrió la ronda con la viuda cerrada (hayan pasado todos o haya llamado alguien en esa vuelta; `moveTurn` en `rules.ts`); CAMBIAR 5 siempre está disponible y CAMBIAR 1 solo con la viuda abierta; las vueltas son ilimitadas hasta que alguien llame; solo se puede llamar una vez por ronda; tras un "llamo" los demás juegan una última vuelta (cambiar o pasar) y al volver a quien llamó se muestran las manos; el duelo quita 1 vida a la peor mano, desempatando por pinta de la carta determinante (`SUIT_POWER`, `HandValue.suitBreak`), así que **pierde un solo jugador por duelo**. Puntuación: solo victoria (`3000 + 300 × vidas`), derrota = 0. El motor expone además `press(code)`, `setPointer(x, y)`, `pointerDown(x, y)`, `pointerUp(x, y)`, `pointerCancel()` y `click()`; el canvas convierte el puntero (ratón o dedo, Pointer Events) a coordenadas lógicas. Las animaciones y el reordenado de la mano están en «Viuda: animaciones y orden de la mano». Teclas: `P` paso, `L` llamo, `C` cambiar 5, `X` cambiar 1, `1`–`5` carta propia, `Q W E R T` carta de la viuda, `Espacio`/`Enter` continuar; el ratón también funciona. Cover `cover-viuda` en `app/globals.css`.

### Viuda en línea

Modo para 2 a 9 jugadores humanos (sin CPU de relleno), ver `specs/08-viuda-en-linea.md`. VS CPU no cambia de comportamiento.

- **Reglas compartidas**: `lib/games/viuda/rules.ts` es el núcleo puro e inmutable (`createGame`, `applyAction`, `advance`, `eliminate`, `getRanking`; devuelven `{ state, error }`) y lo usan el motor VS CPU y el anfitrión. `lib/games/viuda/online/layout.ts` coloca de 2 a 9 asientos con el jugador local abajo y turno horario.
- **Anfitrión autoritativo** (`online/host.ts`): el navegador de quien crea la sala ejecuta las reglas, valida cada acción y difunde. No hay servidor propio. Canal público `viuda:room:<code>` (presence + broadcast de la mesa `PublicTable`, los mensajes de cliente y los rechazos) y un canal por jugador `viuda:room:<code>:hand:<playerId>` para su `PrivateHand`. Las manos ajenas solo viajan en el duelo y la viuda cerrada va como `null`. Tipos y validadores en `online/protocol.ts`; la mesa lleva `seq` creciente y el cliente descarta los mensajes viejos. Sin límite de tiempo por turno; el sorteo y el duelo avanzan con CONTINUAR o solos a los 8 s (marca de tiempo, no por frame).
- **Cliente** (`online/client.ts`): `join`/`rejoin` con reintentos, acciones, detección de caída del anfitrión (la sala se cierra, sin migración de anfitrión).
- **Salas** (`rooms`): código de 5 caracteres (`online/room-code.ts`, alfabeto sin I, O, 0 ni 1). El anfitrión refresca `updated_at` cada 20 s y una sala figura como abierta si `status = 'waiting'` y el latido tiene menos de 60 s. Se cierra con `status = 'closed'`; no se borra.
- **Flujo**: lobby → sala de espera (INICIAR con 2–9) → partida → fin con clasificación (`rankingGroups` agrupa por duelo; con un solo perdedor por duelo cada grupo tiene un jugador) → REVANCHA, que vuelve a la espera con los jugadores presentes y deja la sala otra vez abierta.
- **Desconexión**: un jugador se da por desconectado si presence sigue sin él pasado 1,5 s. PAUSAR (anfitrión) congela la cuenta atrás y rechaza acciones; en pausa el desconectado vuelve con `rejoin` (reintenta cada 3 s) y recupera su mano; con la partida en marcha recibe «La partida sigue en curso; espera a que el anfitrión la pause». Al REANUDAR, quienes siguen fuera quedan eliminados; ELIMINAR lo hace al instante. Los eliminados siguen viendo la mesa como espectadores.
- **UI**: `components/games/viuda-online/` (`lobby`, `waiting-room`, `online-room`, `online-table`, `use-room-session`). El dibujo y los botones del canvas están en `lib/games/viuda/online/table-view.ts` (TypeScript puro, mismas teclas que VS CPU). Estilos `.vd-*` en `app/globals.css` con container queries; a ≤720 px el lobby y la sala de espera usan todo el alto del escenario en vez del 4:3 del monitor.
- **Plataforma**: sin puntuación. `online/snapshot.ts` convierte la mesa en `GameSnapshot` con `online: true`; el HUD muestra `RONDA`, `JUGADORES` (vivos/total) y las vidas propias.
- **Identidad**: alias en `localStorage` (`av_viuda_alias`) y `{ playerId, code }` en `sessionStorage` (`av_viuda_session`), que permite volver tras recargar la pestaña (no tras cerrarla). Sin auth real.
- **Cuidado al tocar este código**:
  - `supabase.channel(topic)` reutiliza el canal si el topic ya existe, por eso `use-room-session` crea la sesión en el siguiente tick (StrictMode monta, desmonta y vuelve a montar) y todo canal se libera con `removeChannel`.
  - Enviar por un canal antes de estar suscrito cae al respaldo REST, que va a quedar obsoleto: los canales de mano se suscriben al iniciar y el último envío pendiente espera a `SUBSCRIBED`.
  - El alias se comparte entre pestañas del mismo navegador (`localStorage`).
- **Riesgos asumidos** (specs futuros): el anfitrión ve todas las cartas; el canal de mano es adivinable (no hay auth ni canales privados con RLS); RLS abierta en `rooms`; sin temporizador de turno ni expulsión de AFK; una sala puede quedar en `playing` si el anfitrión cae sin avisar.
- **Cómo probarlo**: no hay tests automatizados. Se verificó con varias pestañas (o con scripts que crean varias `createClientSession` contra Realtime) y con Playwright. Las filas de prueba de `rooms` conviene borrarlas después.

### Viuda: animaciones y orden de la mano

Solo visual y de experiencia de usuario, ver `specs/10-viuda-animaciones-e-interaccion.md`. Las reglas, la puntuación y las acciones no cambian. Mismo sistema en VS CPU y en línea.

- **Capa de animación** (`lib/games/viuda/fx/`, TypeScript puro): `timeline.ts` (reloj en ms que avanza con `update(dt)`, no con `Date.now`, así la pausa lo congela; cola de escenas; vuelos, carteles y efectos; bloqueo de turno), `scenes.ts` (de un evento a vuelos y carteles: `swap1`, `swap5`, `pass`, `call`, `widowFlip`, `deal`, `showdown`) y `draw.ts` (cartas en vuelo, carteles, aro de turno, «ÚLTIMA VUELTA», corazón roto). Duraciones y colores en `FX_*` de `constants.ts`. Cada escena dura como máximo `FX_MAX_MS` (1000 ms); con más de una en cola se acelera ×2. La animación bloquea el turno siguiente (la CPU piensa mientras anima pero no actúa hasta que acaba) y un clic o una tecla la salta.
- **La mesa que se dibuja es siempre el estado más reciente**; la animación es una capa encima. Las cartas en vuelo ocultan su hueco quieto con `timeline.hidden` (claves `own:<posición visual>`, `widow:<k>`, `seat:<asiento>:<k>`) y, en el duelo, las manos rivales, la peor mano, la jugada, el mensaje y la vida perdida se enseñan después del volteo (`revealed`, `livesShown`). Si añades un elemento que cambia con la mesa, decide si debe esperar a la animación.
- **Eventos**: `rules.ts` deja en `RulesState.lastEvents` (arreglo, 1 o 2 eventos por transición: una acción y, si cierra la vuelta, `showdown`) lo que acaba de ocurrir; es informativo y las reglas no lo leen. `eventSeq` numera (`n`) los eventos de toda la partida. En línea viajan en `PublicTable.events?` (`online/protocol.ts`, con `playerId` en vez del asiento y sin cartas; `publicEvents()` descarta los tipos desconocidos). Difiere de la spec, que decía un solo `lastEvent`/`event`.
- **Mesa en línea** (`online/table-fx.ts`, con la geometría en `online/geometry.ts`): cada cliente anima por su cuenta los eventos con `n` mayor que el último visto; la primera mesa que ve no se anima (un `rejoin` no repite nada atrasado). Si un evento cambia mi mano (reparto o mi cambio), espera a la mano nueva, que llega por otro canal (`hand.seq` posterior a la mesa), ocultando mientras tanto mi mano y la viuda; pasados 1,5 s renuncia a animarlo. `buildTable()` repite los eventos de la última transición en cada mesa (presencia, pausa, `rejoin`), por eso el cliente deduplica por `n`.
- **Orden de la mano** (`lib/games/viuda/hand-order.ts`): orden visual propio, solo local (no viaja por la red ni se guarda). Se guarda por identidad de carta (`suit-rank`): con CAMBIAR 1 la carta nueva ocupa el hueco de la que salió, con CAMBIAR 5 las nuevas ocupan las posiciones en orden y cada ronda vuelve al orden de reparto. La selección (`selOwn`) y el `handIndex` enviado son **índices de las reglas**; las teclas `1`–`5`, los huecos de animación y lo que se dibuja son **posiciones visuales** (`visualIndices`, `visualToRules`, `rulesToVisual`). En VS CPU el orden vive en `engine.ts`; en línea, en `TableFx` (`order()`/`setOrder()`).
- **Arrastre**: `createHandDrag` (mismo archivo) decide clic o arrastre (umbral de 6 px lógicos), el hueco destino, cómo se apartan las vecinas y el asentamiento al soltar. Se puede reordenar en cualquier momento con cartas en mano (también fuera de turno), salvo cartas en vuelo o, en línea, con la mesa pausada o el jugador desconectado o eliminado. El canvas usa `pointerdown`/`pointerup`/`pointercancel` con captura del puntero (el clic nativo ya no se usa) y la clase `game-canvas--drag` (`touch-action: none`, solo en los canvas de Viuda).
- **Dos lienzos** (`constants.ts`): apaisado 800×600 (escritorio) y vertical 400×720 (móvil en vertical, `PORTRAIT_QUERY`). `setLayoutMode` reasigna `W`, `H`, `CARD_*`, `HAND_Y`, `WIDOW_*`, `SEAT_*` y `BUTTON_*`, que son enlaces vivos: léelos dentro de funciones, nunca en constantes de módulo. `components/games/use-viuda-layout.ts` elige el modo y el tamaño del canvas; el CSS (`.crt:has(.game-canvas--drag)`, 5:9) usa la misma consulta. Posiciones que dependen del modo: `online/geometry.ts` (`tableLabels`, `localAnchors`, cartas y anclas) y `online/layout.ts` (apaisado en anillo, vertical en cuadrícula de lectura). En vertical no hay rótulo «TUS CARTAS» y los botones van de dos en dos. Las cartas de la mano miden 96×134 (apaisado) y 70×100 (vertical); la pantalla de Viuda no lleva líneas de barrido ni viñeta.
- **Cuidado**: «ÚLTIMA VUELTA» se dibuja en `(400, 176)` y los carteles sobre cada panel; ambos suponen el layout actual de asientos (probado con 2 y 4 jugadores, no con 9), así que revísalos si se cambia `online/layout.ts`. Una pestaña en segundo plano no avanza sus animaciones (el navegador pausa `requestAnimationFrame`), así que no puede actuar hasta volver al frente.
- **Cómo probarlo**: no hay tests automatizados. Se verificó con Playwright: ratón real (`page.mouse`) para arrastrar, dos pestañas para el modo en línea (alternando `bringToFront`), un contexto móvil (`hasTouch`, 375 px) con eventos táctiles por CDP (`Input.dispatchTouchEvent`) y un script que juega partidas completas contra `rules.ts` para comprobar los eventos. Las filas de prueba de `rooms` se borran después (solo las propias).

## `references/templates/`

Prototipo de diseño de referencia (HTML + JSX con React por CDN y Babel, no es código de la app). Es la fuente de verdad del diseño/UX a portar a `app/`:

- `Arcade Vault.html` + `styles.css`: entrada y estilos.
- `app.jsx`: router casero basado en estado (`route.name`: `biblioteca`, `detalle`, `player`, `auth`, `salon`) sincronizado con `location.hash`.
- Pantallas: `biblioteca.jsx`, `detalle.jsx`, `reproductor.jsx`, `auth.jsx`, `salon.jsx` (salón de la fama); `nav.jsx` y `data.jsx` (catálogo de juegos).
- Persistencia simulada en `localStorage` (`av_user` para sesión, `av_scores` para puntuaciones).

Al portarlo, se traduce a rutas del App Router en lugar del router por hash.

## Skills

Usa siempre /frontend-design para diseñar la interfaz de usuario.
