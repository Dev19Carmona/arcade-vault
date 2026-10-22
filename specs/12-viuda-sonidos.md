# SPEC 12 — Viuda: sonidos de cartas y de ronda

> **Estado:** Aprobado
> **Depende de:** SPEC 07 (Viuda VS CPU), SPEC 08 (Viuda en línea), SPEC 10 (eventos `GameEvent` y capa `fx`), SPEC 11 (reglas vigentes)
> **Fecha:** 2026-10-22
> **Objetivo:** Añadir efectos de sonido a Viuda (VS CPU y en línea) para la carta alta inicial, el reparto, CAMBIAR 1, CAMBIAR 5, PASO, LLAMO, el fin de ronda y el reordenado de la mano, con archivos CC0 y un botón para silenciarlos.

---

## Por qué existe este spec

El SPEC 10 dejó el sonido fuera de alcance («solo visual»). Las animaciones ya existen y ya hay un evento por cada acción (`GameEvent`: `deal`, `pass`, `call`, `swap1`, `swap5`, `showdown`), así que el sonido se engancha a los mismos puntos sin tocar reglas ni protocolo. Es el primer sonido de la plataforma: no hay audio en `public/` ni un módulo de audio compartido (el único antecedente es `new Audio()` en el juego de referencia de Arkanoid, que no se portó).

Las decisiones de qué suena y cómo se mezcla se revisan con `/frontend-design` y `/ui-ux-pro-max` si se añade el botón al HUD, como exige el `CLAUDE.md`.

---

## Alcance

**Dentro:**

- Módulo de audio de TypeScript sin dependencias de React en `lib/games/viuda/sfx/` que carga y reproduce los sonidos con Web Audio (`AudioContext` + `decodeAudioData`).
- Archivos de sonido CC0 en `public/sounds/viuda/`, elegidos del pack «Casino Audio» de Kenney (OGG, CC0) y recortados/normalizados si hace falta. Un archivo por situación (ver tabla).
- Sonido para:
  - **Carta alta inicial** (fase `draw`): un sonido de voltear carta por cada carta revelada en el sorteo.
  - **Reparto** (`deal`): ráfaga de cartas repartidas, sincronizada con el reparto escalonado de `fx`.
  - **CAMBIAR 1** (`swap1`): una carta que se desliza.
  - **CAMBIAR 5** (`swap5`): barajado rápido.
  - **PASO** (`pass`): toque suave.
  - **LLAMO** (`call`): sonido más marcado que PASO (ficha o golpe en la mesa).
  - **Fin de ronda** (`showdown`): dos variantes, una si pierde la vida el jugador local y otra si la pierde un rival.
  - **Reordenar la mano** (`sort`): un sonido breve de carta que se asienta cuando el jugador suelta una carta arrastrada en una posición distinta de la que tenía. Solo suena para el jugador que reordena.
- Suenan también las acciones de las CPU y de otros humanos en línea, porque salen de los mismos eventos.
- **Botón de sonido** (activar/silenciar) en la plataforma para Viuda, con la preferencia guardada en `localStorage` (`av_sound`), activo por defecto.
- Desbloqueo del `AudioContext` en el primer gesto del usuario (política de autoplay del navegador).
- La pausa de `GamePlayer` no reproduce sonidos nuevos (los eventos no ocurren en pausa); una animación que salta con clic o tecla no repite su sonido.
- Documentar en `CLAUDE.md` (sección «Juegos») y un archivo `public/sounds/viuda/LICENSE.md` con el origen y la licencia.

**Fuera de alcance (para otros specs):**

- Sonido para Asteroids, Tetris ni el resto de la plataforma.
- Música de fondo.
- Sonido de victoria o derrota de la partida completa, de vidas perdidas aparte del fin de ronda, de turno propio, de selección de carta, de botones, de cada carta vecina que se aparta durante el arrastre ni del lobby y la sala de espera.
- Control de volumen (solo activar/silenciar).
- Vibración.
- Sonido espacial (estéreo por asiento).
- Cambios en reglas, protocolo, canales, `rooms` o Supabase.
- Tests automatizados (el proyecto no tiene framework de tests).

---

## Modelo de datos

### Identificadores de sonido

```ts
// lib/games/viuda/sfx/sounds.ts
export type SfxId =
  | "flip" // carta alta inicial (sorteo)
  | "deal" // reparto de la ronda
  | "swap1" // CAMBIAR 1
  | "swap5" // CAMBIAR 5
  | "pass" // PASO
  | "call" // LLAMO
  | "roundLose" // fin de ronda: pierdo la vida
  | "roundWin" // fin de ronda: la pierde otro
  | "sort"; // soltar una carta en otra posición de mi mano

export const SFX_FILES: Record<SfxId, string> = {
  flip: "/sounds/viuda/flip.ogg",
  deal: "/sounds/viuda/deal.ogg",
  swap1: "/sounds/viuda/swap1.ogg",
  swap5: "/sounds/viuda/swap5.ogg",
  pass: "/sounds/viuda/pass.ogg",
  call: "/sounds/viuda/call.ogg",
  roundLose: "/sounds/viuda/round-lose.ogg",
  roundWin: "/sounds/viuda/round-win.ogg",
  sort: "/sounds/viuda/sort.ogg",
};
```

Los nombres de archivo son los destinos finales; el origen concreto de cada uno dentro del pack se fija al elegirlos y se anota en `LICENSE.md`.

### Reproductor

```ts
// lib/games/viuda/sfx/player.ts
export interface Sfx {
  play(id: SfxId, opts?: { delayMs?: number; rate?: number }): void;
  setEnabled(on: boolean): void;
  dispose(): void;
}
export function createSfx(): Sfx;
```

- Sin `window` en el módulo salvo dentro de `createSfx()`; si `AudioContext` no existe, devuelve un `Sfx` vacío (no rompe el juego).
- `play` ignora la llamada si el sonido está silenciado o el contexto sigue suspendido; `delayMs` permite alinear el sonido con el escalonado de la animación.
- Los buffers se cargan una vez al montar el canvas y se reutilizan; `dispose()` cierra el contexto al desmontar.

### Preferencia

```ts
// localStorage
"av_sound": "on" | "off"   // ausente = "on"
```

- Lectura y escritura dentro de `try/catch` (modo privado o almacenamiento bloqueado: la preferencia vive solo en memoria).
- Se comparte entre pestañas del mismo navegador, igual que el alias de `av_viuda_alias`.

### Mapa evento → sonido

| Situación          | Origen del disparo                                                                                        | Sonido                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Carta alta inicial | Cada carta revelada en la fase `draw`                                                                     | `flip` (uno por carta, escalonado)                                 |
| Reparto            | `GameEvent` `deal`                                                                                        | `deal`                                                             |
| CAMBIAR 1          | `GameEvent` `swap1`                                                                                       | `swap1`                                                            |
| CAMBIAR 5          | `GameEvent` `swap5`                                                                                       | `swap5`                                                            |
| PASO               | `GameEvent` `pass`                                                                                        | `pass`                                                             |
| LLAMO              | `GameEvent` `call`                                                                                        | `call`                                                             |
| Fin de ronda       | `GameEvent` `showdown`, al mostrarse la vida perdida (`livesShown`)                                       | `roundLose` si es el jugador local, si no `roundWin`               |
| Reordenar la mano  | `DragRelease` `drop` con `from !== to` (`pointerUp` en `engine.ts` y `onPointerUp` en `online-table.tsx`) | `sort` (inmediato; un clic o un soltar en el mismo hueco no suena) |

- El sonido se dispara **cuando la animación correspondiente arranca** (en `scenes.ts`/`table-fx.ts` y `engine.ts`), no cuando llega el estado, para que coincida con lo que se ve. Con la cola acelerada ×2 el sonido se dispara igual una sola vez por evento.
- `sort` es local: no pasa por `GameEvent`, `fx` ni la red, así que se dispara directamente al soltar y no depende de la cola de animaciones.
- En línea, cada cliente reproduce por su cuenta con la misma deduplicación por `n` que ya usan las animaciones: la primera mesa que ve un cliente (y un `rejoin`) no suena.
- Nombre de `localStorage` y tipos de sonido son los únicos datos nuevos; no hay cambios en `GameEvent`, `PublicTable` ni en Supabase.

### Estructura de archivos

```
public/sounds/viuda/*.ogg                      9 archivos CC0
public/sounds/viuda/LICENSE.md                 origen (Kenney, Casino Audio) y licencia CC0
lib/games/viuda/sfx/sounds.ts                  SfxId y SFX_FILES
lib/games/viuda/sfx/player.ts                  createSfx (Web Audio)
lib/games/viuda/engine.ts                      dispara sonidos en VS CPU junto a las escenas
lib/games/viuda/online/table-fx.ts             dispara sonidos en línea junto a las escenas
components/games/viuda-canvas.tsx              crea y libera el Sfx; props enabled
components/games/viuda-online/online-table.tsx crea y libera el Sfx; props enabled
components/games/viuda-game.tsx                estado del botón de sonido y preferencia
app/globals.css                                estilo del botón de sonido
CLAUDE.md                                      sección «Juegos» actualizada
```

---

## Plan de implementación

Antes de escribir código: leer en `node_modules/next/dist/docs/` lo que toque de Client Components y archivos estáticos de `public/`.

1. **Archivos de sonido.** Descargar el pack «Casino Audio» de Kenney (CC0), elegir ocho sonidos coherentes con la tabla, recortarlos/normalizarlos y copiarlos a `public/sounds/viuda/` con los nombres de `SFX_FILES`, más `LICENSE.md`. Verificación: `npm run dev` y abrir cada URL `/sounds/viuda/<archivo>.ogg` en el navegador; cada uno se reproduce y ninguno pasa de ~1 s.
2. **Reproductor.** Crear `sfx/sounds.ts` y `sfx/player.ts` (carga con `fetch` + `decodeAudioData`, `play`, `setEnabled`, `dispose`, desbloqueo en el primer gesto). Sin conectar. Verificación: `npm run lint` y `npm run build`; el módulo no usa `window` fuera de `createSfx()`.
3. **VS CPU: sonidos de acción.** En `engine.ts`, disparar `swap1`, `swap5`, `pass`, `call` y `deal` al arrancar cada escena de `lastEvents`; `viuda-canvas.tsx` crea el `Sfx` al montar y lo libera al desmontar (compatible con StrictMode). Verificación: una ronda contra CPU suena en cada acción, también las de las CPU; saltar una animación con clic no repite el sonido.
4. **VS CPU: carta alta y fin de ronda.** `flip` por cada carta revelada en el sorteo y `roundLose`/`roundWin` al mostrarse la vida perdida. Verificación: el sorteo inicial suena una vez por carta; perder la vida suena distinto que ganar.
5. **Botón de sonido.** Botón activar/silenciar en la plataforma de Viuda (`viuda-game.tsx`), con `av_sound` en `localStorage` y el estado pasado a los canvas por `enabled`. Verificación: silenciar corta los sonidos siguientes, recargar conserva la preferencia, con `localStorage` bloqueado el botón funciona en memoria.
6. **En línea.** Disparar los mismos sonidos desde `online/table-fx.ts` por `n` de evento y crear/liberar el `Sfx` en `online-table.tsx`. Verificación con 2 pestañas: lo que hace el otro jugador suena en tu pestaña; la primera mesa y un `rejoin` no suenan.
7. **Documentación.** Actualizar `CLAUDE.md` (sección «Juegos»: módulo `sfx/`, `av_sound`, ubicación de los archivos). Verificación: lectura del archivo.
8. **Sonido al reordenar la mano.** Añadir `sort` (`SfxId`, `SFX_FILES`, `sort.ogg` del pack, fila en `LICENSE.md`), dispararlo al soltar con `from !== to` en `engine.ts` y `online-table.tsx`, y actualizar `CLAUDE.md`. Verificación: arrastrar una carta a otra posición suena una vez; un clic o soltarla en su sitio no suena; silenciado no suena; en línea no suena en la otra pestaña.

---

## Criterios de aceptación

- [ ] `npm run lint` y `npm run build` terminan sin errores.
- [ ] Existen en `public/sounds/viuda/` los 9 archivos de `SFX_FILES` y un `LICENSE.md` que cita a Kenney (Casino Audio) y la licencia CC0.
- [ ] Ningún sonido dura más de 1,2 s.
- [ ] En el sorteo inicial suena `flip` una vez por cada carta revelada.
- [ ] Al repartir las cartas de cada ronda suena `deal` una vez.
- [ ] Al CAMBIAR 1 suena `swap1` y al CAMBIAR 5 suena `swap5`, tanto si lo hace el jugador local como una CPU.
- [ ] Al PASAR suena `pass` y al LLAMAR suena `call`, y los dos se distinguen entre sí.
- [ ] Al soltar una carta arrastrada en una posición distinta suena `sort` una vez, en VS CPU y en línea.
- [ ] Un clic sobre una carta, soltarla en su misma posición o arrastrar con el sonido silenciado no reproduce `sort`; en línea no suena en las demás pestañas.
- [ ] Al terminar la ronda suena `roundLose` si pierde la vida el jugador local y `roundWin` si la pierde otro jugador.
- [ ] Cada evento suena una sola vez, incluso con la cola de animaciones acelerada ×2 o al saltar una animación con clic, `Espacio` o `Enter`.
- [ ] La pausa de `GamePlayer` no produce sonidos y al reanudar no suenan eventos atrasados.
- [ ] En línea, lo que hace otro jugador suena en tu pestaña, y la primera mesa que ve un cliente y un `rejoin` no reproducen nada.
- [ ] El botón de sonido silencia y reactiva todos los sonidos de Viuda sin recargar.
- [ ] Recargar la página conserva la preferencia `av_sound`; con `localStorage` bloqueado el botón sigue funcionando en memoria.
- [ ] Sin gesto previo del usuario no hay errores en consola por autoplay; el primer clic o tecla en Viuda deja el audio listo.
- [ ] Si el navegador no tiene `AudioContext` o un archivo falla al cargar, la partida sigue jugable y no aparece un error sin capturar.
- [ ] Asteroids y Tetris no cambian ni reproducen sonidos.
- [ ] Al salir de la partida se libera el `AudioContext`; sin errores nuevos en consola ni warnings de hidratación.

---

## Decisiones tomadas y descartadas

- **Sí:** archivos CC0 del pack «Casino Audio» de Kenney (decisión del usuario, que pidió buscar sonidos de cartas). Suenan a cartas reales y no exigen atribución. **No:** sintetizar con Web Audio; suena artificial para cartas.
- **No:** mixto (archivos + síntesis). Añade dos caminos de código para un total de nueve sonidos.
- **Sí:** misma capa de sonido para VS CPU y en línea (decisión del usuario), colgada de los `GameEvent` existentes. **No:** deducir sonidos por diferencias de mesa; los eventos ya resuelven el duplicado y el orden.
- **Sí:** el sonido se dispara al arrancar la animación, no al llegar el estado, para que audio e imagen coincidan.
- **Sí:** sonido `sort` al soltar una carta reordenada (petición del usuario durante la implementación; se incorpora a este spec y no a uno nuevo). **No:** un tic por cada carta vecina que se aparta: sería ruido continuo durante el arrastre. **No:** sonar al recoger la carta ni en un clic: solo cuando el orden cambia.
- **Sí:** `fin de ronda` con dos variantes según pierda el jugador local u otro (decisión del usuario). **No:** sonido de fin de partida; queda para otro spec.
- **Sí:** botón activar/silenciar con preferencia en `localStorage` (`av_sound`), activo por defecto (decisión del usuario). **No:** deslizador de volumen; el jugador puede usar el volumen del navegador.
- **Sí:** Web Audio con buffers decodificados una vez. **No:** `new Audio()` por sonido (como en Arkanoid); la latencia y el solapamiento de varios sonidos son peores.
- **Sí:** formato OGG, el del pack original. Es compatible con los navegadores actuales de escritorio y Android; ver riesgo de Safari.
- **Sí:** la primera mesa vista y un `rejoin` no suenan, igual que no se animan (SPEC 10).

---

## Riesgos identificados

| Riesgo                                                                              | Mitigación                                                                                                                         |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Autoplay: el `AudioContext` queda suspendido hasta que hay un gesto                 | `resume()` en el primer `pointerdown` o `keydown` sobre Viuda; hasta entonces `play` no hace nada                                  |
| Safari antiguo no decodifica OGG                                                    | Verificar en la versión objetivo; si falla, convertir los 9 archivos a MP3 y cambiar `SFX_FILES` (el reproductor no cambia)        |
| En línea, la mesa de 9 jugadores genera ráfagas de eventos y los sonidos se solapan | Un sonido por evento y cola acelerada ×2 ya limitan la ráfaga; si sigue saturando, limitar a un `play` del mismo `SfxId` por 80 ms |
| La pestaña en segundo plano acumula eventos y suenan todos al volver                | Se reutiliza la regla de SPEC 10: al volver se descartan los eventos atrasados, y con ellos sus sonidos                            |
| StrictMode monta, desmonta y vuelve a montar y se crean dos `AudioContext`          | `Sfx` se crea en el efecto del canvas y se libera con `dispose()` en su limpieza, igual que los listeners                          |
| El pack elegido tiene una licencia distinta a la anunciada                          | Confirmar la licencia en la página de descarga antes de copiar los archivos y dejarla escrita en `LICENSE.md`                      |
| Sonidos demasiado fuertes o desparejos entre sí                                     | Normalizar los 9 archivos al mismo nivel y reproducir a una ganancia fija (p. ej. 0,6)                                             |

---

## Qué **no** está en este spec

- Sonido de Asteroids, Tetris o del resto de la plataforma.
- Música de fondo.
- Sonidos de victoria o derrota de la partida, de turno propio, de selección, de botones, de cada carta vecina durante el arrastre, del lobby o la sala de espera.
- Control de volumen.
- Vibración y sonido espacial por asiento.
- Cambios de reglas, protocolo, `rooms` o Supabase.
- Tests automatizados.

Cada uno de estos puntos, si se aborda, va en su propio spec.
