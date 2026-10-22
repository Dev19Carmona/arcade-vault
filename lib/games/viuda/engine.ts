import {
  BUTTON_Y,
  CARD_GAP,
  CARD_H,
  CARD_W,
  COLOR_CYAN,
  COLOR_DIM,
  COLOR_GREEN,
  COLOR_MAGENTA,
  COLOR_YELLOW,
  CPU_THINK_MAX,
  CPU_THINK_MIN,
  HAND_SIZE,
  HAND_Y,
  HUMAN_SEAT,
  LIVES,
  MAX_DT,
  SEATS,
  W,
  WIDOW_CARD_H,
  WIDOW_CARD_W,
  WIDOW_GAP,
  WIDOW_Y,
} from "./constants";
import {
  buttonRowRects,
  cardRowRects,
  drawBanner,
  drawButton,
  drawCardPosed,
  drawCardRow,
  drawLives,
  drawSeat,
  lifeHeartPos,
  drawTable,
  drawText,
  pointInRect,
  seatCardRects,
  type CardStyle,
} from "./entities";
import {
  drawBadges,
  drawEffects,
  drawFlights,
  drawLastLap,
  drawLastLapBorder,
  drawTurnPulse,
  type BadgeAnchor,
} from "./fx/draw";
import {
  callScene,
  dealScene,
  passScene,
  showdownScene,
  type DealMove,
  type HeartBreak,
  type Reveal,
  swap1Moves,
  swap1Scene,
  swap5Moves,
  swap5Scene,
  widowFlipScene,
  type SwapLayout,
} from "./fx/scenes";
import { createTimeline } from "./fx/timeline";
import {
  cardKey,
  createHandDrag,
  initialOrder,
  moveCard,
  reconcile,
  rulesToVisual,
  visualIndices,
  visualToRules,
  type HandOrder,
} from "./hand-order";
import { opponentRects, relativeSeat } from "./online/layout";
import type { OnlineAction } from "./online/protocol";
import {
  advance,
  applyAction,
  createGame,
  type RulesResult,
  type RulesState,
} from "./rules";
import type {
  Card,
  Rect,
  ViudaEngine,
  ViudaEngineOptions,
  ViudaSnapshot,
} from "./types";
import { cardLabel, evaluateHand, finalScore } from "./utils";

type ButtonId = "continue" | "swap5" | "swap1" | "pass" | "call";

interface ButtonView {
  id: ButtonId;
  label: string;
  color: string;
  disabled: boolean;
}

const OWN_KEYS = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"];
const WIDOW_KEYS = ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT"];
const CONTINUE_KEYS = ["Space", "Enter", "NumpadEnter"];

// Valor continuo de una mano para decidir de las CPU: categoría + carta principal.
function handScore(cards: readonly Card[]): number {
  const { category, tiebreak } = evaluateHand(cards);
  return category + tiebreak[0] / 20;
}

export function createViudaEngine({
  seatCount = SEATS,
  localSeat = HUMAN_SEAT,
  onChange,
  onGameOver,
}: ViudaEngineOptions): ViudaEngine {
  // Los rivales se numeran en orden de turno a partir del asiento local.
  const seatName = (i: number) =>
    i === localSeat ? "TÚ" : `CPU ${relativeSeat(i, localSeat, seatCount)}`;
  const opponents = opponentRects(seatCount);
  const seatIds = Array.from({ length: seatCount }, (_, i) => `seat-${i}`);
  const random = () => Math.random();
  const newGame = () =>
    createGame(seatIds, random, { endWhenEliminated: seatIds[localSeat] });

  // Las reglas viven en rules.ts; aquí solo queda lo que es de esta mesa: la IA,
  // la selección de cartas, el reloj de las CPU, el puntaje y el dibujo.
  let state: RulesState = newGame();
  let thinkTimer = 0;
  let selOwn: number | null = null;
  let selWidow: number | null = null;
  let score = 0;
  let gameOverEmitted = false;
  let pointer = { x: -1, y: -1 };
  let last: ViudaSnapshot | null = null;
  const fx = createTimeline();

  // Orden visual de mi mano (solo local) y arrastre. `order` es el vigente; `prevOrder` y
  // `prevHand` guardan el de antes de la última jugada para animar de dónde salen las cartas.
  let order: HandOrder = initialOrder(state.seats[localSeat].hand);
  let prevOrder = order;
  let prevHand: readonly Card[] = state.seats[localSeat].hand;
  const drag = createHandDrag(HAND_SIZE);

  // Dónde están las cartas de un asiento y las de la viuda, para animar los cambios.
  // Los huecos de mi mano se numeran por posición visual: es lo que se dibuja.
  function swapLayout(seat: number): SwapLayout {
    const widow = widowRects();
    const widowSlot = (k: number) => ({ key: `widow:${k}`, rect: widow[k] });
    if (seat === localSeat) {
      const own = ownRects();
      const slotAt = (k: number, ord: HandOrder, hand: readonly Card[]) => {
        const v = rulesToVisual(ord, hand, k);
        return { key: `own:${v}`, rect: own[v] };
      };
      return {
        seatUp: true,
        seatSlot: (k) => slotAt(k, order, state.seats[localSeat].hand),
        seatSlotOut: (k) => slotAt(k, prevOrder, prevHand),
        widowSlot,
      };
    }
    const panel = opponents[relativeSeat(seat, localSeat, seatCount) - 1];
    const cards = seatCardRects(panel, HAND_SIZE, false);
    return {
      seatUp: false,
      seatSlot: (k) => ({ key: `seat:${seat}:${k}`, rect: cards[k] }),
      widowSlot,
    };
  }

  // Panel de un asiento: el del jugador local es la zona de «TÚ» y las vidas.
  function seatPanel(seat: number): Rect {
    if (seat === localSeat) return { x: 36, y: HAND_Y + 14, w: 68, h: 52 };
    return opponents[relativeSeat(seat, localSeat, seatCount) - 1];
  }

  // Dónde se dibuja el cartel de la jugada de un asiento y su marca de llamador.
  function badgeAnchor(seat: number): BadgeAnchor {
    if (seat === localSeat) {
      return { x: W / 2, y: HAND_Y - 58, tag: { x: 70, y: HAND_Y + 8 } };
    }
    const r = seatPanel(seat);
    return {
      x: r.x + r.w / 2,
      y: r.y + 66,
      tag: { x: r.x + r.w - 32, y: r.y + 14 },
    };
  }

  // Centro del corazón `index` de la fila de vidas de un asiento.
  function heartPos(seat: number, index: number) {
    if (seat === localSeat) return lifeHeartPos(index, 70, HAND_Y + 54);
    const r = seatPanel(seat);
    return lifeHeartPos(index, r.x + r.w / 2, r.y + 34);
  }

  // Sorteo inicial: una carta del mazo a cada asiento, de cara.
  function playSorteo() {
    const moves: DealMove[] = state.seats.flatMap((seat, i) => {
      if (!seat.drawCard) return [];
      const rect =
        i === localSeat
          ? ownRects(1)[0]
          : seatCardRects(seatPanel(i), 1, true)[0];
      const key = i === localSeat ? "own:0" : `seat:${i}:0`;
      return [{ card: seat.drawCard, to: { key, rect }, toUp: true, order: i }];
    });
    fx.enqueue(dealScene(moves));
  }

  // Convierte los eventos de una transición en animaciones. `prev` es el estado anterior.
  function playEvents(prev: RulesState, next: RulesState) {
    for (const event of next.lastEvents) {
      if (event.kind === "deal") {
        // Reparto por rondas empezando por quien abre la ronda; la viuda va al final.
        const layouts = next.seats.map((_, s) => swapLayout(s));
        const moves: DealMove[] = [];
        let seq = 0;
        for (let k = 0; k < HAND_SIZE; k++) {
          for (let n = 0; n < seatCount; n++) {
            const s = (next.starter + n) % seatCount;
            if (!next.seats[s].alive) continue;
            moves.push({
              card: next.seats[s].hand[k],
              to: layouts[s].seatSlot(k),
              toUp: layouts[s].seatUp,
              order: seq++,
            });
          }
        }
        for (let k = 0; k < HAND_SIZE; k++) {
          moves.push({
            card: next.widow[k],
            to: layouts[localSeat].widowSlot(k),
            toUp: false,
            order: seq++,
          });
        }
        fx.enqueue(dealScene(moves));
      } else if (event.kind === "showdown") {
        // Las manos rivales se voltean; los corazones perdidos se rompen al terminar.
        const reveals: Reveal[] = [];
        let seq = 0;
        next.seats.forEach((seat, s) => {
          if (s === localSeat || !seat.alive) return;
          const panel = seatPanel(s);
          const back = seatCardRects(panel, HAND_SIZE, false);
          const face = seatCardRects(panel, HAND_SIZE, true);
          for (let k = 0; k < HAND_SIZE; k++) {
            const key = `seat:${s}:${k}`;
            reveals.push({
              card: seat.hand[k],
              from: { key, rect: back[k] },
              to: { key, rect: face[k] },
              order: seq++,
            });
          }
        });
        const hearts: HeartBreak[] = next.seats.flatMap((seat, s) =>
          seat.loser ? [{ seat: s, size: 14, ...heartPos(s, seat.lives) }] : [],
        );
        fx.enqueue(showdownScene(reveals, hearts));
      } else if (event.kind === "pass") {
        const mine = event.seat === localSeat;
        fx.enqueue(passScene(event.seat, mine ? "PASO" : "PASA"));
        // Si con este paso se cerró la vuelta, la viuda se abre sola: se voltea en su sitio.
        if (!prev.widowOpen && next.widowOpen) {
          const widow = widowRects();
          fx.enqueue(
            widowFlipScene(
              widow.map((rect, k) => ({ key: `widow:${k}`, rect })),
              next.widow,
            ),
          );
        }
      } else if (event.kind === "call") {
        const mine = event.seat === localSeat;
        fx.enqueue(
          callScene(
            event.seat,
            mine ? "¡LLAMO!" : "¡LLAMA!",
            mine ? "LLAMASTE" : "LLAMÓ",
          ),
        );
      } else if (event.kind === "swap1") {
        const moves = swap1Moves(
          swapLayout(event.seat),
          event.handIndex,
          event.widowIndex,
          next.seats[event.seat].hand[event.handIndex],
          next.widow[event.widowIndex],
        );
        fx.enqueue(swap1Scene(moves));
      } else if (event.kind === "swap5") {
        const moves = swap5Moves(
          swapLayout(event.seat),
          next.seats[event.seat].hand,
          next.widow,
          prev.widowOpen,
        );
        fx.enqueue(swap5Scene(moves));
      }
    }
  }

  function getSnapshot(): ViudaSnapshot {
    return {
      score,
      lives: state.seats[localSeat]?.lives ?? LIVES,
      round: state.round,
      rivals: state.seats.filter((s, i) => i !== localSeat && s.alive).length,
    };
  }

  function emit() {
    const snap = getSnapshot();
    if (
      last &&
      last.score === snap.score &&
      last.lives === snap.lives &&
      last.round === snap.round &&
      last.rivals === snap.rivals
    )
      return;
    last = snap;
    onChange(snap);
  }

  function aliveCount(): number {
    return state.seats.filter((s) => s.alive).length;
  }

  function scheduleThink() {
    thinkTimer = CPU_THINK_MIN + random() * (CPU_THINK_MAX - CPU_THINK_MIN);
  }

  // Aplica el resultado de una regla; si fue rechazada, el estado no cambia.
  function commit(result: RulesResult): boolean {
    if (result.error) return false;
    const prev = state;
    state = result.state;
    // Mi orden: con el reparto vuelve al de las reglas; con un cambio, la carta nueva
    // ocupa el hueco de la que salió.
    const myHand = state.seats[localSeat].hand;
    const dealt = state.lastEvents.some((e) => e.kind === "deal");
    const sameHand =
      myHand.length === prevHand.length &&
      myHand.every((c, i) => cardKey(c) === cardKey(prevHand[i]));
    prevOrder = order;
    order = dealt ? initialOrder(myHand) : reconcile(order, myHand);
    if (dealt || !sameHand) drag.cancel();
    playEvents(prev, state);
    prevHand = myHand;
    // La marca del llamador dura hasta que se muestran las manos.
    if (state.caller === null || state.phase !== "turn") fx.clearSticky();
    selOwn = null;
    selWidow = null;
    if (state.phase === "turn") scheduleThink();
    if (state.phase === "final") {
      const me = state.seats[localSeat];
      score = finalScore(me.alive, seatCount - 1, me.lives);
    }
    return true;
  }

  function act(seat: number, action: OnlineAction): boolean {
    return commit(applyAction(state, seatIds[seat], action));
  }

  // Mejor cambio de una carta con la viuda abierta: devuelve la mejora de valor.
  function bestSingleSwap(hand: readonly Card[]) {
    const base = handScore(hand);
    let best = { gain: 0, own: 0, wid: 0 };
    for (let i = 0; i < HAND_SIZE; i++) {
      for (let j = 0; j < HAND_SIZE; j++) {
        const trial = hand.map((c, k) => (k === i ? state.widow[j] : c));
        const gain = handScore(trial) - base;
        if (gain > best.gain) best = { gain, own: i, wid: j };
      }
    }
    return best;
  }

  function cpuAct() {
    const seat = state.current;
    const hand = state.seats[seat].hand;
    const value = handScore(hand);
    const others = aliveCount();
    // Con menos rivales vivos se llama con menos; un poco de ruido para no ser predecible.
    // Cada vuelta sin llamadas baja el umbral, así que tarde o temprano alguien llama.
    const threshold =
      2.1 -
      (seatCount - others) * 0.25 -
      (state.lap - 1) * 0.2 +
      (random() - 0.5) * 0.4;

    if (state.caller === null && value >= threshold) {
      act(seat, { type: "call" });
      return;
    }
    if (!state.widowOpen) {
      // Viuda boca abajo: no se conoce; con mano débil se arriesga a tomarla entera.
      if (value < 1.1 && random() < 0.75) act(seat, { type: "swap5" });
      else act(seat, { type: "pass" });
      return;
    }
    // Viuda abierta: se pueden cambiar las 5 o una carta, solo si mejora la mano.
    const swap = bestSingleSwap(hand);
    const gainAll = handScore(state.widow) - value;
    if (gainAll > 0.3 && gainAll > swap.gain) act(seat, { type: "swap5" });
    else if (swap.gain > 0.15) {
      act(seat, { type: "swap1", handIndex: swap.own, widowIndex: swap.wid });
    } else act(seat, { type: "pass" });
  }

  // Le toca al jugador local según las reglas, aunque aún esté animándose la jugada anterior.
  function myTurn(): boolean {
    return state.phase === "turn" && state.current === localSeat;
  }

  // Puede actuar ya: es su turno y no hay animación en curso.
  function humanTurn(): boolean {
    return myTurn() && !fx.isLocked();
  }

  function humanSwapAll() {
    if (humanTurn()) act(localSeat, { type: "swap5" });
  }

  function humanSwapOne() {
    if (humanTurn() && selOwn !== null && selWidow !== null) {
      act(localSeat, {
        type: "swap1",
        handIndex: selOwn,
        widowIndex: selWidow,
      });
    }
  }

  function activate(id: ButtonId) {
    if (id === "continue") {
      if (state.phase === "draw" || state.phase === "showdown") {
        commit(advance(state, random));
      } else if (state.phase === "final" && !gameOverEmitted) {
        gameOverEmitted = true;
        emit();
        onGameOver(score);
      }
    } else if (humanTurn()) {
      if (id === "pass") act(localSeat, { type: "pass" });
      else if (id === "call") act(localSeat, { type: "call" });
      else if (id === "swap5") humanSwapAll();
      else humanSwapOne();
    }
  }

  // Qué parte del duelo ya se ve: durante la animación, las manos se voltean primero y
  // el resultado (peor mano, vida perdida, mensaje) llega después.
  function heartBreaking(seat: number): boolean {
    return fx.effects.some((e) => e.seat === seat && fx.now >= e.start);
  }

  function showdownRevealed(): boolean {
    return (
      state.phase !== "showdown" ||
      !fx.isLocked() ||
      fx.effects.some((e) => fx.now >= e.start)
    );
  }

  // Vidas que se dibujan quietas: la que se pierde en el duelo sigue entera hasta que se rompe.
  function livesShown(seat: number): number {
    const s = state.seats[seat];
    const pending =
      state.phase === "showdown" &&
      s.loser &&
      fx.isLocked() &&
      !heartBreaking(seat);
    return s.lives + (pending ? 1 : 0);
  }

  function buttons(): ButtonView[] {
    if (state.phase !== "turn") {
      // El botón espera a que termine la animación del reparto o del duelo.
      if (fx.isLocked()) return [];
      return [
        {
          id: "continue",
          label: "CONTINUAR",
          color: COLOR_YELLOW,
          disabled: false,
        },
      ];
    }
    if (!humanTurn()) return [];
    const list: ButtonView[] = [];
    list.push({
      id: "swap5",
      label: "CAMBIAR 5 [C]",
      color: COLOR_CYAN,
      disabled: false,
    });
    if (state.widowOpen) {
      list.push({
        id: "swap1",
        label: "CAMBIAR 1 [X]",
        color: COLOR_CYAN,
        disabled: selOwn === null || selWidow === null,
      });
    }
    list.push({
      id: "pass",
      label: "PASO [P]",
      color: COLOR_YELLOW,
      disabled: false,
    });
    // Tras un "llamo" la última vuelta es solo para cambiar o pasar.
    if (state.caller === null) {
      list.push({
        id: "call",
        label: "LLAMO [L]",
        color: COLOR_MAGENTA,
        disabled: false,
      });
    }
    return list;
  }

  function ownRects(count = HAND_SIZE): Rect[] {
    return cardRowRects(count, W / 2, HAND_Y, CARD_W, CARD_H, CARD_GAP);
  }

  function widowRects(): Rect[] {
    return cardRowRects(
      HAND_SIZE,
      W / 2,
      WIDOW_Y,
      WIDOW_CARD_W,
      WIDOW_CARD_H,
      WIDOW_GAP,
    );
  }

  // Un clic o una tecla durante una animación la termina en vez de actuar.
  function skipFx(): boolean {
    if (!fx.isLocked()) return false;
    fx.skip();
    emit();
    return true;
  }

  function click() {
    if (skipFx()) return;
    const { x, y } = pointer;
    const views = buttons();
    const rects = buttonRowRects(views.length, BUTTON_Y);
    for (let i = 0; i < views.length; i++) {
      if (pointInRect(x, y, rects[i])) {
        if (!views[i].disabled) activate(views[i].id);
        emit();
        return;
      }
    }
    // Con la viuda abierta se eligen una carta propia y una de la viuda.
    if (humanTurn() && state.widowOpen) {
      // La selección guarda el índice de las reglas, así que sigue a la carta aunque se mueva.
      const hand = state.seats[localSeat].hand;
      const indices = visualIndices(order, hand);
      ownRects().forEach((r, v) => {
        if (pointInRect(x, y, r)) {
          const k = indices[v];
          selOwn = selOwn === k ? null : k;
        }
      });
      widowRects().forEach((r, i) => {
        if (pointInRect(x, y, r)) selWidow = selWidow === i ? null : i;
      });
    }
    emit();
  }

  function press(code: string) {
    if (skipFx()) return;
    if (CONTINUE_KEYS.includes(code)) {
      if (state.phase !== "turn") activate("continue");
    } else if (humanTurn()) {
      if (code === "KeyP") activate("pass");
      else if (code === "KeyL") activate("call");
      else if (code === "KeyC") humanSwapAll();
      else if (code === "KeyX") humanSwapOne();
      else if (state.widowOpen) {
        const own = OWN_KEYS.indexOf(code);
        const wid = WIDOW_KEYS.indexOf(code);
        if (own >= 0) {
          // Las teclas 1–5 son posiciones visuales, de izquierda a derecha.
          const k = visualToRules(order, state.seats[localSeat].hand, own);
          selOwn = selOwn === k ? null : k;
        }
        if (wid >= 0) selWidow = selWidow === wid ? null : wid;
      }
    }
    emit();
  }

  // Se puede reordenar la mano siempre que haya cartas, también fuera de turno.
  function canDrag(): boolean {
    const me = state.seats[localSeat];
    return (
      state.phase !== "draw" &&
      me.hand.length === HAND_SIZE &&
      (me.alive || state.phase === "final")
    );
  }

  function setPointer(x: number, y: number) {
    pointer = { x, y };
    // Al salir del canvas (-1) el arrastre, si lo hay, conserva su última posición.
    if (x >= 0) drag.move(x, y);
  }

  function pointerDown(x: number, y: number) {
    pointer = { x, y };
    if (!canDrag()) return;
    // Una carta que está en vuelo no se puede coger hasta que llegue.
    drag.down(
      x,
      y,
      ownRects(HAND_SIZE),
      (slot) => !fx.hidden.has(`own:${slot}`),
    );
  }

  function pointerUp(x: number, y: number) {
    setPointer(x, y);
    const release = drag.up();
    if (release?.kind === "drop") {
      if (release.from !== release.to) {
        order = moveCard(order, release.from, release.to);
      }
      emit();
      return;
    }
    // Sin arrastre, soltar es un clic (en una carta o en cualquier otro sitio).
    click();
  }

  function update(rawDt: number) {
    const dt = Math.min(Math.max(rawDt, 0), MAX_DT);
    fx.update(dt);
    drag.update(dt);
    if (state.phase === "turn" && state.current !== localSeat) {
      // Piensa mientras se anima la jugada anterior, pero no actúa hasta que termine.
      thinkTimer -= dt;
      if (thinkTimer <= 0 && !fx.isLocked()) cpuAct();
    }
    emit();
  }

  function statusText(): string {
    if (state.phase !== "turn") return "";
    if (state.caller !== null && myTurn()) {
      return `${seatName(state.caller)} llamó · última vuelta: cambia o pasa`;
    }
    if (myTurn()) {
      if (!state.widowOpen) {
        return "TU TURNO · viuda cerrada: cambia las 5 cartas, pasa o llama";
      }
      return "TU TURNO · viuda abierta: cambia las 5, o elige 1 carta tuya y 1 de la viuda";
    }
    const lastLap =
      state.caller !== null ? " (última vuelta tras la llamada)" : "";
    return `${seatName(state.current)} está pensando…${lastLap}`;
  }

  // Mensaje central de cada fase, derivado del estado de las reglas.
  function banner(): { lines: string[]; color: string } | null {
    const me = state.seats[localSeat];
    if (state.phase === "showdown" && fx.isLocked()) return null;
    if (state.phase === "draw") {
      const starter = state.seats[state.starter];
      return {
        lines: [
          `SORTEO: EMPIEZA ${seatName(state.starter)}`,
          "La carta más alta reparte el primer turno",
          `${seatName(state.starter)} sacó ${cardLabel(starter.drawCard as Card)}`,
        ],
        color: COLOR_YELLOW,
      };
    }
    if (state.phase === "showdown") {
      const losers = state.seats.flatMap((s, i) => (s.loser ? [i] : []));
      const calledBy =
        state.caller === null
          ? "Duelo"
          : `${seatName(state.caller)} ${state.caller === localSeat ? "llamaste" : "llamó"}`;
      return {
        lines: [
          `DUELO · PIERDE UNA VIDA: ${losers.map((i) => seatName(i)).join(", ")}`,
          calledBy,
          `Tu mano: ${me.caption}`,
        ],
        color: me.loser ? COLOR_MAGENTA : COLOR_GREEN,
      };
    }
    if (state.phase === "final") {
      return me.alive
        ? {
            lines: [
              "¡GANASTE LA VIUDA!",
              "Eres el último jugador con vida",
              `Puntuación: ${score}`,
            ],
            color: COLOR_GREEN,
          }
        : {
            lines: [
              "HAS SIDO ELIMINADO",
              "Te quedaste sin vidas",
              "Puntuación: 0",
            ],
            color: COLOR_MAGENTA,
          };
    }
    return null;
  }

  function draw(ctx: CanvasRenderingContext2D) {
    drawTable(ctx);
    const { phase } = state;

    // Paneles de las CPU.
    for (let i = 0; i < seatCount; i++) {
      if (i === localSeat) continue;
      const seat = state.seats[i];
      const rect = opponents[relativeSeat(i, localSeat, seatCount) - 1];
      // En el duelo, las manos se abren con la animación; hasta entonces siguen de dorso.
      const showHand =
        (phase === "showdown" && !fx.isLocked()) || phase === "final";
      const revealed = showdownRevealed();
      drawSeat(ctx, rect, {
        name: seatName(i),
        lives: livesShown(i),
        cardCount: seat.alive && phase !== "draw" ? HAND_SIZE : 0,
        hand:
          phase === "draw" && seat.drawCard
            ? [seat.drawCard]
            : showHand && seat.alive
              ? seat.hand
              : undefined,
        active: phase === "turn" && state.current === i,
        eliminated: !seat.alive,
        loser: seat.loser && phase === "showdown" && revealed,
        caption: revealed ? seat.caption : "",
        hiddenSlots: new Set(
          Array.from({ length: HAND_SIZE }, (_, k) => k).filter((k) =>
            fx.hidden.has(`seat:${i}:${k}`),
          ),
        ),
      });
    }

    // La viuda.
    drawText(ctx, "LA VIUDA", W / 2, WIDOW_Y - 30, {
      size: 13,
      bold: true,
      color: COLOR_DIM,
    });
    if (phase !== "draw") {
      drawCardRow(
        ctx,
        state.widow.map((c) => (state.widowOpen ? c : null)),
        widowRects(),
        state.widow.map((_, i) => ({
          selected: state.widowOpen && selWidow === i,
          hidden: fx.hidden.has(`widow:${i}`),
        })),
      );
    }

    // Tu mano.
    const me = state.seats[localSeat];
    if (phase === "draw" && me.drawCard) {
      drawCardRow(ctx, [me.drawCard], ownRects(1), [
        { hidden: fx.hidden.has("own:0") },
      ]);
    } else if (me.alive || phase === "final") {
      // La mano se dibuja en el orden visual; la carta arrastrada flota sobre la fila y
      // las vecinas se apartan para dejarle hueco.
      const indices = visualIndices(order, me.hand);
      const cards = indices.map((k) => me.hand[k]);
      const floating = drag.floating();
      const offsets = drag.offsets();
      const slotStep = CARD_W + CARD_GAP;
      const rects = ownRects(cards.length).map((r, v) => ({
        ...r,
        x: r.x + (offsets[v] ?? 0) * slotStep,
      }));
      const styles: CardStyle[] = cards.map((_, v) => ({
        selected: selOwn === indices[v],
        highlight:
          me.loser && phase === "showdown" && showdownRevealed()
            ? COLOR_MAGENTA
            : undefined,
        hidden: fx.hidden.has(`own:${v}`) || floating?.slot === v,
      }));
      drawCardRow(ctx, cards, rects, styles);
      if (floating && cards[floating.slot]) {
        drawCardPosed(
          ctx,
          cards[floating.slot],
          { w: CARD_W, h: CARD_H },
          {
            x: floating.x,
            y: floating.y,
            rot: 0,
            scale: floating.scale,
            flip: 1,
          },
          { highlight: floating.dragging ? COLOR_CYAN : undefined },
        );
      }
    }
    if (phase === "turn" || phase === "showdown") {
      drawText(
        ctx,
        me.caption && phase === "turn" ? `TÚ · ${me.caption}` : "TUS CARTAS",
        W / 2,
        HAND_Y - 26,
        { size: 12, color: COLOR_DIM },
      );
    }
    drawText(ctx, "TÚ", 70, HAND_Y + 30, {
      size: 14,
      bold: true,
      color: myTurn() ? COLOR_YELLOW : undefined,
    });
    drawLives(ctx, livesShown(localSeat), 70, HAND_Y + 54);
    drawText(ctx, `RONDA ${Math.max(state.round, 1)}`, W - 70, HAND_Y + 30, {
      size: 12,
      color: COLOR_DIM,
    });

    drawFlights(ctx, fx);
    drawEffects(ctx, fx);

    // Turno y jugadas: aro en el asiento activo, carteles, marca del llamador y última vuelta.
    if (phase === "turn") drawTurnPulse(ctx, seatPanel(state.current), fx.now);
    if (phase === "turn" && state.caller !== null) {
      drawLastLapBorder(ctx, fx.now);
      drawLastLap(ctx, W / 2, 176, fx.now);
    }
    drawBadges(ctx, fx, badgeAnchor);

    // Estado y mensajes.
    const status = statusText();
    if (status) {
      drawText(ctx, status, W / 2, WIDOW_Y + WIDOW_CARD_H + 28, {
        size: 13,
        color: myTurn() ? COLOR_YELLOW : COLOR_CYAN,
      });
    }
    const message = banner();
    if (message) drawBanner(ctx, message.lines, 360, message.color);

    // Botones.
    const views = buttons();
    const rects = buttonRowRects(views.length, BUTTON_Y);
    views.forEach((v, i) => {
      drawButton(ctx, rects[i], v.label, {
        color: v.color,
        disabled: v.disabled,
        hover: pointInRect(pointer.x, pointer.y, rects[i]),
      });
    });
  }

  function reset() {
    fx.reset();
    drag.cancel();
    state = newGame();
    order = initialOrder(state.seats[localSeat].hand);
    prevOrder = order;
    prevHand = state.seats[localSeat].hand;
    score = 0;
    gameOverEmitted = false;
    selOwn = null;
    selWidow = null;
    playSorteo();
    emit();
  }

  playSorteo();
  emit();

  return {
    update,
    draw,
    press,
    setPointer,
    pointerDown,
    pointerUp,
    pointerCancel() {
      drag.cancel();
    },
    click,
    reset,
    getSnapshot,
  };
}
