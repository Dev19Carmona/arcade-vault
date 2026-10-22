# SPEC 11 — Viuda: alinear las reglas con el reglamento oficial y documentar el juego

> **Estado:** Draft
> **Depende de:** SPEC 07 (Viuda VS CPU, `rules.ts`), SPEC 08 (Viuda en línea), SPEC 10 (animaciones y marcas, `fx/` y `online/table-fx.ts`)
> **Fecha:** 2026-10-22
> **Objetivo:** Que Viuda (VS CPU y en línea) siga al pie de la letra el _Reglamento Oficial y Manual Técnico V5_ (rotación de quien empieza, desempate por pintas sin empates, un solo «llamo» por ronda) y que exista un `REGLAS.md` que describa exactamente cómo funciona el juego implementado.

---

## Por qué existe este spec

Tras jugar en línea con amigos y comparar el juego con `lib/games/viuda/Reglamento Oficial y Manual Técnico Definitivo - La Viuda (Versión Completa V5).docx`, se detectaron fallos y diferencias. Resultado del análisis del código frente al reglamento:

| #   | Observado / reglamento                                                                                                                                                         | Estado actual                                                                                                                                                                                                                                                                                                                                                                                                              | Causa (verificada en el código)                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | **Dos jugadores aparecieron con «LLAMO» a la vez.** Una ronda solo admite una llamada.                                                                                         | Las reglas **ya rechazan** un segundo «llamo» (`rules.ts:301`, `caller !== null`). El fallo es visual: la marca persistente del llamador (`sticky: true`, `fx/scenes.ts:217`) **no se limpia nunca en el modo en línea**. `engine.ts:358` llama a `fx.clearSticky()` en VS CPU, pero `online/table-fx.ts` no tiene equivalente. La marca de una ronda sigue visible en la siguiente y, cuando llama otro jugador, hay dos. | Falta de limpieza en `online/table-fx.ts`.                                                  |
| 2   | **Empieza la ronda quien perdió vida**, así que el mismo jugador abría la ronda 1 y la 2. El reglamento (§3) dice que la salida **rota al siguiente a la derecha** cada ronda. | `startShowdown` fija `nextStarter` en el primer perdedor desde el que empezó (`rules.ts:184-194`).                                                                                                                                                                                                                                                                                                                         | Regla distinta a la del reglamento (decisión del SPEC 07).                                  |
| 3   | **Viuda cerrada y todos pasan:** se abre cuando el turno vuelve a quien abrió la ronda.                                                                                        | `closeLap` la abre al cerrarse la vuelta (`rules.ts:215`), que es el mismo instante lógico en que el turno regresa al que empezó; el estado es correcto. Con el bug 2, quien «empezaba» no era quien correspondía, lo que hacía que la apertura pareciera ocurrir en el jugador equivocado.                                                                                                                                | Consecuencia del punto 2; se verifica y se deja documentado, sin cambio de reglas esperado. |
| 4   | **Pintas.** El reglamento (§6) ordena ♦ > ♥ > ♠ > ♣ y dice que **nunca hay empate**; el sorteo inicial y los desempates de mano usan la pinta.                                 | Los palos no desempatan en el duelo (`compareHands`, `utils.ts:79`): si hay empate en la peor mano pierden varios. El sorteo usa ♠ > ♥ > ♦ > ♣ (`compareDrawCards`).                                                                                                                                                                                                                                                       | Diseño del SPEC 07, contrario al reglamento.                                                |
| 5   | No existe un documento que describa cómo funciona el juego.                                                                                                                    | Las reglas están repartidas entre `CLAUDE.md`, SPEC 07/08/10 y el código.                                                                                                                                                                                                                                                                                                                                                  | —                                                                                           |

Cualquier otra regla del reglamento (3 vidas, 2–9 jugadores, 5+5 cartas, jerarquía de manos, CAMBIAR solo 1 o 5, última vuelta tras «llamo», eliminación, victoria del último) ya coincide con el código y **no se toca**.

---

## Alcance

**Dentro:**

- **Rotación de quien empieza:** ronda 1 empieza el ganador del sorteo; cada ronda siguiente empieza el **siguiente jugador vivo en el orden de turnos** (a la derecha) de quien empezó la anterior, sin importar quién perdió vida. Los eliminados se saltan.
- **Jerarquía de pintas** ♦ > ♥ > ♠ > ♣ en el sorteo inicial y como desempate final del duelo, con los criterios literales del reglamento por tipo de mano. Resultado: en cada duelo pierde vida **exactamente un jugador**.
- **Un solo «llamo» por ronda**, garantizado en tres capas: reglas (ya está), anfitrión/cliente y dibujo. La marca persistente del llamador se limpia en línea igual que en VS CPU.
- **Verificar y fijar con comprobación explícita** que la viuda cerrada se abre cuando el turno regresa a quien empezó la ronda (VS CPU y en línea), incluida la animación de volteo.
- **`lib/games/viuda/REGLAS.md`:** documento de cómo funciona exactamente el juego implementado (ver «Contenido de REGLAS.md»).
- Actualizar `CLAUDE.md` (sección «Juegos») y anotar en SPEC 07 que las reglas de quién empieza, desempate y empates fueron reemplazadas por este spec.

**Fuera de alcance (para otros specs):**

- Pozo, apuestas o premio en dinero (el reglamento habla de un pozo; la plataforma solo puntúa la victoria, SPEC 07).
- Rol de «repartidor» como figura propia: quien empieza la ronda se considera el repartidor y no se muestra una ficha aparte.
- Cambios en la IA de las CPU más allá de lo que obligue la nueva comparación de manos.
- Temporizador de turno, expulsión de AFK, migración de anfitrión, autenticación.
- Cambios en la UI (lobby, sala de espera, colores, layout) o en las animaciones, salvo la limpieza de la marca de llamada.
- La escalera A-2-3-4-5 («rueda»): **se mantiene** como está (el reglamento no la menciona); solo se documenta.
- Tests automatizados (el proyecto no tiene framework).

---

## Modelo de datos

No hay tablas ni mensajes nuevos. Cambios en tipos y constantes existentes:

```ts
// lib/games/viuda/constants.ts
// Jerarquía de pintas del reglamento (mayor valor = mayor jerarquía).
// Suit: 0 ♣, 1 ♦, 2 ♥, 3 ♠  →  ♣ < ♠ < ♥ < ♦
export const SUIT_POWER: Record<Suit, number> = { 0: 0, 3: 1, 2: 2, 1: 3 };
```

```ts
// lib/games/viuda/types.ts
export interface HandValue {
  category: HandCategory;
  tiebreak: number[]; // rangos en orden de comparación (sin cambios)
  suitBreak: number; // NUEVO: SUIT_POWER de la carta determinante (ver tabla)
}
```

Carta determinante de `suitBreak` por tipo de mano (reglamento §5):

| Mano                               | Carta cuya pinta desempata                               |
| ---------------------------------- | -------------------------------------------------------- |
| Carta alta                         | La carta más alta                                        |
| Par                                | La carta de mayor pinta **del par**                      |
| Doble par                          | La carta de mayor pinta del **par superior**             |
| Escalera sucia / Escalera de color | La carta que **corona** la escalera (en A-2-3-4-5, el 5) |
| Color                              | La carta más alta                                        |
| Tercia, Full House, Póker          | No aplica (el valor ya desempata; se deja `0`)           |

```ts
// lib/games/viuda/rules.ts
export interface RulesState {
  // ...
  // `nextStarter` desaparece: la siguiente salida se calcula al resolver el duelo
  // como nextAlive(starter) una vez marcados los eliminados.
}
```

`compareHands` pasa a desempatar por `suitBreak` cuando `category` y `tiebreak` coinciden, y por tanto solo devuelve `0` para la misma mano. `compareDrawCards` ordena por rango y después por `SUIT_POWER`. Los campos de `PublicTable` (`protocol.ts`) no cambian; `rankingGroups` conserva su forma aunque ya no deba haber eliminados en el mismo duelo.

---

## Plan de implementación

Cada paso deja el juego funcionando.

1. **Marca de «llamo» en línea (bug 1).** En `online/table-fx.ts`, llamar a `tl.clearSticky()` cuando la mesa recibida tenga `callerId === null` o `phase !== "turn"` (mismo criterio que `engine.ts:358`), y al abrir una ronda (`deal`). Comprobar que `callScene` solo añade la marca de quien aparece en `callerId`. Defensa adicional en `online/table-view.ts`: el botón LLAMO solo se ofrece con `callerId === null` (ya ocurre; dejarlo comprobado) y el anfitrión sigue descartando cualquier `call` con `callerId !== null` (viene de `applyAction`).
2. **Pintas en las constantes y el sorteo.** Añadir `SUIT_POWER` (`constants.ts`) y usarlo en `compareDrawCards` (`utils.ts`). El texto de empate del sorteo en `engine.ts` y `online/table-view.ts` no cambia.
3. **Desempate por pintas en las manos.** Añadir `suitBreak` a `HandValue` y calcularlo en `evaluateHand` según la tabla; `compareHands` lo usa como último criterio. Revisar que la IA (`engine.ts`) y la UI que muestran `HAND_NAMES` no dependan de empates.
4. **Un perdedor por ronda.** En `startShowdown` (`rules.ts`) ya se calculan `losers`; con el paso 3 siempre tendrá un elemento. Se deja el código genérico pero el comentario y `CLAUDE.md` pasan a decir «un solo perdedor».
5. **Rotación de salida.** En `startShowdown` dejar de calcular `nextStarter`; en `resolveShowdown`, tras marcar a los eliminados, empezar la ronda siguiente en `nextAlive(draft, draft.starter)`. Retirar `nextStarter` de `RulesState` y de `createGame`. `eliminate()` en fase `draw` sigue recalculando el ganador del sorteo.
6. **Apertura de la viuda (punto 3).** Comprobar con un script contra `rules.ts` que, con la viuda cerrada y todos pasando, `widowOpen` pasa a `true` justo cuando `current` vuelve a `starter`, con 2, 4 y 9 jugadores, y con un jugador eliminado a mitad de vuelta. En línea, verificar que el volteo (`widowFlipScene`) se dispara con el último paso de la vuelta. Si el script revela una desviación, corregirla en `closeLap`/`endTurn`; si no, no se cambia código.
7. **`REGLAS.md`.** Escribir `lib/games/viuda/REGLAS.md` con el contenido de la sección siguiente.
8. **Documentación.** Actualizar `CLAUDE.md` (sección «Juegos»: quién empieza, desempate, un perdedor por ronda) y añadir una nota en SPEC 07 («superado por SPEC 11 en: quién empieza las rondas, desempate por pintas y empate en la peor mano»).
9. **Verificación manual.** Script que juega partidas completas contra `rules.ts` y dos pestañas de Playwright en línea (ver «Criterios de aceptación»).

### Contenido de `REGLAS.md`

Documento en español, un solo archivo, que describe el juego **tal como está implementado** (no el reglamento en bruto) y enlaza al `.docx` como fuente. Secciones:

1. **Resumen y componentes:** mazo de 52, 2–9 jugadores, 3 vidas, 5 cartas por jugador + 5 de la viuda, el resto se aparta sin verse.
2. **Sorteo inicial:** una carta por jugador; gana rango más alto y, en igualdad, la jerarquía ♦ > ♥ > ♠ > ♣.
3. **Rondas y salida:** quién empieza cada ronda (rotación al siguiente vivo), orden de turnos (sentido horario en pantalla = «derecha»), eliminados saltados.
4. **Turno:** acciones PASO, LLAMO, CAMBIAR 5 y CAMBIAR 1, y cuándo está disponible cada una (viuda cerrada/abierta); apertura de la viuda (cambio de 5 o vuelta completa sin llamar, al regresar el turno a quien empezó); vueltas ilimitadas hasta que alguien llame.
5. **Llamada y última vuelta:** solo una por ronda; quien llama no puede cambiar ni pasar; cada otro jugador vivo juega un último turno; al volver a quien llamó se muestran las manos.
6. **Duelo:** jerarquía de manos, criterios de desempate por tipo (tabla del modelo de datos), regla de oro de las pintas, un solo perdedor, pérdida de vida y eliminación.
7. **Fin de la partida:** gana el último vivo; puntuación solo en VS CPU (`3000 + 300 × vidas`, derrota 0).
8. **Diferencias por modo:** VS CPU (tú + 3 CPU, `engine.ts`) frente a en línea (2–9 humanos, anfitrión autoritativo, desconexión, pausa, eliminación, REVANCHA, sin puntuación).
9. **Diferencias deliberadas con el reglamento:** sin pozo; la escalera A-2-3-4-5 es válida; el «repartidor» es quien empieza la ronda.
10. **Dónde vive cada regla en el código:** `rules.ts`, `utils.ts`, `constants.ts`, `online/host.ts`.

---

## Criterios de aceptación

- [ ] En línea, tras una ronda en la que alguien llamó, la ronda siguiente empieza **sin ninguna marca de «LLAMO»**; si llama otro jugador, aparece **una sola** marca y «ÚLTIMA VUELTA».
- [ ] Con 3+ jugadores en línea, mientras un jugador ha llamado, ningún otro ve el botón LLAMO ni puede llamar con la tecla `L`; una acción `call` forzada fuera de la UI es rechazada.
- [ ] La ronda 1 empieza el ganador del sorteo; la ronda 2 empieza el siguiente vivo en el orden de turnos; la 3, el siguiente, etc., aunque el que empieza no haya perdido vida o haya perdido.
- [ ] Si el siguiente en la rotación fue eliminado en el duelo, empieza el siguiente vivo después de él.
- [ ] En el sorteo, con el mismo rango gana la pinta más alta en el orden ♦ > ♥ > ♠ > ♣.
- [ ] `compareHands` entre dos manos distintas generadas desde un mismo mazo nunca devuelve `0`: en 10 000 duelos simulados de 2–9 jugadores, siempre pierde exactamente un jugador.
- [ ] Casos concretos del reglamento: dos pares del mismo valor con kickers idénticos se desempatan por la pinta de la carta más alta del par; dos escaleras con la misma carta máxima, por la pinta de esa carta; dos colores idénticos en rangos, por la pinta de la carta más alta.
- [ ] Con la viuda cerrada y todos pasando, `widowOpen` se vuelve `true` exactamente cuando el turno regresa a quien empezó la ronda (2, 4 y 9 jugadores; con y sin eliminados), en `rules.ts` y en ambos modos visibles.
- [ ] VS CPU sigue jugando partidas completas sin errores, con la nueva rotación y sin empates.
- [ ] `lib/games/viuda/REGLAS.md` existe, cubre las 10 secciones indicadas y sus afirmaciones coinciden con el código (revisadas contra `rules.ts`, `utils.ts` y `host.ts`).
- [ ] `CLAUDE.md` y SPEC 07 reflejan los cambios; no queda ninguna mención a «empieza quien perdió» ni a «los empatados pierden todos» en la documentación vigente.
- [ ] `npm run lint` y `npm run build` pasan.

---

## Decisiones tomadas y descartadas

- **Sí: rotar la salida al siguiente vivo.** Es lo que dice el reglamento y lo que el usuario espera. _Descartado:_ mantener «empieza el perdedor» (provocaba que el mismo jugador abriera rondas seguidas).
- **Sí: seguir el reglamento en pintas (♦ > ♥ > ♠ > ♣) tanto en el sorteo como en el duelo.** Elimina los empates y deja un solo perdedor por ronda. _Descartado:_ cambiar solo el sorteo, o no cambiar nada.
- **Sí: corregir la marca de llamada en el cliente en línea en lugar de tocar las reglas.** Las reglas ya impedían la doble llamada; el fallo estaba en una marca persistente que nunca se limpiaba. Se añade además la comprobación de las otras dos capas como criterio de aceptación.
- **Sí: el punto de la viuda se verifica antes de tocarlo.** El análisis no encontró fallo propio en `closeLap`; la causa más probable es la rotación incorrecta. Si el script lo contradice, se corrige.
- **Sí: mantener la escalera A-2-3-4-5.** El reglamento no la prohíbe; se documenta.
- **Sí: `REGLAS.md` junto al código (`lib/games/viuda/`).** Describe lo implementado; el `.docx` queda como fuente de referencia.
- **No: pozo/apuestas.** La plataforma puntúa la victoria; el pozo queda para otro spec si se quisiera.

---

## Riesgos identificados

- **Compatibilidad en línea entre versiones:** el protocolo no cambia, pero un anfitrión con reglas viejas y clientes nuevos (o al revés) seguiría mostrando otra salida o desempate. Mitigación: despliegue único; las salas en curso al desplegar deben cerrarse.
- **`suitBreak` mal calculado en casos raros** (rueda A-2-3-4-5, doble par con tres pares candidatos). Mitigación: la simulación de 10 000 duelos y los casos concretos del criterio de aceptación.
- **Retirar `nextStarter`** toca `rules.ts` y puede afectar a quien lo lea en `engine.ts`/`host.ts`; se busca con grep antes de borrarlo (hoy solo aparece en `rules.ts`).
- **La causa de la doble marca solo se ha deducido del código**; si tras el paso 1 persiste en pruebas con amigos, habrá que reproducirlo con dos pestañas y revisar `rejoin`/`buildTable()` (que repite eventos en cada mesa).
