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
  HAND_NAMES,
  HAND_SIZE,
  HAND_Y,
  HUMAN_SEAT,
  LIVES,
  MAX_DT,
  SEAT_H,
  SEAT_POSITIONS,
  SEAT_W,
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
import type {
  Card,
  Rect,
  ViudaEngine,
  ViudaEngineOptions,
  ViudaSnapshot,
} from "./types";
import {
  cardLabel,
  compareDrawCards,
  compareHands,
  createDeck,
  evaluateHand,
  finalScore,
  shuffle,
} from "./utils";

type Phase = "draw" | "turn" | "showdown" | "final";
type ButtonId = "continue" | "swap" | "pass" | "call";

interface Seat {
  lives: number;
  alive: boolean;
  hand: Card[];
  drawCard: Card | null; // carta del sorteo inicial
  caption: string;
  loser: boolean;
}

interface ButtonView {
  id: ButtonId;
  label: string;
  color: string;
  disabled: boolean;
}

const SEAT_NAMES = ["TÚ", "CPU 1", "CPU 2", "CPU 3"];
const OWN_KEYS = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"];
const WIDOW_KEYS = ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT"];
const CONTINUE_KEYS = ["Space", "Enter", "NumpadEnter"];

// Valor continuo de una mano para decidir de las CPU: categoría + carta principal.
function handScore(cards: readonly Card[]): number {
  const { category, tiebreak } = evaluateHand(cards);
  return category + tiebreak[0] / 20;
}

export function createViudaEngine({
  onChange,
  onGameOver,
}: ViudaEngineOptions): ViudaEngine {
  let seats: Seat[] = [];
  let widow: Card[] = [];
  let widowOpen = false;
  let phase: Phase = "draw";
  let round = 0;
  let starter = 0;
  let current = 0;
  let nextStarter = 0;
  let lap = 1;
  let actionsInLap = 0;
  let caller: number | null = null;
  let thinkTimer = 0;
  let selOwn: number | null = null;
  let selWidow: number | null = null;
  let score = 0;
  let gameOverEmitted = false;
  let pointer = { x: -1, y: -1 };
  let banner: { lines: string[]; color: string } | null = null;
  let last: ViudaSnapshot | null = null;

  const random = () => Math.random();

  function getSnapshot(): ViudaSnapshot {
    return {
      score,
      lives: seats[HUMAN_SEAT]?.lives ?? LIVES,
      round,
      rivals: seats.filter((s, i) => i !== HUMAN_SEAT && s.alive).length,
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

  function aliveSeats(): number[] {
    return seats.flatMap((s, i) => (s.alive ? [i] : []));
  }

  // Siguiente asiento vivo en sentido horario (0 → 1 → 2 → 3).
  function nextAlive(from: number): number {
    for (let step = 1; step <= SEATS; step++) {
      const i = (from + step) % SEATS;
      if (seats[i].alive) return i;
    }
    return from;
  }

  function scheduleThink() {
    thinkTimer = CPU_THINK_MIN + random() * (CPU_THINK_MAX - CPU_THINK_MIN);
  }

  function startDraw() {
    phase = "draw";
    const deck = shuffle(createDeck(), random);
    let best = -1;
    let k = 0;
    seats.forEach((seat, i) => {
      if (!seat.alive) return;
      seat.drawCard = deck[k++];
      if (
        best < 0 ||
        compareDrawCards(seat.drawCard, seats[best].drawCard as Card) > 0
      )
        best = i;
    });
    starter = best;
    banner = {
      lines: [
        `SORTEO: EMPIEZA ${SEAT_NAMES[starter]}`,
        "La carta más alta reparte el primer turno",
        `${SEAT_NAMES[starter]} sacó ${cardLabel(seats[starter].drawCard as Card)}`,
      ],
      color: COLOR_YELLOW,
    };
  }

  function startRound(first: number) {
    round++;
    const deck = shuffle(createDeck(), random);
    let k = 0;
    for (const seat of seats) {
      seat.drawCard = null;
      seat.caption = "";
      seat.loser = false;
      seat.hand = seat.alive ? deck.slice(k, (k += HAND_SIZE)) : [];
    }
    widow = deck.slice(k, k + HAND_SIZE);
    widowOpen = false;
    caller = null;
    lap = 1;
    actionsInLap = 0;
    starter = first;
    current = first;
    selOwn = null;
    selWidow = null;
    banner = null;
    phase = "turn";
    scheduleThink();
  }

  function startShowdown() {
    const alive = aliveSeats();
    const values = new Map(alive.map((i) => [i, evaluateHand(seats[i].hand)]));
    let worst = alive[0];
    for (const i of alive) {
      if (compareHands(values.get(i)!, values.get(worst)!) < 0) worst = i;
    }
    const losers = alive.filter(
      (i) => compareHands(values.get(i)!, values.get(worst)!) === 0,
    );
    for (const i of alive) {
      seats[i].caption = HAND_NAMES[values.get(i)!.category];
      seats[i].loser = losers.includes(i);
      if (seats[i].loser) seats[i].lives--;
    }

    // Empieza la siguiente ronda quien perdió vida (el primero en orden desde el actual).
    let first = starter;
    for (let step = 0; step < SEATS; step++) {
      const i = (starter + step) % SEATS;
      if (losers.includes(i)) {
        first = i;
        break;
      }
    }
    nextStarter = first;

    const calledBy =
      caller === null
        ? "Nadie llamó: duelo tras dos vueltas"
        : `${SEAT_NAMES[caller]} ${caller === HUMAN_SEAT ? "llamaste" : "llamó"}`;
    const loserNames = losers.map((i) => SEAT_NAMES[i]).join(", ");
    banner = {
      lines: [
        `DUELO · PIERDE UNA VIDA: ${loserNames}`,
        calledBy,
        `Tu mano: ${seats[HUMAN_SEAT].caption}`,
      ],
      color: losers.includes(HUMAN_SEAT) ? COLOR_MAGENTA : COLOR_GREEN,
    };
    phase = "showdown";
    selOwn = null;
    selWidow = null;
  }

  function startFinal(victory: boolean) {
    score = finalScore(victory, SEATS - 1, seats[HUMAN_SEAT].lives);
    phase = "final";
    banner = victory
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

  function resolveShowdown() {
    for (const seat of seats) {
      if (seat.lives <= 0) seat.alive = false;
    }
    if (!seats[HUMAN_SEAT].alive) {
      startFinal(false);
    } else if (aliveSeats().length === 1) {
      startFinal(true);
    } else {
      const first = seats[nextStarter].alive
        ? nextStarter
        : nextAlive(nextStarter);
      startRound(first);
    }
  }

  function endTurn() {
    selOwn = null;
    selWidow = null;
    actionsInLap++;
    if (actionsInLap >= aliveSeats().length) {
      if (lap === 1) {
        // Nadie llamó en la primera vuelta: se abre la viuda y vuelve a empezar quien abrió.
        lap = 2;
        actionsInLap = 0;
        widowOpen = true;
        current = starter;
        for (const seat of seats) seat.caption = "";
      } else {
        startShowdown();
        return;
      }
    } else {
      current = nextAlive(current);
    }
    scheduleThink();
  }

  function doPass(seat: number) {
    seats[seat].caption = "PASO";
    endTurn();
  }

  function doCall(seat: number) {
    seats[seat].caption = "LLAMO";
    caller = seat;
    startShowdown();
  }

  function doSwapAll(seat: number) {
    const own = seats[seat].hand;
    seats[seat].hand = widow;
    widow = own;
    widowOpen = true;
    seats[seat].caption = "CAMBIÓ 5";
    endTurn();
  }

  function doSwapOne(seat: number, own: number, wid: number) {
    const hand = seats[seat].hand;
    [hand[own], widow[wid]] = [widow[wid], hand[own]];
    seats[seat].caption = "CAMBIÓ 1";
    endTurn();
  }

  // Mejor cambio de una carta con la viuda abierta: devuelve la mejora de valor.
  function bestSingleSwap(hand: readonly Card[]) {
    const base = handScore(hand);
    let best = { gain: 0, own: 0, wid: 0 };
    for (let i = 0; i < HAND_SIZE; i++) {
      for (let j = 0; j < HAND_SIZE; j++) {
        const trial = hand.map((c, k) => (k === i ? widow[j] : c));
        const gain = handScore(trial) - base;
        if (gain > best.gain) best = { gain, own: i, wid: j };
      }
    }
    return best;
  }

  function cpuAct() {
    const seat = current;
    const hand = seats[seat].hand;
    const value = handScore(hand);
    const others = aliveSeats().length;
    // Con menos rivales vivos se llama con menos; un poco de ruido para no ser predecible.
    const threshold = 2.1 - (SEATS - others) * 0.25 + (random() - 0.5) * 0.4;

    if (value >= threshold) {
      doCall(seat);
      return;
    }
    if (lap === 1) {
      if (widowOpen) {
        // Las cartas de la viuda son conocidas: se cambia solo si mejoran la mano.
        if (handScore(widow) > value + 0.3) doSwapAll(seat);
        else doPass(seat);
      } else if (value < 1.1 && random() < 0.75) {
        doSwapAll(seat);
      } else {
        doPass(seat);
      }
      return;
    }
    const swap = bestSingleSwap(hand);
    if (swap.gain > 0.15) doSwapOne(seat, swap.own, swap.wid);
    else doPass(seat);
  }

  function humanTurn(): boolean {
    return phase === "turn" && current === HUMAN_SEAT;
  }

  function humanSwap() {
    if (!humanTurn()) return;
    if (lap === 1) {
      doSwapAll(HUMAN_SEAT);
    } else if (selOwn !== null && selWidow !== null) {
      doSwapOne(HUMAN_SEAT, selOwn, selWidow);
    }
  }

  function activate(id: ButtonId) {
    if (id === "continue") {
      if (phase === "draw") startRound(starter);
      else if (phase === "showdown") resolveShowdown();
      else if (phase === "final" && !gameOverEmitted) {
        gameOverEmitted = true;
        emit();
        onGameOver(score);
      }
    } else if (humanTurn()) {
      if (id === "pass") doPass(HUMAN_SEAT);
      else if (id === "call") doCall(HUMAN_SEAT);
      else humanSwap();
    }
  }

  function buttons(): ButtonView[] {
    if (phase !== "turn") {
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
    const swapReady = lap === 1 || (selOwn !== null && selWidow !== null);
    return [
      {
        id: "swap",
        label: lap === 1 ? "CAMBIAR 5 [C]" : "CAMBIAR 1 [C]",
        color: COLOR_CYAN,
        disabled: !swapReady,
      },
      { id: "pass", label: "PASO [P]", color: COLOR_YELLOW, disabled: false },
      { id: "call", label: "LLAMO [L]", color: COLOR_MAGENTA, disabled: false },
    ];
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
    // En la segunda vuelta se eligen una carta propia y una de la viuda.
    if (humanTurn() && lap === 2) {
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
      if (phase !== "turn") activate("continue");
    } else if (humanTurn()) {
      if (code === "KeyP") activate("pass");
      else if (code === "KeyL") activate("call");
      else if (code === "KeyC") humanSwap();
      else if (lap === 2) {
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
    if (phase === "turn" && current !== HUMAN_SEAT) {
      thinkTimer -= dt;
      if (thinkTimer <= 0) cpuAct();
    }
    emit();
  }

  function statusText(): string {
    if (phase !== "turn") return "";
    if (humanTurn()) {
      return lap === 1
        ? "TU TURNO · cambia las 5 cartas, pasa o llama"
        : "TU TURNO · viuda abierta: elige 1 carta tuya y 1 de la viuda";
    }
    return `${SEAT_NAMES[current]} está pensando…`;
  }

  function draw(ctx: CanvasRenderingContext2D) {
    drawTable(ctx);

    // Paneles de las CPU.
    for (let i = 1; i < SEATS; i++) {
      const seat = seats[i];
      const pos = SEAT_POSITIONS[i];
      const showHand = phase === "showdown" || phase === "final";
      drawSeat(
        ctx,
        { x: pos.x, y: pos.y, w: SEAT_W, h: SEAT_H },
        {
          name: SEAT_NAMES[i],
          lives: seat.lives,
          cardCount: seat.alive && phase !== "draw" ? HAND_SIZE : 0,
          hand:
            phase === "draw" && seat.drawCard
              ? [seat.drawCard]
              : showHand && seat.alive
                ? seat.hand
                : undefined,
          active: phase === "turn" && current === i,
          eliminated: !seat.alive,
          loser: seat.loser && phase === "showdown",
          caption: seat.caption,
        },
      );
    }

    // La viuda.
    drawText(ctx, "LA VIUDA", W / 2, WIDOW_Y - 18, {
      size: 13,
      bold: true,
      color: COLOR_DIM,
    });
    if (phase !== "draw") {
      drawCardRow(
        ctx,
        widow.map((c) => (widowOpen ? c : null)),
        widowRects(),
      );
    }

    // Tu mano.
    const me = seats[HUMAN_SEAT];
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
    drawText(ctx, `RONDA ${Math.max(round, 1)}`, W - 70, HAND_Y + 30, {
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
    if (banner) drawBanner(ctx, banner.lines, 360, banner.color);

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
    seats = Array.from({ length: SEATS }, () => ({
      lives: LIVES,
      alive: true,
      hand: [],
      drawCard: null,
      caption: "",
      loser: false,
    }));
    widow = [];
    widowOpen = false;
    round = 0;
    score = 0;
    gameOverEmitted = false;
    caller = null;
    selOwn = null;
    selWidow = null;
    startDraw();
    emit();
  }

  reset();

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
