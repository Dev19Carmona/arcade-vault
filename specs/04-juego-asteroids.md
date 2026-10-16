# SPEC 04 — Primer juego real: Asteroids

> **Estado:** Aprobado
> **Depende de:** SPEC 01
> **Fecha:** 2026-10-15
> **Objetivo:** Portar el clon de Asteroids de `references/started-games/02-asteroids/` a módulos TypeScript con un `<canvas>` y ejecutarlo como el juego `rocas` en `/juego/rocas/jugar`, integrado con el HUD, la pausa y el guardado de puntuación del reproductor existente.

---

## Por qué existe este spec

Hasta ahora `GamePlayer` es una simulación: el puntaje sube solo con un `setInterval` y el área de juego es decoración CSS. Asteroids ya existe como juego completo en canvas puro (`game.js`, script global de ~510 líneas con `document.getElementById`, listeners en `window` y un bucle propio), pero no se puede insertar tal cual en React sin fugas de listeners ni estado global. Este spec lo porta y lo conecta a la plataforma, y de paso fija el patrón (motor sin DOM + componente canvas + callbacks) que usarán los juegos siguientes.

El catálogo ya tiene `rocas` ("Pulveriza asteroides en gravedad cero", categoría SHOOTER, menciona OVNIs). Es el mismo juego, así que Asteroids **reemplaza** esa entrada en lugar de duplicarla.

---

## Alcance

**Dentro:**

- Motor del juego en `lib/games/asteroids/` portado de `game.js`, en TypeScript estricto, sin acceso a `document`/`window` en el módulo del motor.
- Componente cliente `components/games/asteroids-canvas.tsx` que monta el `<canvas>` 800×600, registra los listeners de teclado y el `requestAnimationFrame`, y los limpia al desmontar.
- Integración en `GamePlayer`: para `gameId === "rocas"` se renderiza el canvas real dentro del marco `.crt-screen`; el resto de juegos conserva la simulación actual.
- HUD de la plataforma alimentado por el motor: puntuación, vidas y nivel reales (hoy vidas está fija en 3 y el nivel se deriva del puntaje).
- `PAUSA`/`REANUDAR` detienen y reanudan el motor; `FIN` termina la partida; al perder la última vida se abre el modal "FIN DEL JUEGO" existente con la puntuación final.
- Guardado de puntuación con `saveScore` del `SessionProvider` (`av_scores`, localStorage), sin cambios.
- "JUGAR DE NUEVO" reinicia el motor.
- Mantener las mecánicas del original: 3 vidas con invencibilidad parpadeante, asteroides que se parten (3→2→1), partículas, niveles progresivos (`3 + level` asteroides) y power-up de disparo triple (`3x`).
- Reescalado responsivo del canvas dentro de `.crt-screen` (relación 4:3) manteniendo la resolución lógica 800×600.
- Actualizar `lib/games.ts` solo si hace falta ajustar la descripción de `rocas` (ver decisiones).

**Fuera de alcance (para specs futuros):**

- Controles táctiles / gamepad virtual para móvil; solo teclado (`←` `→` `↑` `Espacio`).
- Reestilizar el canvas a la paleta neón; se mantiene el vectorial blanco sobre negro del original.
- Sonido y música.
- Guardar puntuaciones en Supabase (tablas, RLS, auth real); `av_scores` sigue siendo la única persistencia.
- OVNIs (la descripción actual de `rocas` los menciona, el original no los implementa).
- Portar los demás juegos del catálogo; siguen simulados.
- Tests automatizados (el proyecto no tiene framework de tests).
- Ajustes de dificultad, ranking por juego o cambios en `/salon`.

---

## Modelo de datos

Este spec no introduce persistencia nueva ni tablas. Define la interfaz entre el motor y React:

```ts
// lib/games/asteroids/types.ts
export type AsteroidsPhase = "playing" | "dead" | "gameover";

export interface AsteroidsSnapshot {
  score: number;
  lives: number;
  level: number;
  phase: AsteroidsPhase;
  tripleShotLeft: number; // segundos restantes del power-up, 0 si no hay
}

export interface AsteroidsEngineOptions {
  onChange: (snapshot: AsteroidsSnapshot) => void; // solo cuando cambia algún campo
  onGameOver: (finalScore: number) => void; // una única vez por partida
}

export interface AsteroidsEngine {
  update(dt: number): void; // dt en segundos, acotado a 0.05
  draw(ctx: CanvasRenderingContext2D): void;
  setKeys(held: ReadonlySet<string>): void; // códigos de `KeyboardEvent.code`
  pressShoot(): void; // pulsación de un solo frame (Space)
  reset(): void; // nueva partida
  getSnapshot(): AsteroidsSnapshot;
}

export function createAsteroidsEngine(
  options: AsteroidsEngineOptions,
): AsteroidsEngine;
```

Estructura de archivos:

```
lib/games/asteroids/
  types.ts       // interfaces anteriores
  constants.ts   // W, H, RADII, SPEEDS, POINTS, POWERUP_*, TRIPLE_SPREAD
  entities.ts    // Bullet, Asteroid, PowerUp, Ship, Particle (update/draw con ctx por parámetro)
  engine.ts      // createAsteroidsEngine: estado, colisiones, niveles
  utils.ts       // wrap, dist, rand, randInt
components/games/asteroids-canvas.tsx   // "use client"
```

Convenciones:

- Las constantes de `game.js` conservan sus valores (`RADII = [0,16,30,50]`, `SPEEDS = [0,85,55,32]`, `POINTS = [0,100,50,20]`, etc.). Los `const` sueltos de `game.js` pasan a `constants.ts`.
- Las entidades reciben el `ctx` por parámetro en `draw(ctx)`; no hay `canvas` ni `ctx` globales.
- El estado de teclas vive en el componente (no en el motor); el motor lo recibe vía `setKeys`/`pressShoot`.
- `README.md` del juego original declara 20/50/100 pts por tamaño grande/mediano/pequeño; el código usa `POINTS = [0, 100, 50, 20]` indexado por tamaño (1=pequeño 100, 2=mediano 50, 3=grande 20). Se mantiene el código.

---

## Plan de implementación

Antes de escribir código, leer en `node_modules/next/dist/docs/` la guía de Client Components y de `use client` (Next 16 tiene cambios incompatibles). La interfaz del reproductor se ajusta con la skill `/frontend-design`.

1. **Constantes y utilidades.** Crear `lib/games/asteroids/constants.ts`, `utils.ts` y `types.ts` con el contenido del modelo de datos. Verificación: `npm run lint` y `npm run build` pasan.
2. **Entidades.** Crear `entities.ts` con `Bullet`, `Asteroid`, `PowerUp`, `Ship` y `Particle`, portando `update(dt)` y `draw(ctx)` de `game.js` sin referenciar `keys` global (la nave recibe las teclas en `update(dt, keys)`). Verificación: `npm run build` pasa y no hay `any`.
3. **Motor.** Crear `engine.ts` con `createAsteroidsEngine`: `initGame`, `nextLevel`, `spawnAsteroids`, colisiones bala/asteroide y nave/asteroide (`radius * 0.82`), `killShip`, transición `playing → dead → playing | gameover`, y emisión de `onChange`/`onGameOver`. El overlay "GAME OVER" y el HUD dibujados en canvas **no** se portan. Verificación: el módulo no importa `window`/`document`; `npm run build` pasa.
4. **Componente canvas.** Crear `components/games/asteroids-canvas.tsx`: canvas 800×600, bucle `requestAnimationFrame` con `dt` acotado a 50 ms, listeners `keydown`/`keyup` en `window` que llaman `preventDefault()` para `Space` y flechas, y limpieza completa en el `return` del efecto. Props: `paused`, `runId` (cambia para reiniciar), `onChange`, `onGameOver`. Verificación: montar y desmontar la pantalla no deja listeners ni rAF activos (sin dobles disparos al volver a entrar, también en StrictMode).
5. **Integrar en `GamePlayer`.** Si `gameId === "rocas"`: renderizar `AsteroidsCanvas` en lugar de `.game-arena`; reemplazar `score`, vidas y nivel del HUD por los del snapshot; no arrancar el `setInterval` simulado; `FIN` y `onGameOver` abren el modal con el puntaje real; `restart` incrementa `runId`. Para los demás juegos el comportamiento no cambia. Verificación: `/juego/caida/jugar` sigue simulado y `/juego/rocas/jugar` muestra el juego real.
6. **Pausa y foco.** Con `paused` el motor no avanza y se muestra el overlay "EN PAUSA" existente; al volver la pestaña a primer plano el `dt` no produce saltos (se reinicia `lastTime` al reanudar). Verificación: pausar 10 s y reanudar no mueve asteroides ni gasta vidas.
7. **Escalado.** Hacer que el canvas ocupe el 100 % de `.crt-screen` con `object-fit: contain`/CSS, sin alterar las coordenadas lógicas 800×600. Verificación: a 375 px de ancho el juego se ve completo y sin scroll horizontal.
8. **Catálogo y documentación.** Ajustar la descripción `long` de `rocas` para no prometer OVNIs; actualizar `CLAUDE.md` (estructura `lib/games/<juego>/` y `components/games/`). Verificación: lectura de `/juego/rocas`.

---

## Criterios de aceptación

- [ ] `npm run lint` y `npm run build` terminan sin errores.
- [ ] `/juego/rocas/jugar` muestra un canvas con la nave en el centro, 4 asteroides grandes y fondo negro; `/juego/caida/jugar` conserva la simulación actual.
- [ ] `←` y `→` rotan la nave, `↑` propulsa con inercia y `Espacio` dispara con 0,2 s de cooldown.
- [ ] Las flechas y `Espacio` no hacen scroll de la página mientras se juega.
- [ ] Un asteroide grande (tamaño 3) se parte en 2 medianos, un mediano en 2 pequeños y un pequeño desaparece; las bases suman 20, 50 y 100 puntos respectivamente.
- [ ] La nave, balas, asteroides y power-ups atraviesan el borde y reaparecen por el opuesto.
- [ ] El HUD de la plataforma muestra la puntuación, las vidas (3 al inicio) y el nivel reales, y se actualizan al jugar.
- [ ] Al chocar, la nave pierde una vida, reaparece tras 2 s en el centro y parpadea durante 3 s de invencibilidad.
- [ ] Al agotar las vidas se abre el modal "FIN DEL JUEGO" con la puntuación real; no se dibuja ningún overlay "GAME OVER" en el canvas.
- [ ] "GUARDAR PUNTUACIÓN" guarda en `av_scores` con `game: "rocas"` y la puntuación del juego; aparece en `/juego/rocas` y `/salon`.
- [ ] "FIN" abre el modal inmediatamente con el puntaje actual.
- [ ] "PAUSA" congela el juego y muestra "EN PAUSA"; "REANUDAR" continúa sin saltos ni pérdida de vidas.
- [ ] "JUGAR DE NUEVO" empieza una partida limpia (puntuación 0, 3 vidas, nivel 1).
- [ ] Al destruir todos los asteroides se pasa al nivel siguiente con `3 + nivel` asteroides y se reinicia la nave.
- [ ] El power-up `3x` aparece, se recoge y dispara 3 balas durante 5 s.
- [ ] Salir de `/juego/rocas/jugar` y volver no duplica disparos ni velocidad del bucle (sin listeners ni rAF residuales).
- [ ] A 375 px de ancho no hay scroll horizontal y el canvas se ve completo.
- [ ] Sin warnings de hidratación ni errores nuevos en la consola.

---

## Decisiones tomadas y descartadas

- **Sí:** Asteroids reemplaza `rocas`. Es el mismo juego; evita un noveno título duplicado y mantiene vivos los enlaces del home, salón y detalle.
- **No:** nueva entrada `asteroids` en el catálogo. Dejaba `rocas` como duplicado simulado.
- **Sí:** portar a módulos TypeScript con un motor sin DOM. Permite pausa, reinicio y lectura de estado desde React, limpieza correcta al desmontar y tipado estricto.
- **No:** `<iframe>` a `public/`. No da acceso al puntaje ni a la pausa sin `postMessage`, y no se integra con el HUD ni el modal.
- **No:** cargar `game.js` con `next/script`. Estado global, doble montaje en StrictMode y sin limpieza.
- **Sí:** HUD de React como única fuente visual de puntuación/vidas/nivel y modal de la plataforma para el fin de partida. Evita duplicar interfaz y reutiliza `saveScore`.
- **No:** conservar el HUD y el overlay "GAME OVER" dibujados en el canvas.
- **Sí:** `av_scores` en localStorage. Las tablas de Supabase aún no existen (SPEC 03 dejó el esquema vacío) y pertenecen a la spec de puntuaciones.
- **No:** crear tabla `scores` y RLS aquí; arrastraría auth real y más de tres áreas del sistema.
- **Sí:** estilo vectorial blanco original dentro del marco CRT. El marco ya aporta el look neón y se conserva la identidad del clásico.
- **No:** reestilizar a la paleta cyan/magenta/yellow en este spec.
- **Sí:** sin audio. El original no tiene; añadirlo implica WebAudio, mute y autoplay.
- **Sí:** solo teclado. Los controles táctiles se abordan con el gamepad virtual en un spec propio.
- **Sí:** mantener `POINTS` del código (100/50/20 por tamaño pequeño/mediano/grande) sobre la tabla del README del original, que está invertida respecto al código.
- **Sí:** el patrón `lib/games/<juego>/` + `components/games/<juego>-canvas.tsx` queda como convención para los siguientes juegos.

---

## Riesgos identificados

| Riesgo                                                                      | Mitigación                                                                                                                                         |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Doble montaje de efectos en React StrictMode duplica listeners o bucles     | Limpieza completa en el `return` del efecto; verificar en `npm run dev` que un disparo crea una sola bala.                                         |
| `onChange` en cada frame provoca re-renders de React a 60 Hz                | El motor emite solo cuando cambia algún campo del snapshot; el HUD no depende del frame.                                                           |
| Salto de `dt` al volver a la pestaña o al reanudar tras pausa               | `dt` acotado a 50 ms y `lastTime` reiniciado al reanudar.                                                                                          |
| Las flechas y `Espacio` desplazan la página o activan botones enfocados     | `preventDefault()` sobre esas teclas solo mientras el juego está activo y sin modal abierto.                                                       |
| Generación aleatoria con `Math.random` en render rompe la hidratación       | El motor se crea y arranca solo en un efecto del cliente; nada aleatorio durante el render.                                                        |
| Canvas borroso o desproporcionado al reescalar en pantallas HiDPI o móviles | Resolución lógica fija 800×600 y escalado por CSS dentro del contenedor 4:3; revisar en 375 px.                                                    |
| Teclado inalcanzable en móvil: el juego es injugable sin controles táctiles | Se acepta como limitación de este spec; mostrar aviso "REQUIERE TECLADO" en pantallas táctiles queda como mejora a evaluar en el spec del gamepad. |
| Next 16 cambia APIs respecto a lo conocido                                  | Leer `node_modules/next/dist/docs/` antes de los pasos 4–5; `npm run build` valida los tipos.                                                      |

---

## Qué **no** está en este spec

- Controles táctiles ni gamepad virtual.
- Reestilizado neón del canvas.
- Audio.
- Persistencia de puntuaciones en Supabase ni autenticación real.
- OVNIs u otras mecánicas nuevas.
- Portar el resto de juegos del catálogo.
- Tests automatizados.

Cada uno de estos puntos, si se aborda, va en su propio spec.
