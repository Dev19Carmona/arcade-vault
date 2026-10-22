# SPEC 13 — Viuda: cambiar cartas arrastrando y acciones desde un chat

> **Estado:** Aprobado
> **Depende de:** SPEC 07 (Viuda VS CPU), SPEC 08 (Viuda en línea), SPEC 10 (arrastre de la mano, `createHandDrag`, capa `fx`), SPEC 11 (reglas vigentes), SPEC 12 (sonidos)
> **Fecha:** 2026-10-22
> **Objetivo:** Quitar los cuatro botones del canvas de Viuda y reemplazarlos por arrastre (una carta suelta cambia 1; el marco gris de la mano o de la viuda cambia las 5; en ambos sentidos, con una vista previa de lo que se va a cambiar) y por un chat en línea donde escribir «paso» o «llamo» (o pulsar sus atajos) ejecuta esas acciones.
>
> **Revisado tras las pruebas de uso** (ver «Cambios posteriores a la aprobación»): el cambio de las 5 ya no es soltar una carta en la zona de la viuda, sino arrastrar un marco gris; la selección por clic y sus teclas se eliminaron.

---

## Por qué existe este spec

Hoy las acciones de Viuda son cuatro botones dibujados en el canvas (`CAMBIAR 5`, `CAMBIAR 1`, `PASO`, `LLAMO`, con `BUTTON_*` en `constants.ts`), más teclado. Ocupan la franja inferior, son pequeños en móvil y obligan a seleccionar una carta propia y una de la viuda antes de pulsar CAMBIAR 1. El SPEC 10 ya dejó arrastrar cartas de la mano con ratón y dedo; este spec reutiliza ese gesto para las acciones de cambio y mueve PASO/LLAMO a un chat, que además da a la mesa en línea un canal de conversación.

**Las reglas, la puntuación, el protocolo de acciones (`OnlineAction`) y el anfitrión no cambian.** Cada gesto o comando termina en la misma acción que hoy ejecuta un botón.

Las decisiones de diseño visual (vista previa del arrastre, panel del chat) se toman con `/frontend-design`, como exige el `CLAUDE.md`.

---

## Alcance

**Dentro:**

- **Quitar los botones del canvas** (CAMBIAR 5, CAMBIAR 1, PASO, LLAMO) en VS CPU y en línea, y dejar de reservar la franja `BUTTON_*`.
- **Cambiar con arrastre** (ratón y táctil, Pointer Events del SPEC 10), siempre en el turno propio:
  - **Una carta**: arrastrar una carta propia y soltarla sobre una carta concreta de la viuda abierta = CAMBIAR 1; o al revés, arrastrar una carta de la viuda abierta y soltarla sobre una carta propia. Soltar una carta suelta en el hueco de la viuda, o sobre la viuda cerrada, no hace nada.
  - **Las cinco**: la mano y la viuda llevan un **marco gris con una bolita** en la esquina superior derecha, visible solo en el turno propio. Agarrar el marco (o la bolita) mueve las cinco cartas; soltarlas sobre el marco del otro grupo = CAMBIAR 5, de la mano a la viuda o de la viuda a la mano. Con la viuda cerrada se puede agarrar el marco de la viuda, pero no sus cartas sueltas.
  - Mientras se arrastra sobre un destino, **vista previa**: queda resaltado y un rótulo dice qué va a ocurrir («CAMBIAR 9♠ POR Q♥», «CAMBIAR LAS 5»).
  - Soltar una carta propia fuera de la viuda sigue reordenando la mano (SPEC 10).
  - Fuera de turno (o con acciones no disponibles) la vista previa dice por qué («NO ES TU TURNO») y soltar no ejecuta nada.
- **Chat en línea** (HTML, no canvas, para usar el teclado nativo del móvil):
  - Mensajes de texto entre los jugadores de la sala, por broadcast del canal público, sin historial (efímero).
  - **Comandos**: escribir exactamente «paso» o «llamo» (sin importar mayúsculas, tildes ni espacios sobrantes) ejecuta PASO o LLAMO con la misma validación de reglas. El texto del comando no se publica como mensaje; el resultado se ve como una línea de sistema («María pasó», «Pedro llamó») para todos, a partir de los `GameEvent` ya existentes.
  - **Atajos**: dos chips `PASO` y `LLAMO` en el panel del chat, que hacen lo mismo con un clic o toque.
  - Si el comando no se puede ejecutar (no es tu turno, ya se llamó en la ronda, partida pausada), se muestra una línea de sistema solo para quien lo escribió con el motivo que ya devuelven las reglas.
  - En escritorio el panel convive con el teclado de siempre; en móvil, el campo «Escribir un mensaje» abre el teclado del dispositivo.
- **VS CPU:** sin chat. Se sustituyen los cuatro botones por dos botones pequeños `PASO` y `LLAMO` (HTML, bajo el canvas), que llaman a `engine.press` con la misma tecla que hoy.
- **Teclado:** quedan `P`, `L`, `C` (cambiar las 5) y `Espacio`/`Enter`. Se eliminaron la selección por clic y las teclas `X`, `1`–`5` y `Q W E R T`. En móvil no se muestra ninguna pista de teclas. Mientras el foco está en el campo del chat, **las teclas del juego se ignoran** (escribir «paso» no debe disparar `P`).
- Documentar en `CLAUDE.md` (sección «Juegos»).

**Fuera de alcance (para otros specs):**

- Historial de chat persistente o tabla de mensajes en Supabase.
- Chat en VS CPU, mensajes de sistema de las CPU, emotes, reacciones, mensajes privados, silenciar jugadores, moderación o filtro de lenguaje.
- Notificación de mensajes sin leer, sonido del chat (el SPEC 12 no incluye sonido de chat).
- Otros comandos de chat (`/cambiar`, `/ayuda`…): solo «paso» y «llamo».
- Cambiar las 5 con un gesto de extremo a extremo de la mano.
- Cambios en reglas, IA, puntuación, protocolo de acciones, `rooms` o esquema de Supabase.
- Autenticación del emisor del chat (ver riesgos).
- Tests automatizados (el proyecto no tiene framework de tests).

---

## Modelo de datos

### Mensaje de chat (solo en línea, efímero)

```ts
// lib/games/viuda/online/protocol.ts
export interface ChatMessage {
  id: string; // aleatorio, para deduplicar
  playerId: string;
  alias: string;
  text: string; // 1–140 caracteres, ya recortado
  at: number; // Date.now() del emisor, solo para ordenar/mostrar
}
export const EVENT_CHAT = "chat"; // canal público viuda:room:<code>
export function isChatMessage(value: unknown): value is ChatMessage;
```

- Viaja por **broadcast del canal público existente** (`roomChannelName`), sin pasar por el anfitrión ni guardarse. Quien entra después no ve lo anterior; el cliente conserva en memoria los últimos 50 mensajes.
- No cambia `PublicTable`, `ClientMessage`, `OnlineAction` ni `rooms`.

### Comando de chat

```ts
// lib/games/viuda/online/chat.ts (TypeScript puro)
export type ChatCommand = "pass" | "call";
export function parseChatCommand(text: string): ChatCommand | null;
```

- `parseChatCommand` normaliza (minúsculas, sin tildes, `trim`) y acepta solo el texto completo `paso` o `llamo`; «paso a paso» o «no llamo» son mensajes normales.
- El comando se traduce a la `OnlineAction` `pass` / `call` que ya envía el botón; no hay ruta nueva hacia el anfitrión.
- Una línea de sistema («X pasó», «X llamó») se genera a partir de los `GameEvent` `pass` y `call` que ya recibe cada cliente (deduplicados por `n`, igual que animaciones y sonidos); no viaja como chat.

### Destino del arrastre

- `hand-order.ts` (arrastre de una carta propia): `WidowTarget` = `widow-card` (CAMBIAR 1) o `widow-zone` (no hace nada); `widowTargetAt(x, y, widowOpen)` lo calcula con la geometría de la viuda (`WIDOW_*`, distinta en apaisado y vertical).
- `swap-drag.ts` (carta de la viuda o marco): `SwapSource` = `{ kind: "widow-card", index }` o `{ kind: "group", group: "own" | "widow" }`. `createSwapDrag()` decide qué se coge al pulsar fuera de las cartas propias; `resolveSwapIntent` devuelve el destino al soltar.
- `drag-preview.ts`: `DragIntent` = `swap1` | `swap5` | `blocked`, con los rectángulos a resaltar y el rótulo.
- Los marcos (`groupFrame`, `groupDot`) se calculan a partir de las filas de cartas del lienzo vigente (margen 10 px apaisado, 4 vertical).

### Estructura de archivos

```
lib/games/viuda/hand-order.ts                       destino del arrastre de una carta propia
lib/games/viuda/swap-drag.ts                        marcos, asas y arrastre de carta de la viuda o de un marco (nuevo)
lib/games/viuda/drag-preview.ts                     vista previa y rótulo del destino (nuevo)
lib/games/viuda/constants.ts                        se retiran BUTTON_* (o se dejan a cero) y se ajusta la franja inferior
lib/games/viuda/entities.ts                         se retira el dibujo de botones; vista previa y resalte de la viuda
lib/games/viuda/engine.ts                           VS CPU: arrastre a la viuda → swap1 / swap5; sin botones; teclado igual
lib/games/viuda/online/table-view.ts                en línea: igual, sin botones
lib/games/viuda/online/protocol.ts                  ChatMessage, EVENT_CHAT, isChatMessage
lib/games/viuda/online/chat.ts                      parseChatCommand (nuevo)
lib/games/viuda/online/client.ts                    enviar/recibir chat por el canal público
components/games/viuda-canvas.tsx                   pasa el destino del arrastre; ignora teclas si el foco está en un input
components/games/viuda-online/online-table.tsx      idem en línea; monta el chat
components/games/viuda-online/chat.tsx              panel de chat: lista, campo, chips PASO/LLAMO (nuevo)
components/games/viuda-online/use-room-session.ts   estado del chat (últimos 50) y envío
components/games/viuda-canvas.tsx                    VS CPU: dos botones PASO/LLAMO (HTML) sobre la franja inferior
app/globals.css                                     estilos .vd-chat, botones de VS CPU y layout con el panel
CLAUDE.md                                           sección «Juegos» actualizada
```

---

## Plan de implementación

Antes de escribir código: usar `/frontend-design` para la vista previa del arrastre y el panel del chat, y leer en `node_modules/next/dist/docs/` lo que toque de Client Components.

1. **Destino del arrastre.** Añadir `DragTarget` y que `createHandDrag` lo reciba y lo exponga; el motor y la mesa en línea calculan el destino con la geometría de la viuda. Sin cambiar acciones: soltar sobre la viuda aún no hace nada. Verificación: `npm run lint` y `npm run build`; reordenar la mano funciona igual que antes.
2. **VS CPU: cambiar con arrastre.** En `engine.ts`, soltar sobre una carta de la viuda abierta ejecuta CAMBIAR 1 (con el índice de reglas vía `visualToRules`); soltar sobre la zona, o sobre la viuda cerrada, ejecuta CAMBIAR 5. Fuera de turno no ejecuta nada. Vista previa y rótulo mientras flota. Verificación: una ronda contra CPU solo con arrastre, incluidos rechazos fuera de turno; las animaciones y sonidos de `swap1`/`swap5` siguen igual.
3. **VS CPU: quitar botones.** Retirar el dibujo y la detección de los cuatro botones y la franja `BUTTON_*`; añadir los botones HTML `PASO` y `LLAMO` bajo el canvas que llaman a `engine.press`. Verificación: se puede jugar una partida completa; el teclado sigue funcionando; ambos botones se deshabilitan cuando la acción no está disponible.
4. **En línea: cambiar con arrastre.** Lo mismo en `online/table-view.ts` y `online-table.tsx`, respetando mesa pausada, desconectado y eliminado (sin acción). Verificación con 2 pestañas: cambiar 1 y cambiar 5 con orden de mano alterado envía el `handIndex` correcto y el otro cliente ve la animación.
5. **Chat: protocolo y estado.** `ChatMessage`, `EVENT_CHAT`, `isChatMessage`, envío/recepción en `client.ts` y últimos 50 en `use-room-session.ts`; `parseChatCommand`. Verificación: dos pestañas intercambian mensajes; un mensaje inválido o de más de 140 caracteres se descarta; recargar no devuelve mensajes antiguos.
6. **Chat: interfaz y comandos.** `chat.tsx` con lista, campo «Escribir un mensaje» y chips `PASO`/`LLAMO`; comandos «paso»/«llamo» envían la `OnlineAction`; líneas de sistema desde los `GameEvent`; motivo de rechazo solo para quien escribió. Las teclas del juego se ignoran con el foco en el campo. Verificación: escribir «paso» en tu turno pasa; en otro turno muestra el motivo; escribir «paso a paso» es un mensaje normal; escribir «llamo» con el foco en el campo no dispara `L` dos veces.
7. **En línea: quitar botones y maquetar.** Retirar los botones del canvas en línea y colocar el panel del chat: en escritorio junto o bajo el monitor, en móvil como barra plegada («Escribir un mensaje» + chips) que se expande al tocar el campo y abre el teclado del dispositivo sin tapar la mesa ni romper el escalado 400×720. Verificación a 375 px y a 1280 px: sin scroll horizontal; el canvas y el chat son usables.
8. **Documentación.** Actualizar `CLAUDE.md` (sección «Juegos»: sin botones, destinos del arrastre, chat y comandos). Verificación: lectura del archivo.

---

## Criterios de aceptación

- [ ] `npm run lint` y `npm run build` terminan sin errores.
- [ ] Las reglas no cambian: el resultado de cada gesto o comando es la misma acción de reglas que producía el botón.
- [ ] El canvas de Viuda (VS CPU y en línea) ya no dibuja ni responde a los botones CAMBIAR 5, CAMBIAR 1, PASO ni LLAMO.
- [ ] Soltar una carta propia sobre una carta de la viuda abierta cambia exactamente esas dos cartas, también con la mano reordenada.
- [ ] Arrastrar el marco gris de la mano sobre el marco de la viuda (o al revés) cambia las 5, también con la viuda cerrada.
- [ ] Soltar una carta suelta en el hueco de la viuda, o sobre la viuda cerrada, no cambia nada.
- [ ] Arrastrar una carta de la viuda abierta sobre una carta propia cambia exactamente esas dos, también con la mano reordenada.
- [ ] Los marcos y bolitas solo se ven en el turno propio.
- [ ] Mientras se arrastra sobre la viuda se ve resaltado el destino y un rótulo con lo que va a pasar («CAMBIAR … POR …» o «CAMBIAR LAS 5»); al salir del destino desaparecen.
- [ ] Soltar una carta propia fuera de la viuda reordena la mano como antes.
- [ ] Fuera de turno, en pausa, desconectado o eliminado, soltar sobre la viuda no ejecuta acción y la carta vuelve a su sitio con el motivo en el rótulo.
- [ ] Funciona igual con el ratón y con el dedo (emulación táctil a 375 px), sin scroll de la página durante el arrastre.
- [ ] En línea, escribir «paso» o «llamo» en el chat (en cualquier combinación de mayúsculas, con tildes o espacios sobrantes) ejecuta PASO o LLAMO, y los chips `PASO`/`LLAMO` hacen lo mismo.
- [ ] «paso a paso» y otros textos que no son exactamente un comando se envían como mensaje normal; el texto de un comando no aparece como mensaje.
- [ ] Un comando fuera de turno o no permitido muestra el motivo solo a quien lo escribió y no cambia la mesa.
- [ ] Los demás jugadores ven una línea de sistema («X pasó», «X llamó») por cada PASO y LLAMO, una sola vez, también tras reanudar o con eventos encolados; un `rejoin` no repite líneas atrasadas.
- [ ] Los mensajes de texto llegan a todos los jugadores conectados de la sala, con el alias del emisor; se descartan los vacíos, los de más de 140 caracteres y los mal formados; se conservan los últimos 50.
- [ ] Un jugador que entra o recarga no ve mensajes anteriores.
- [ ] Con el foco en el campo del chat, ninguna tecla de juego (`P`, `L`, `C`, `Espacio`, `Enter`) actúa sobre la partida; `Enter` envía el mensaje.
- [ ] Con el foco fuera del chat, todas las teclas de juego actuales siguen funcionando en escritorio.
- [ ] En móvil, tocar «Escribir un mensaje» abre el teclado del dispositivo y la mesa sigue visible y sin scroll horizontal; no se muestran pistas de teclas del juego.
- [ ] En VS CPU hay dos botones `PASO` y `LLAMO` bajo el canvas, deshabilitados cuando no es tu turno o la acción no está disponible, y no hay chat.
- [ ] Las animaciones (SPEC 10) y los sonidos (SPEC 12) de `swap1`, `swap5`, `pass` y `call` se reproducen igual que antes.
- [ ] Asteroids y Tetris no cambian.
- [ ] Sin errores nuevos en consola ni warnings de hidratación; los listeners y el canal del chat se liberan al desmontar.

---

## Decisiones tomadas y descartadas

- **Sí:** soltar una carta sobre una carta de la viuda = CAMBIAR 1, también en sentido inverso. **No:** que soltar en la zona de la viuda cambie las 5 (era la decisión inicial; se descartó, ver abajo), ni que arrastrar de un extremo a otro de la mano cambie las 5: choca con el reordenado del SPEC 10.
- **Sí:** las 5 se cambian agarrando un marco gris con bolita, de la mano o de la viuda (decisión del usuario tras probarlo). Agarrar el marco es un gesto deliberado; el marco solo se ve en el turno propio.
- **Sí:** la vista previa con rótulo antes de soltar (petición del usuario: «que me diga por cuál la va a cambiar»), y también para CAMBIAR 5, porque soltar sobre la zona es más fácil de hacer sin querer que un botón.
- **Sí:** chat en línea por broadcast efímero del canal público, sin tabla ni historial (decisión del usuario). **No:** tabla `chat_messages` en Supabase: exige migración, RLS y limpieza, y el valor es bajo para una mesa de partida.
- **Sí:** el comando «paso»/«llamo» reutiliza la `OnlineAction` existente, así el anfitrión valida con las mismas reglas que un botón y no hay ruta nueva. **No:** que el anfitrión interprete el texto del chat.
- **Sí:** el texto de un comando no se publica como mensaje; la acción se anuncia con una línea de sistema desde los `GameEvent`. Evita mensajes duplicados («paso» + «X pasó») y no permite fingir un «paso» ajeno.
- **Sí:** solo coincide el texto completo («paso a paso» es un mensaje), para no ejecutar acciones por una conversación normal.
- **Sí:** el chat es HTML y no canvas, para el teclado nativo del móvil y la accesibilidad del campo de texto (decisión del usuario).
- **Sí:** chips `PASO`/`LLAMO` en el chat como atajo para quien no quiere escribir (decisión del usuario).
- **Sí:** VS CPU sin chat y con dos botones pequeños `PASO`/`LLAMO` (decisión del usuario). **No:** chat en VS CPU ni mensajes de sistema de las CPU.
- **Sí:** el teclado se conserva entero como atajo de escritorio y se ignora con el foco en el campo del chat (decisión del usuario: «mantenerlos, pero en el celular no debería importar»). **No:** pistas de teclas en móvil.
- **Sí:** destino del arrastre calculado con la geometría de la viuda de cada modo (`WIDOW_*`), para funcionar en apaisado y vertical.

---

## Riesgos identificados

| Riesgo                                                                                | Mitigación                                                                                                                                                      |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cambiar las 5 sin querer | Una carta suelta nunca las cambia: hay que agarrar el marco; vista previa con rótulo y resalte antes de soltar; soltar fuera de un destino cancela |
| Escribir en el chat dispara teclas del juego (`P` de «paso», `L` de «llamo»)          | El manejador de teclado ignora los eventos cuyo objetivo es un `input`/`textarea`; criterio de aceptación explícito                                             |
| En móvil el teclado del dispositivo tapa la mesa o desplaza el layout                 | Panel plegado que se expande al tocar el campo; revisar con teclado virtual a 375 px; el canvas no cambia de tamaño al abrir el teclado                         |
| Sin autenticación, un jugador puede enviar un chat con el `playerId` de otro          | Riesgo ya asumido en SPEC 08 (canales adivinables, sin auth): el chat es informativo, los comandos no viajan por el chat y las acciones las valida el anfitrión |
| Spam del chat satura la sala                                                          | Límite de 140 caracteres, un mensaje por segundo por emisor (cliente) y descarte de los 50 anteriores; sin moderación (fuera de alcance)                        |
| Dos suscripciones al canal público por StrictMode duplican mensajes                   | Reutilizar el canal existente de la sesión (`use-room-session`), deduplicar por `id` y liberar con `removeChannel` como el resto de la sesión                   |
| La vista previa y el arrastre de reordenar se confunden al entrar y salir de la viuda | `DragTarget` único calculado en cada movimiento; al salir de la viuda el rótulo desaparece y se vuelve al reordenado sin soltar                                 |
| Quitar `BUTTON_*` deja la franja inferior vacía o descentra la mesa en vertical       | Revisar los dos lienzos (800×600 y 400×720) y ajustar `HAND_Y`/proporciones solo lo necesario                                                                   |

---

## Cambios posteriores a la aprobación

Surgieron al probar el spec; el código ya los refleja.

- **Botones de VS CPU:** PASO y LLAMO se ocultan fuera de la fase de turnos (`ViudaSnapshot.inTurn`), porque el canvas dibuja CONTINUAR en la misma franja y se solapaban.
- **Cambiar las 5:** el gesto «soltar en la zona de la viuda» hacía fácil cambiarlas por error. Se probó un botón CAMBIAR VIUDA, pero quedaba mal colocado, y se sustituyó por marcos grises con bolita (ver Alcance). Funciona en los dos sentidos y también se puede cambiar 1 desde la viuda hacia la mano.
- **Selección por clic:** se eliminó junto con las teclas `X`, `1`–`5` y `Q W E R T`; ya no hacía falta con el arrastre.
- **Chat:** los mensajes propios se alinean a la derecha y los ajenos a la izquierda.

---

## Qué **no** está en este spec

- Historial persistente del chat, tabla en Supabase, moderación, emotes y reacciones.
- Chat o mensajes de sistema de las CPU en VS CPU.
- Más comandos que «paso» y «llamo».
- Sonido o contador de mensajes sin leer.
- Cambiar las 5 con un gesto de extremo a extremo.
- Autenticación del emisor del chat.
- Cambios de reglas, IA, puntuación, protocolo de acciones, `rooms` o Supabase.
- Tests automatizados.

Cada uno de estos puntos, si se aborda, va en su propio spec.
