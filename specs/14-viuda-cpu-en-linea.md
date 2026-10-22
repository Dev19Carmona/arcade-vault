# SPEC 14 — Viuda en línea: computadoras en la sala de espera

> **Estado:** Borrador
> **Depende de:** SPEC 07 (Viuda VS CPU, IA de las CPU), SPEC 08 (Viuda en línea, sala de espera y anfitrión), SPEC 11 (reglas vigentes), SPEC 13 (chat y líneas de sistema)
> **Fecha:** 2026-10-22
> **Objetivo:** Permitir que el anfitrión de una sala en línea de Viuda ocupe puestos libres con CPU (de uno en uno con clic en el puesto, o los que falten de golpe con un botón) para jugar mezclando humanos y computadoras, hasta los 9 puestos.

---

## Por qué existe este spec

El SPEC 08 dejó el modo en línea «sin CPU de relleno»: para jugar hacen falta de 2 a 9 humanos. Eso impide llenar una mesa grande con pocos amigos. La IA de las CPU ya existe (SPEC 07) pero vive dentro de `engine.ts`, acoplada al motor VS CPU y a su reloj de pensar. Este spec la extrae a un módulo puro y la hace correr en el **anfitrión**, que ya es la autoridad de la sala: una CPU es un asiento más cuyas acciones decide el anfitrión en vez de llegar por la red.

**Las reglas (`rules.ts`), la puntuación y el modo VS CPU no cambian de comportamiento.** El modo en línea sigue sin puntuación.

Las decisiones de diseño visual (puestos con «+ CPU», botón RELLENAR, etiqueta de CPU en la mesa) se toman con `/frontend-design`, como exige el `CLAUDE.md`.

---

## Alcance

**Dentro:**

- **Añadir CPU en la sala de espera** (solo el anfitrión, solo en `waiting`):
  - Cada puesto libre de la lista muestra un control «+ CPU»; al pulsarlo el puesto se ocupa con una CPU.
  - Un botón `RELLENAR PUESTOS` ocupa con CPU todos los puestos libres hasta los 9.
  - Cada CPU tiene un control «✕» para quitarla (solo el anfitrión).
  - Los demás jugadores ven a las CPU en la lista con una etiqueta `CPU`, sin controles.
- **Reemplazo por un humano:** si la sala tiene los 9 puestos ocupados y hay alguna CPU, un humano que entra con el código toma el puesto de la CPU añadida más recientemente (ocupa su misma posición en el orden de turno). La sala solo figura «llena» para humanos cuando hay 9 humanos.
- **Mínimo para INICIAR:** al menos **2 humanos** (anfitrión incluido) y entre 2 y 9 puestos en total. Las CPU solo rellenan.
- **Partida con CPU:**
  - La CPU actúa en su turno con la misma IA que en VS CPU (llamar con umbral decreciente, tomar la viuda cerrada con mano débil, cambiar 1 o las 5 solo si mejora).
  - El anfitrión decide y aplica la acción con `applyAction`, igual que con un humano; los clientes ven los mismos `GameEvent` y las mismas animaciones, sonidos y líneas de chat de sistema («CPU 2 pasó»).
  - Las CPU no tienen canal de mano (el anfitrión ya ve todas las cartas) y siempre figuran conectadas.
  - **PAUSAR** congela también a las CPU; **REANUDAR** no las elimina; **ELIMINAR** no se ofrece sobre una CPU.
  - La partida termina cuando queda un solo jugador vivo, como hasta ahora. Si todos los humanos caen, **las CPU siguen jugando hasta el final** y los eliminados miran como espectadores.
- **Relevo del anfitrión:** las CPU viajan en `HostBackup.players` y el nuevo anfitrión sigue dirigiéndolas. Las CPU no son nunca relevo (`backupIds` solo con humanos).
- **REVANCHA:** vuelve a la sala de espera con los humanos presentes y **conserva las CPU** añadidas.
- Extraer la IA de `engine.ts` a un módulo puro compartido por VS CPU y por el anfitrión.
- Documentar en `CLAUDE.md` (sección «Viuda en línea») y en `lib/games/viuda/REGLAS.md` (tabla VS CPU / en línea).

**Fuera de alcance (para otros specs):**

- Niveles de dificultad, personalidades o nombres propios de las CPU (una sola IA, la actual).
- Añadir, quitar o reemplazar CPU con la partida en marcha, o cambiar un humano que cae por una CPU.
- Que una CPU sustituya a un humano desconectado.
- Que el chat de la sala dé voz a las CPU (no escriben mensajes).
- Mostrar en el lobby cuántas CPU tiene cada sala (el lobby sigue mostrando solo humanos).
- Sonidos o animaciones propias para las CPU.
- Mejorar la IA, y cambios de reglas, puntuación, esquema de `rooms` o Supabase.
- Tests automatizados (el proyecto no tiene framework de tests).

---

## Modelo de datos

### Jugador del anfitrión (con marca de CPU)

```ts
// lib/games/viuda/online/host.ts (interno) y HostBackup.players en protocol.ts
interface Player {
  playerId: string; // CPU: "cpu-1" … "cpu-8"
  name: string; // CPU: "CPU 1" … "CPU 8"
  cpu?: boolean; // ausente = humano
}
```

- El id de una CPU lleva el prefijo `cpu-` y el nombre es `CPU <n>` con el menor `n` libre; al quitar una CPU su número queda libre.
- `addPlayer` del anfitrión rechaza (`full`, ignora) cualquier `join` cuyo `playerId` empiece por `cpu-`, para que un humano no pueda hacerse pasar por una CPU.
- `HostBackup.players` pasa a `{ playerId; name; cpu?: boolean }[]`. Opcional, por compatibilidad con copias antiguas.

### Mesa pública

```ts
// lib/games/viuda/online/protocol.ts
export interface PublicSeat {
  // …campos actuales
  cpu?: boolean; // true = computadora; ausente = humano
}
```

- En una CPU, `connected` es siempre `true`. Un cliente sin el campo trata el asiento como humano y no se rompe.
- No cambian `PublicTable`, `OnlineAction`, `ClientMessage`, `PrivateHand`, `GameEvent` ni `rooms`.

### Sesión del anfitrión

```ts
// HostSession (host.ts): acciones solo del anfitrión, no viajan por la red
addCpu(): boolean;      // ocupa un puesto libre; false si no hay hueco o la partida ya empezó
fillCpus(): number;     // ocupa todos los libres; devuelve cuántas añadió
removeCpu(playerId: string): void; // solo en espera
```

- `start()` exige `humanCount >= MIN_HUMANS` además de `2 <= players.length <= MAX_PLAYERS`.
- `addPlayer` (humano) con la sala llena: si hay una CPU, la quita y toma su posición; si no, `reject(id, "full")`. El límite «lleno» se evalúa sobre **humanos**.
- `heartbeat(code, humanCount)` envía solo los humanos a `rooms.player_count`, así que `joinRoom` y el lobby no cambian.

### Constantes

```ts
// lib/games/viuda/constants.ts
export const MIN_HUMANS = 2; // mínimo de humanos para iniciar una sala en línea
export const CPU_ONLINE_PAD_MS = 1000; // espera extra de la CPU para que los clientes terminen de animar
```

`MIN_PLAYERS` y `MAX_PLAYERS` siguen contando puestos totales (reglas y layout).

### IA compartida

```ts
// lib/games/viuda/cpu.ts (TypeScript puro, sin window/document)
export function chooseCpuAction(
  state: RulesState,
  random: () => number,
): OnlineAction; // para state.current; usa handScore y bestSingleSwap movidos desde engine.ts
```

- Mueve sin cambiar de comportamiento `handScore`, `bestSingleSwap` y la decisión de `cpuAct`. `engine.ts` la llama y sigue aplicando la acción con su `act`.
- Reloj de pensar en línea (en `host.ts`): `CPU_THINK_MIN..CPU_THINK_MAX` + `CPU_ONLINE_PAD_MS`, contado con marca de tiempo (no por frame), igual que `advanceDeadline`, y congelado en pausa.

### Estructura de archivos

```
lib/games/viuda/cpu.ts                              IA pura extraída de engine.ts (nuevo)
lib/games/viuda/engine.ts                           usa chooseCpuAction; comportamiento VS CPU igual
lib/games/viuda/constants.ts                        MIN_HUMANS, CPU_ONLINE_PAD_MS
lib/games/viuda/online/protocol.ts                  PublicSeat.cpu, HostBackup.players[].cpu y sus validadores
lib/games/viuda/online/host.ts                      jugadores CPU, addCpu/fillCpus/removeCpu, reloj de la CPU, reemplazo, mínimos
lib/games/viuda/online/table-view.ts                etiqueta CPU en el panel del asiento si hace falta
components/games/viuda-online/use-room-session.ts   expone addCpu/fillCpus/removeCpu del anfitrión
components/games/viuda-online/online-room.tsx       pasa las acciones a la sala de espera
components/games/viuda-online/waiting-room.tsx      «+ CPU», RELLENAR PUESTOS, ✕ y etiqueta CPU; mínimo de humanos
app/globals.css                                     estilos de los controles de puesto (.vd-slot…)
lib/games/viuda/REGLAS.md                           tabla VS CPU / en línea
CLAUDE.md                                           sección «Viuda en línea» actualizada
```

---

## Plan de implementación

Antes de escribir código: usar `/frontend-design` para los controles de la sala de espera y leer en `node_modules/next/dist/docs/` lo que toque de Client Components.

1. **Extraer la IA.** Crear `cpu.ts` con `handScore`, `bestSingleSwap` y `chooseCpuAction`; `engine.ts` los usa en `cpuAct`. Sin cambios visibles. Verificación: `npm run lint` y `npm run build`; una partida VS CPU se comporta igual (las CPU llaman, pasan y cambian).
2. **Protocolo y constantes.** Añadir `MIN_HUMANS`, `CPU_ONLINE_PAD_MS`, `PublicSeat.cpu` y `players[].cpu` en `HostBackup`, con sus validadores. Sin usarlos todavía. Verificación: `npm run build`; una copia o mesa antigua sin el campo sigue validando.
3. **Anfitrión: puestos de CPU.** En `host.ts`, `Player.cpu`, `addCpu`, `fillCpus`, `removeCpu`, numeración `CPU n`, rechazo de ids `cpu-*`, reemplazo de la última CPU por un humano y límites sobre humanos (`start`, `addPlayer`, `heartbeat`). La mesa en espera lleva `cpu` en los asientos. Verificación: con una consola o dos pestañas, llenar con CPU y entrar un humano reemplaza a la última; con 9 humanos responde «sala llena».
4. **Sala de espera.** `waiting-room.tsx`: «+ CPU» en puestos libres, `RELLENAR PUESTOS`, ✕ por CPU, etiqueta `CPU`, texto de ayuda con el mínimo de 2 humanos; `use-room-session.ts` y `online-room.tsx` conectan las acciones. Verificación: el anfitrión añade y quita CPU y los demás las ven; INICIAR sigue deshabilitado con menos de 2 humanos aunque haya 9 puestos.
5. **Partida: la CPU juega.** En `host.ts`, al tocar el turno de una CPU (y no pausado), programar su acción con la marca de tiempo; tras `commit`, rearmar si le toca otra vez a una CPU. Las CPU no se tratan como desconectables (`connected`), no tienen `handLink` y quedan fuera de `backupTargets`. Verificación: 2 pestañas más CPU: las CPU actúan solas, las animaciones, sonidos y líneas de sistema salen para cada acción, y PAUSAR las detiene.
6. **Pausa, relevo y revancha.** `resume` y `eliminatePlayer` ignoran CPU; el nuevo anfitrión (`restore`) reconstruye las CPU y retoma su reloj tras reanudar; `rematch` conserva las CPU. Verificación: pausar y reanudar con CPU en juego; cerrar la pestaña del anfitrión y ver que otro humano toma la sala y las CPU siguen; REVANCHA deja las CPU en la espera.
7. **Mesa y final.** `table-view.ts` muestra la etiqueta de CPU junto al nombre si el diseño lo pide; la clasificación y el modal de fin muestran a las CPU como cualquier jugador. Con todos los humanos eliminados, las CPU terminan la partida y los espectadores la ven. Verificación: eliminar a los humanos (desconexión + REANUDAR) y ver que la partida llega a `final`.
8. **Documentación.** Actualizar `CLAUDE.md` («Viuda en línea»: CPU en el anfitrión, `cpu.ts`, reemplazo, mínimo de humanos) y `REGLAS.md`. Verificación: lectura de los archivos.

---

## Criterios de aceptación

- [ ] `npm run lint` y `npm run build` terminan sin errores.
- [ ] VS CPU se comporta igual que antes de extraer la IA (misma decisión de llamar, pasar y cambiar) y su puntuación no cambia.
- [ ] Solo el anfitrión ve los controles «+ CPU», `RELLENAR PUESTOS` y ✕; los demás jugadores ven a las CPU con la etiqueta `CPU` y sin controles.
- [ ] Pulsar «+ CPU» en un puesto libre lo ocupa con una CPU llamada `CPU <n>` con el menor número libre.
- [ ] `RELLENAR PUESTOS` completa los 9 puestos con CPU respetando a los humanos presentes, y no hace nada si no hay puestos libres.
- [ ] Quitar una CPU libera su puesto y su número; no se pueden añadir ni quitar CPU con la partida en marcha.
- [ ] INICIAR está deshabilitado con menos de 2 humanos, aunque haya 9 puestos ocupados por CPU, y habilitado con 2 humanos y al menos 2 puestos.
- [ ] Con 9 puestos ocupados y al menos una CPU, un humano que entra con el código toma el puesto de la CPU añadida más recientemente, en su misma posición del orden de turno.
- [ ] Con 9 humanos, el que entra recibe «sala llena»; el lobby y `rooms.player_count` cuentan solo humanos.
- [ ] Un `join` con un `playerId` que empieza por `cpu-` no ocupa puesto.
- [ ] En la partida, cada CPU actúa sola en su turno con una de las acciones válidas (pasar, llamar, cambiar 1, cambiar 5) y nunca produce un error de reglas.
- [ ] Una CPU espera entre `CPU_THINK_MIN` y `CPU_THINK_MAX` más `CPU_ONLINE_PAD_MS` antes de actuar, y los clientes animan su jugada y reproducen su sonido igual que la de un humano.
- [ ] El chat muestra una línea de sistema por cada «paso» o «llamo» de una CPU, una sola vez.
- [ ] PAUSAR detiene a las CPU y REANUDAR las retoma; ninguna CPU queda eliminada ni figura desconectada en la pausa.
- [ ] Las CPU no tienen canal de mano ni aparecen en `backupIds`.
- [ ] Si el anfitrión cae y otro humano toma la sala, las CPU siguen en la mesa y juegan tras REANUDAR.
- [ ] Si quedan eliminados todos los humanos, las CPU juegan hasta que queda un ganador y la partida llega a `final`; los eliminados la miran como espectadores.
- [ ] La clasificación final incluye a las CPU y REVANCHA devuelve a la sala de espera con los humanos presentes y las mismas CPU.
- [ ] Una mesa o una copia sin los campos `cpu` sigue validando y se trata como humanos.
- [ ] Asteroids, Tetris y el modo VS CPU no cambian; sin errores nuevos en consola ni warnings de hidratación; los temporizadores de las CPU se liberan al cerrar o relevar la sala.

---

## Decisiones tomadas y descartadas

- **Sí:** las CPU corren en el **anfitrión** y aplican su acción con `applyAction`, igual que un humano (decisión de arquitectura). Reutiliza la validación, los `GameEvent` y la capa de animación sin tocar el protocolo de acciones. **No:** un jugador CPU que se conecta como cliente falso: añade canales, presence y un `playerId` suplantable por cada CPU.
- **Sí:** extraer la IA a `lib/games/viuda/cpu.ts` y que `engine.ts` la importe, para que VS CPU y en línea decidan igual. **No:** copiar la IA al anfitrión: dos copias divergen.
- **Sí:** añadir CPU de una en una con clic en el puesto **y** con un botón que rellena los que faltan (petición del usuario). Quitarlas con ✕.
- **Sí:** un humano que entra en una sala llena de CPU reemplaza a la última añadida (decisión del usuario), para poder rellenar los 9 y compartir el código sin quitarlas a mano. **No:** «sala llena» para humanos mientras haya CPU.
- **Sí:** mínimo de **2 humanos** para iniciar (decisión del usuario). Evita que el modo en línea sustituya a VS CPU.
- **Sí:** si solo quedan CPU vivas, **juegan hasta el final** (decisión del usuario), sin generalizar `endWhenEliminated`. **No:** terminar la partida al caer el último humano.
- **Sí:** `rooms.player_count` solo cuenta humanos, así `joinRoom` y el lobby no cambian y no hay migración. **No:** contar las CPU; la sala parecería llena a los humanos.
- **Sí:** las CPU esperan `CPU_ONLINE_PAD_MS` extra en línea, para que cada cliente termine de animar la jugada anterior antes de la siguiente (en VS CPU el motor ya espera al `fx`). **No:** esperar una confirmación de cada cliente; el anfitrión no la tiene y añadiría protocolo.
- **Sí:** una sola IA, sin niveles. **No:** niveles de dificultad (spec propia).
- **Sí:** las CPU quedan fuera de `backupIds` y sin canal de mano: el anfitrión ya tiene todas las manos y un relevo necesita a un humano.
- **Sí:** nombres `CPU <n>` e ids `cpu-<n>` con el menor número libre; el anfitrión descarta los `join` con ese prefijo.

---

## Riesgos identificados

| Riesgo                                                                                       | Mitigación                                                                                                                          |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Las CPU juegan más rápido de lo que los clientes animan y la mesa se atrasa                  | `CPU_ONLINE_PAD_MS` y la cola acelerada ×2 de SPEC 10; ajustar la constante al probar con 9 asientos                                |
| Un humano suplanta una CPU con un `playerId` `cpu-*`                                         | El anfitrión ignora los `join` y las acciones de ids con ese prefijo que lleguen por la red; solo él ejecuta a las CPU              |
| El temporizador de la CPU sigue activo tras pausar, cerrar o relevar la sala                 | Marca de tiempo congelada en pausa; `stopTimers()` y `dispose()` lo cancelan; el anfitrión desbancado (`superseded`) deja de actuar |
| El relevo reconstruye mal las CPU o duplica su acción                                        | El nuevo anfitrión arranca en pausa (SPEC 08), las CPU se derivan de `players[].cpu` y solo se arma un reloj por turno              |
| Partida solo de CPU larga para los espectadores eliminados                                   | Decisión asumida por el usuario; el anfitrión puede SALIR; si molesta, otro spec que termine al caer el último humano               |
| Sala sin ningún humano de relevo (anfitrión + CPU, el otro humano se fue)                    | Riesgo ya asumido en SPEC 08: si el anfitrión cae sin relevo, la sala se cierra                                                     |
| `engine.ts` cambia de comportamiento al mover la IA                                          | Mover el código sin reescribirlo; comparar a ojo una partida antes y después; sin tests automatizados en el proyecto                |
| Revanchas con CPU y humanos que se fueron cambian la composición sin que el anfitrión lo vea | `rematch` ya filtra humanos conectados; la lista de espera muestra siempre quién está (humanos y CPU) antes de INICIAR              |

---

## Qué **no** está en este spec

- Niveles de dificultad o nombres propios de las CPU.
- Añadir, quitar o reemplazar CPU con la partida en marcha, o una CPU que sustituya a un humano caído.
- Chat de las CPU, sonidos o animaciones propias.
- Mostrar las CPU en el lobby de salas.
- Mejoras de la IA, cambios de reglas, puntuación en línea, `rooms` o Supabase.
- Tests automatizados.

Cada uno de estos puntos, si se aborda, va en su propio spec.
