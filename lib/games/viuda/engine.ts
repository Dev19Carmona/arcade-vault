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
  drawCardRow,
  drawLives,
  drawSeat,
  drawTable,
  drawText,
  pointInRect,
  type CardStyle,
} from "./entities";
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
    state = result.state;
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

  function humanTurn(): boolean {
    return state.phase === "turn" && state.current === localSeat;
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

  function buttons(): ButtonView[] {
    if (state.phase !== "turn") {
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

  function click() {
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
      ownRects().forEach((r, i) => {
        if (pointInRect(x, y, r)) selOwn = selOwn === i ? null : i;
      });
      widowRects().forEach((r, i) => {
        if (pointInRect(x, y, r)) selWidow = selWidow === i ? null : i;
      });
    }
    emit();
  }

  function press(code: string) {
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
        if (own >= 0) selOwn = selOwn === own ? null : own;
        if (wid >= 0) selWidow = selWidow === wid ? null : wid;
      }
    }
    emit();
  }

  function update(rawDt: number) {
    const dt = Math.min(Math.max(rawDt, 0), MAX_DT);
    if (state.phase === "turn" && state.current !== localSeat) {
      thinkTimer -= dt;
      if (thinkTimer <= 0) cpuAct();
    }
    emit();
  }

  function statusText(): string {
    if (state.phase !== "turn") return "";
    if (state.caller !== null && humanTurn()) {
      return `${seatName(state.caller)} llamó · última vuelta: cambia o pasa`;
    }
    if (humanTurn()) {
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
      const showHand = phase === "showdown" || phase === "final";
      drawSeat(ctx, rect, {
        name: seatName(i),
        lives: seat.lives,
        cardCount: seat.alive && phase !== "draw" ? HAND_SIZE : 0,
        hand:
          phase === "draw" && seat.drawCard
            ? [seat.drawCard]
            : showHand && seat.alive
              ? seat.hand
              : undefined,
        active: phase === "turn" && state.current === i,
        eliminated: !seat.alive,
        loser: seat.loser && phase === "showdown",
        caption: seat.caption,
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
        })),
      );
    }

    // Tu mano.
    const me = state.seats[localSeat];
    if (phase === "draw" && me.drawCard) {
      drawCardRow(ctx, [me.drawCard], ownRects(1));
    } else if (me.alive || phase === "final") {
      const styles: CardStyle[] = me.hand.map((_, i) => ({
        selected: selOwn === i,
        highlight: me.loser && phase === "showdown" ? COLOR_MAGENTA : undefined,
      }));
      drawCardRow(ctx, me.hand, ownRects(me.hand.length), styles);
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
      color: humanTurn() ? COLOR_YELLOW : undefined,
    });
    drawLives(ctx, me.lives, 70, HAND_Y + 54);
    drawText(ctx, `RONDA ${Math.max(state.round, 1)}`, W - 70, HAND_Y + 30, {
      size: 12,
      color: COLOR_DIM,
    });

    // Estado y mensajes.
    const status = statusText();
    if (status) {
      drawText(ctx, status, W / 2, WIDOW_Y + WIDOW_CARD_H + 28, {
        size: 13,
        color: humanTurn() ? COLOR_YELLOW : COLOR_CYAN,
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
    state = newGame();
    score = 0;
    gameOverEmitted = false;
    selOwn = null;
    selWidow = null;
    emit();
  }

  emit();

  return {
    update,
    draw,
    press,
    setPointer(x, y) {
      pointer = { x, y };
    },
    click,
    reset,
    getSnapshot,
  };
}
