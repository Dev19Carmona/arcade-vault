# Viuda — cómo funciona el juego

Este documento describe el juego **tal como está implementado** en Arcade Vault (VS CPU y en línea). La fuente de las reglas es el _Reglamento Oficial y Manual Técnico Definitivo — La Viuda (Versión Completa V5)_ (`Reglamento Oficial y Manual Técnico Definitivo - La Viuda (Versión Completa V5).docx`, en esta misma carpeta); las diferencias deliberadas con ese reglamento están en la sección 9. Especificación: `specs/07-juego-viuda.md`, `specs/08-viuda-en-linea.md` y `specs/11-viuda-reglamento-y-correcciones.md`.

## 1. Resumen y componentes

- Mazo estándar de **52 cartas**. Participan de **2 a 9 jugadores**.
- Cada jugador empieza con **3 vidas**. En cada ronda pierde **1 vida** quien tenga la **peor mano de póker** de 5 cartas. Con 0 vidas queda eliminado. Gana el último que sigue vivo.
- En cada ronda se reparten **5 cartas a cada jugador vivo** y **5 al centro boca abajo: la viuda**. Las demás cartas se apartan sin verse (se baraja un mazo nuevo cada ronda).
- El objetivo no es hacer la mejor jugada, sino **no tener la peor mano** en el duelo.

## 2. Sorteo inicial

Solo antes de la ronda 1. Cada jugador saca una carta del mazo barajado y **empieza quien saque la más alta**. Se compara primero el rango (A > K > Q > J > 10 > … > 2) y, si hay igualdad, la **pinta**: ♦ > ♥ > ♠ > ♣. El sorteo se muestra a todos y se avanza con CONTINUAR (en línea, también solo a los 8 s).

## 3. Rondas, salida y orden de turnos

- Los turnos avanzan siempre en el mismo sentido: la **derecha** del reglamento es el siguiente asiento en el orden de turnos (sentido horario en pantalla; el jugador local siempre se dibuja abajo).
- **Quien empieza la ronda** (el «repartidor» del reglamento) abre el turno de esa ronda. La ronda 1 la abre el ganador del sorteo. **Cada ronda siguiente la abre el siguiente jugador vivo** de quien abrió la anterior, sin importar quién perdió vida. Los eliminados se saltan.
- Los eliminados no reciben cartas ni juegan; en línea siguen viendo la mesa como espectadores.

## 4. El turno

Cada jugador, en su turno, elige una acción:

| Acción              | Disponible                            | Efecto                                                                                                                                   |
| ------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **PASO** (`P`)      | Siempre, salvo quien ya llamó         | Conserva su mano y cede el turno.                                                                                                        |
| **CAMBIAR 5** (`C`) | Siempre (viuda cerrada o abierta)     | Intercambia sus 5 cartas por las 5 de la viuda. Sus cartas antiguas quedan **boca arriba** como nueva viuda. Si estaba cerrada, se abre. |
| **CAMBIAR 1** (`X`) | Solo con la viuda abierta             | Intercambia una carta propia por una de la viuda. Está prohibido cambiar 2, 3 o 4.                                                       |
| **LLAMO** (`L`)     | Siempre que **nadie haya llamado** ya | Declara que cree no perder. Ver sección 5.                                                                                               |

**La viuda empieza cerrada.** Se abre de dos maneras:

1. Alguien usa **CAMBIAR 5**.
2. Todos los jugadores vivos juegan una vez sin que nadie llame (todos pasan): la viuda se abre **cuando el turno vuelve a quien abrió la ronda**.

Con la viuda cerrada la única forma de interactuar con ella es CAMBIAR 5. Una vez abierta, las **vueltas son ilimitadas** hasta que alguien llame: cada vuelta completa sin llamada sigue con el mismo orden.

## 5. Llamada y última vuelta

- **Solo una persona puede llamar por ronda.** Mientras haya una llamada, nadie más ve el botón LLAMO y el servidor/anfitrión rechaza cualquier otra.
- Quien llama **no puede cambiar ni pasar** después.
- La llamada inicia la **última vuelta**: cada uno de los demás jugadores vivos tiene **un único turno** para cambiar (5 o, si la viuda ya está abierta, 1 o 5) o pasar. No pueden llamar.
- Efecto especial: si la viuda estaba cerrada cuando se llamó y uno de los siguientes cambia las 5, la viuda queda abierta y los demás pueden usarla con CAMBIAR 1 o 5 en su turno final.
- Al volver el turno a quien llamó, termina la ronda y se pasa al duelo.

## 6. Duelo

Se muestran las manos de todos los jugadores vivos (la viuda no participa).

**Jerarquía de manos (de peor a mejor):** carta alta · par · doble par · terna · escalera (sucia) · color · full house · póker · escalera de color.

**Desempate** dentro de la misma categoría, en este orden:

| Mano              | Se compara                                                    |
| ----------------- | ------------------------------------------------------------- |
| Carta alta        | Las 5 cartas de mayor a menor, una a una.                     |
| Par               | El valor del par; luego las 3 sueltas de mayor a menor.       |
| Doble par         | El par más alto; luego el más bajo; luego la quinta carta.    |
| Terna             | El valor de la terna (no puede haber dos iguales en un mazo). |
| Escalera          | La carta máxima que la corona.                                |
| Color             | Las 5 cartas de mayor a menor, una a una.                     |
| Full house        | El valor de la terna.                                         |
| Póker             | El valor del póker.                                           |
| Escalera de color | La carta máxima que la corona.                                |

**Regla de oro (pintas):** si todo lo anterior coincide, decide la **pinta de la carta determinante**, con la jerarquía ♦ (mayor) > ♥ > ♠ > ♣ (menor). La carta determinante es la más alta (carta alta y color), la de mayor pinta del par (par), la de mayor pinta del par superior (doble par) o la que corona la escalera. Por eso **nunca hay empate: en cada duelo pierde exactamente un jugador**.

Quien tiene la **peor mano pierde 1 vida**; si llega a 0 queda eliminado. Si queda un solo jugador vivo, la partida termina. Si no, empieza la ronda siguiente con la rotación de la sección 3.

## 7. Fin de la partida y puntuación

- Gana el último jugador vivo. Si dos se juegan el final, el sobreviviente (con 3, 2 o 1 vidas) gana.
- **VS CPU:** la partida acaba también si el jugador humano queda eliminado. Puntuación solo por victoria: `3000 + 300 × vidas restantes` (3 CPU rivales); la derrota vale 0. Se guarda con `saveScore`.
- **En línea:** sin puntuación. Al terminar se muestra la clasificación (el último vivo primero, luego los eliminados del más reciente al más antiguo) y se puede pedir REVANCHA.

## 8. Diferencias por modo

|                          | VS CPU                                                                                                                                                                                  | En línea                                                                                                                                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jugadores                | Tú + 3 CPU                                                                                                                                                                              | 2 a 9 humanos, sin CPU de relleno                                                                                                                                                                                                                                 |
| Quién ejecuta las reglas | El navegador (`engine.ts`)                                                                                                                                                              | El navegador de quien crea la sala, como anfitrión autoritativo (`online/host.ts`); valida cada acción                                                                                                                                                            |
| CPU                      | Piensan 0,8–1,4 s; llaman cuando su mano supera un umbral que baja cada vuelta; con la viuda cerrada, con mano débil suelen tomarla entera; con la viuda abierta cambian solo si mejora | —                                                                                                                                                                                                                                                                 |
| Sorteo y duelo           | Avanzan con CONTINUAR                                                                                                                                                                   | Avanzan con CONTINUAR o solos a los 8 s                                                                                                                                                                                                                           |
| Tiempo por turno         | Sin límite                                                                                                                                                                              | Sin límite                                                                                                                                                                                                                                                        |
| Desconexión              | —                                                                                                                                                                                       | Si un jugador sigue sin presencia pasado 1,5 s, se le da por desconectado; el anfitrión puede PAUSAR, y al REANUDAR quienes siguen fuera quedan eliminados (o ELIMINAR al instante). Con la partida en marcha un jugador caído no puede volver hasta que se pause |
| Salas                    | —                                                                                                                                                                                       | Código de 5 caracteres; el anfitrión mantiene la sala abierta mientras `status = 'waiting'`; INICIAR con 2–9 jugadores                                                                                                                                            |
| Mano propia              | Se puede reordenar arrastrando las cartas (solo visual, no cambia las reglas)                                                                                                           | Igual; el orden es local y no se comparte                                                                                                                                                                                                                         |

## 9. Diferencias deliberadas con el reglamento

- **Sin pozo ni apuestas.** El reglamento habla de un pozo para el ganador; la plataforma solo puntúa la victoria en VS CPU.
- **Sin figura de repartidor.** Quien abre la ronda se considera el repartidor; no hay ficha ni reparto físico (el mazo se baraja de nuevo cada ronda).
- **La escalera A-2-3-4-5 es válida** (el as vale 1 y la corona el 5); el reglamento no la menciona.
- **Mazo nuevo en cada ronda:** las cartas sobrantes no se conservan entre rondas.

## 10. Dónde vive cada regla en el código

| Regla                                                                                                                                   | Archivo                                  |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Núcleo de reglas inmutable (`createGame`, `applyAction`, `advance`, `eliminate`, `getRanking`): turnos, viuda, llamada, rotación, vidas | `rules.ts`                               |
| Evaluación y comparación de manos, sorteo, puntuación                                                                                   | `utils.ts`                               |
| Vidas, tamaño de mano, jerarquía de pintas (`SUIT_POWER`), nombres de manos                                                             | `constants.ts`                           |
| Tipos de carta, mano y eventos                                                                                                          | `types.ts`                               |
| Modo VS CPU (IA, entrada, dibujo)                                                                                                       | `engine.ts`                              |
| Anfitrión: validación de acciones, pausa, desconexión, salas                                                                            | `online/host.ts`                         |
| Cliente en línea y protocolo                                                                                                            | `online/client.ts`, `online/protocol.ts` |
| Animaciones                                                                                                                             | `fx/`, `online/table-fx.ts`              |
