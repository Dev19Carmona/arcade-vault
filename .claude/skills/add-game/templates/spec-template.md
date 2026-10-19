# SPEC <NN> — Juego real: <TÍTULO>

> **Estado:** Borrador
> **Depende de:** SPEC 04 (patrón motor + canvas), SPEC 05 (tablas `games` y `scores`)
> **Fecha:** <YYYY-MM-DD>
> **Objetivo:** <Portar/crear> <TÍTULO> como el juego `<id>` en `/juego/<id>/jugar`, integrado con el HUD, la pausa y el modal de la plataforma, con su fila en la tabla `games` y las puntuaciones guardadas en `scores`.

---

## Por qué existe este spec

<Contexto: fuente en `references/started-games/<carpeta>/` (indicar qué trae: game.js, levels, assets) o diseño nuevo acordado con el usuario. Qué problema resuelve: el juego aún no está en el catálogo / es una simulación.>

---

## Alcance

**Dentro:**

- Motor en `lib/games/<id>/` (TypeScript estricto, sin `window`/`document`).
- Componente cliente `components/games/<id>-canvas.tsx` con `<canvas>` <W>×<H>, teclado<, ratón>, `requestAnimationFrame` y limpieza al desmontar.
- Entrada en `components/games/registry.ts`<; bootstrap del registro y migración de Asteroids si aún no existe>.
- HUD de la plataforma alimentado por el snapshot: <puntuación, vidas, nivel, stats>.
- Pausa, `FIN`, fin de partida → modal "FIN DEL JUEGO", "JUGAR DE NUEVO".
- Fila en `games` (migración seed) y guardado de puntuación en `scores` con el `save()` existente.
- Mecánicas: <lista de mecánicas a conservar o definir>.
- Reescalado responsivo del canvas dentro de `.crt-screen`.
- Documentar el juego en `CLAUDE.md` (sección "Juegos").

**Fuera de alcance:**

- Controles táctiles / gamepad virtual.
- Sonido y música<, salvo que se decida lo contrario>.
- Cambios de RLS, auth real o `user_id`.
- Paginación o realtime en leaderboards.
- Tests automatizados (el proyecto no tiene framework de tests).
- <Otras mecánicas del original que no se portan>.

---

## Modelo de datos

Fila nueva en `games` (sin tablas nuevas):

| id     | title      | short     | cat     | cover     | color     |
| ------ | ---------- | --------- | ------- | --------- | --------- |
| `<id>` | `<TÍTULO>` | `<short>` | `<CAT>` | `<cover>` | `<color>` |

Interfaz entre motor y React:

```ts
// lib/games/<id>/types.ts
export interface <Id>Snapshot { score: number; /* lives, level, ... */ }

export interface <Id>EngineOptions {
  onChange: (snapshot: <Id>Snapshot) => void; // solo cuando cambia algún campo
  onGameOver: (finalScore: number) => void; // una única vez por partida
}

export interface <Id>Engine {
  update(dt: number): void; // segundos, acotado a 0.05
  draw(ctx: CanvasRenderingContext2D): void;
  setKeys(held: ReadonlySet<string>): void;
  reset(): void;
  getSnapshot(): <Id>Snapshot;
}
```

Estructura de archivos:

```
lib/games/<id>/ types.ts constants.ts utils.ts entities.ts engine.ts
components/games/<id>-canvas.tsx
supabase/migrations/<timestamp>_seed_game_<id>.sql
```

---

## Plan de implementación

Antes de escribir código, leer en `node_modules/next/dist/docs/` la guía de Client Components. La interfaz y el cover se ajustan con `/frontend-design`.

1. **<Bootstrap del registro (si falta).>** `lib/games/types.ts`, `components/games/registry.ts`, `GamePlayer` genérico, Asteroids migrado. Verificación: `/juego/asteroids/jugar` idéntico; lint y build.
2. **Constantes, utilidades y tipos.** Verificación: lint y build.
3. **Entidades.** Verificación: build, sin `any`.
4. **Motor.** Verificación: el módulo no importa `window`/`document`; build.
5. **Componente canvas y registro.** Verificación: montar/desmontar sin listeners ni rAF residuales (también en StrictMode).
6. **Pausa y foco.** Verificación: pausar 10 s y reanudar no cambia el estado del juego.
7. **Escalado.** Verificación: a 375 px el juego se ve completo, sin scroll horizontal.
8. **Seed en Supabase.** Migración aplicada con `apply_migration`, tipos regenerados, `get_advisors`. Verificación: `select * from games where id = '<id>'`.
9. **Cover y catálogo.** Verificación: el juego aparece en `/games` y `/juego/<id>`.
10. **Documentación.** Actualizar `CLAUDE.md`. Verificación: lectura del archivo.

---

## Criterios de aceptación

- [ ] `npm run lint` y `npm run build` terminan sin errores.
- [ ] `/juego/<id>/jugar` muestra el canvas real; los demás juegos conservan su comportamiento.
- [ ] <Controles: teclas y su efecto.>
- [ ] Las teclas del juego no hacen scroll de la página ni activan botones con foco.
- [ ] <Mecánicas y puntuación verificables.>
- [ ] El HUD muestra puntuación<, vidas, nivel> reales y se actualiza al jugar.
- [ ] Al terminar la partida se abre el modal "FIN DEL JUEGO" con la puntuación real; no se dibuja ningún overlay de fin en el canvas.
- [ ] "FIN" abre el modal inmediatamente con el puntaje actual.
- [ ] "PAUSA" congela el juego y muestra "EN PAUSA"; "REANUDAR" continúa sin saltos.
- [ ] "JUGAR DE NUEVO" empieza una partida limpia.
- [ ] La fila `<id>` existe en `games` y el juego aparece en `/games` y `/juego/<id>`.
- [ ] "GUARDAR PUNTUACIÓN" inserta en `scores` con `game_id: "<id>"`; el nombre se recuerda para la próxima partida.
- [ ] El score aparece en el top 10 de `/juego/<id>` y en `/salon` al recargar.
- [ ] Sin scores, el leaderboard muestra "Sé el primero en entrar al salón de la fama".
- [ ] Salir de la pantalla y volver no duplica entradas ni velocidad del bucle.
- [ ] A 375 px no hay scroll horizontal y el canvas se ve completo.
- [ ] Sin warnings de hidratación ni errores nuevos en la consola.

---

## Decisiones tomadas y descartadas

- **Sí:** motor TypeScript sin DOM + componente canvas + registro. Es la convención de SPEC 04.
- **Sí:** HUD y modal de la plataforma como única interfaz de puntuación y fin de partida.
- **Sí:** sin tablas nuevas; solo la fila en `games` (SPEC 05).
- **Sí:** <discrepancias README/código resueltas a favor del código>.
- **No:** `<iframe>` ni `next/script` con el `game.js` original.
- **No:** <audio, táctil u otras mecánicas, con motivo>.

---

## Riesgos identificados

| Riesgo                                               | Mitigación                                                           |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| Doble montaje en StrictMode duplica listeners/bucles | Limpieza completa en el `return` del efecto; probar en `npm run dev` |
| `onChange` a 60 Hz provoca re-renders                | Emitir solo cuando cambia el snapshot                                |
| Salto de `dt` al reanudar o volver a la pestaña      | `dt` acotado y `lastTime` reiniciado                                 |
| Aleatoriedad en render rompe hidratación             | Motor creado solo en un efecto del cliente                           |
| Canvas desproporcionado en móvil                     | Resolución lógica fija y escalado CSS; revisar a 375 px              |
| Teclado inalcanzable en móvil                        | Limitación aceptada; táctil en un spec propio                        |
| RLS abierta permite scores falsos                    | Riesgo asumido en SPEC 05; se resuelve en un spec de seguridad       |
| <Riesgo propio del juego>                            | <Mitigación>                                                         |

---

## Qué **no** está en este spec

- Controles táctiles ni gamepad virtual.
- Audio<, salvo decisión contraria>.
- Auth real, `user_id` o cambios de RLS.
- Tests automatizados.
- <Otros juegos del catálogo.>

Cada uno de estos puntos, si se aborda, va en su propio spec.
