import { HAND_SIZE } from "../constants";
import {
  callScene,
  dealScene,
  passScene,
  showdownScene,
  swap1Moves,
  swap1Scene,
  swap5Moves,
  swap5Scene,
  widowFlipScene,
  type DealMove,
  type HeartBreak,
  type Reveal,
  type SwapLayout,
} from "../fx/scenes";
import { createTimeline, type Timeline } from "../fx/timeline";
import {
  initialOrder,
  reconcile,
  rulesToVisual,
  type HandOrder,
} from "../hand-order";
import type { Card } from "../types";
import {
  heartAnchor,
  onlineSeatCardRects,
  ownCardRects,
  rivalPanel,
  widowCardRects,
} from "./geometry";
import {
  publicEvents,
  type PrivateHand,
  type PublicEvent,
  type PublicTable,
} from "./protocol";

// Animaciones de la mesa en línea. Cada cliente anima por su cuenta lo que llega en
// `table.events`; no hay nada que sincronizar. Como en VS CPU, la mesa que se dibuja es
// siempre la más reciente y las animaciones son una capa encima: ocultan los huecos de las
// cartas en vuelo con `timeline.hidden`.

// Si un evento cambia mi mano, se espera a que llegue la mano nueva (va por otro canal).
// Pasado este tiempo se renuncia a animarlo y la mesa queda como llegó.
const HAND_WAIT_MS = 1500;

export interface TableFx {
  readonly tl: Timeline;
  // Llamar con cada mesa o mano nueva (es idempotente: repetir la misma no hace nada).
  ingest(
    table: PublicTable,
    hand: PrivateHand | null,
    playerId: string,
    nowMs: number,
  ): void;
  update(dtSeconds: number, nowMs: number): void;
  // Hay animación en curso o pendiente: el turno local y CONTINUAR esperan.
  isLocked(): boolean;
  // Se espera a mi mano nueva para empezar: la mesa oculta mi mano y la viuda mientras tanto.
  waiting(): boolean;
  skip(): void;
  reset(): void;
  // Orden visual de mi mano: local, no viaja por la red. Vuelve al de reparto cada ronda y,
  // con un cambio, la carta nueva ocupa el hueco de la que salió.
  order(): HandOrder;
  setOrder(order: HandOrder): void;
}

// Estado de la viuda antes de la transición de un evento.
interface Before {
  widow: (Card | null)[];
  widowOpen: boolean;
}

interface Queued {
  event: PublicEvent;
  seq: number; // seq de la mesa que lo trajo; mi mano debe ser posterior
  before: Before;
}

export function createTableFx(): TableFx {
  const tl = createTimeline();

  let ready = false; // ya hubo una primera mesa: lo anterior no se anima
  let lastN = 0;
  let queue: Queued[] = [];
  let waitingSince: number | null = null;
  let table: PublicTable | null = null;
  let prevTable: PublicTable | null = null;
  let hand: PrivateHand | null = null;
  let prevHand: PrivateHand | null = null;
  let playerId = "";
  let prevPhase: PublicTable["phase"] | null = null;
  // Orden visual de mi mano y el de antes de la última mano recibida (de dónde salen las cartas).
  let order: HandOrder = { keys: [] };
  let prevOrder: HandOrder = order;
  // Vidas de cada jugador antes del duelo, para saber a quién se le rompe un corazón.
  let livesBefore = new Map<string, number>();

  function fullReset() {
    tl.reset();
    ready = false;
    lastN = 0;
    queue = [];
    waitingSince = null;
    prevTable = null;
    prevHand = null;
    prevPhase = null;
    livesBefore = new Map();
    order = { keys: [] };
    prevOrder = order;
  }

  const localIndexOf = (t: PublicTable) =>
    Math.max(
      0,
      t.seats.findIndex((s) => s.playerId === playerId),
    );

  // Dónde están las cartas de un asiento y las de la viuda.
  function layoutOf(t: PublicTable, localIndex: number, i: number): SwapLayout {
    const widow = widowCardRects();
    const widowSlot = (k: number) => ({ key: `widow:${k}`, rect: widow[k] });
    if (i === localIndex) {
      // Los huecos de mi mano se numeran por posición visual: es lo que se dibuja.
      const own = ownCardRects();
      const slotAt = (k: number, ord: HandOrder, cards: readonly Card[]) => {
        const v = rulesToVisual(ord, cards, k);
        return { key: `own:${v}`, rect: own[v] };
      };
      return {
        seatUp: true,
        seatSlot: (k) => slotAt(k, order, hand?.hand ?? []),
        seatSlotOut: (k) => slotAt(k, prevOrder, prevHand?.hand ?? []),
        widowSlot,
      };
    }
    const cards = onlineSeatCardRects(
      rivalPanel(t.seats.length, localIndex, i),
      HAND_SIZE,
      false,
    );
    return {
      seatUp: false,
      seatSlot: (k) => ({ key: `seat:${i}:${k}`, rect: cards[k] }),
      widowSlot,
    };
  }

  // Sorteo inicial: la carta de cada jugador sale del mazo y se queda de cara.
  function playSorteo(t: PublicTable) {
    const localIndex = localIndexOf(t);
    const moves: DealMove[] = [];
    t.seats.forEach((seat, i) => {
      const card = seat.hand?.[0];
      if (!card) return;
      const rect =
        i === localIndex
          ? ownCardRects(1)[0]
          : onlineSeatCardRects(
              rivalPanel(t.seats.length, localIndex, i),
              1,
              true,
            )[0];
      const key = i === localIndex ? "own:0" : `seat:${i}:0`;
      moves.push({ card, to: { key, rect }, toUp: true, order: moves.length });
    });
    if (moves.length > 0) tl.enqueue(dealScene(moves));
  }

  function needsMyHand(q: Queued): boolean {
    const me = table?.seats.find((s) => s.playerId === playerId);
    if (!me?.alive) return false;
    const e = q.event;
    if (e.kind === "deal") return true;
    return (
      (e.kind === "swap1" || e.kind === "swap5") && e.playerId === playerId
    );
  }

  function play(q: Queued) {
    const t = table;
    if (!t) return;
    const e = q.event;
    const count = t.seats.length;
    const localIndex = localIndexOf(t);
    const seatIndex = (id: string) =>
      t.seats.findIndex((s) => s.playerId === id);
    const blanks = Array.from({ length: HAND_SIZE }, () => null);

    switch (e.kind) {
      case "deal": {
        // Ronda nueva: mi mano vuelve al orden de reparto.
        if (hand) order = initialOrder(hand.hand);
        prevOrder = order;
        // Reparto por rondas empezando por quien abre; la viuda va al final.
        const layouts = t.seats.map((_, i) => layoutOf(t, localIndex, i));
        const first = Math.max(
          0,
          t.seats.findIndex((s) => s.playerId === t.turnPlayerId),
        );
        const moves: DealMove[] = [];
        for (let k = 0; k < HAND_SIZE; k++) {
          for (let n = 0; n < count; n++) {
            const i = (first + n) % count;
            if (!t.seats[i].alive) continue;
            moves.push({
              card: i === localIndex ? (hand?.hand[k] ?? null) : null,
              to: layouts[i].seatSlot(k),
              toUp: layouts[i].seatUp,
              order: moves.length,
            });
          }
        }
        for (let k = 0; k < HAND_SIZE; k++) {
          moves.push({
            card: null,
            to: layouts[localIndex].widowSlot(k),
            toUp: false,
            order: moves.length,
          });
        }
        tl.enqueue(dealScene(moves));
        break;
      }
      case "pass": {
        const i = seatIndex(e.playerId);
        if (i < 0) break;
        tl.enqueue(passScene(i, i === localIndex ? "PASO" : "PASA"));
        // Si con este paso se cerró la vuelta, la viuda se abre sola: se voltea en su sitio.
        if (!q.before.widowOpen && t.widowOpen) {
          const widow = widowCardRects();
          tl.enqueue(
            widowFlipScene(
              widow.map((rect, k) => ({ key: `widow:${k}`, rect })),
              t.widow,
            ),
          );
        }
        break;
      }
      case "call": {
        const i = seatIndex(e.playerId);
        if (i < 0) break;
        const mine = i === localIndex;
        tl.enqueue(
          callScene(
            i,
            mine ? "¡LLAMO!" : "¡LLAMA!",
            mine ? "LLAMASTE" : "LLAMÓ",
          ),
        );
        break;
      }
      case "swap1": {
        const i = seatIndex(e.playerId);
        if (i < 0) break;
        const mine = i === localIndex;
        // La carta que llega al asiento venía de la viuda (abierta, así que se conocía);
        // la que llega a la viuda la ve ahora todo el mundo.
        const handCard = mine
          ? (hand?.hand[e.handIndex] ?? null)
          : (q.before.widow[e.widowIndex] ?? null);
        const widowCard = mine
          ? (prevHand?.hand[e.handIndex] ?? null)
          : (t.widow[e.widowIndex] ?? null);
        tl.enqueue(
          swap1Scene(
            swap1Moves(
              layoutOf(t, localIndex, i),
              e.handIndex,
              e.widowIndex,
              handCard,
              widowCard,
            ),
          ),
        );
        break;
      }
      case "swap5": {
        const i = seatIndex(e.playerId);
        if (i < 0) break;
        const mine = i === localIndex;
        // Solo yo conozco las cartas que tomo de una viuda cerrada.
        const newHand = mine ? (hand?.hand ?? blanks) : q.before.widow;
        tl.enqueue(
          swap5Scene(
            swap5Moves(
              layoutOf(t, localIndex, i),
              newHand,
              t.widow,
              q.before.widowOpen,
            ),
          ),
        );
        break;
      }
      case "showdown": {
        // Las manos rivales se voltean; los corazones perdidos se rompen al terminar.
        const reveals: Reveal[] = [];
        t.seats.forEach((seat, i) => {
          if (i === localIndex || !seat.alive || !seat.hand) return;
          const panel = rivalPanel(count, localIndex, i);
          const n = seat.hand.length;
          const back = onlineSeatCardRects(panel, n, false);
          const face = onlineSeatCardRects(panel, n, true);
          seat.hand.forEach((card, k) => {
            const key = `seat:${i}:${k}`;
            reveals.push({
              card,
              from: { key, rect: back[k] },
              to: { key, rect: face[k] },
              order: reveals.length,
            });
          });
        });
        const hearts: HeartBreak[] = t.seats.flatMap((seat, i) =>
          seat.lives < (livesBefore.get(seat.playerId) ?? seat.lives)
            ? [{ seat: i, ...heartAnchor(count, localIndex, i, seat.lives) }]
            : [],
        );
        tl.enqueue(showdownScene(reveals, hearts));
        break;
      }
    }
  }

  // Reproduce los eventos en cola. Los que cambian mi mano esperan a que llegue.
  function drain(nowMs: number) {
    while (queue.length > 0) {
      const q = queue[0];
      if (needsMyHand(q) && !(hand && hand.seq > q.seq)) {
        waitingSince ??= nowMs;
        if (nowMs - waitingSince < HAND_WAIT_MS) return;
        // La mano no llegó a tiempo: este evento no se anima.
        queue.shift();
        waitingSince = null;
        continue;
      }
      waitingSince = null;
      queue.shift();
      play(q);
    }
  }

  return {
    tl,
    ingest(t, h, id, nowMs) {
      playerId = id;
      if (t.phase === "waiting") {
        // Sala de espera (o revancha): se empieza de cero.
        fullReset();
        table = t;
        hand = h;
        prevPhase = "waiting";
        return;
      }
      if (t !== table) {
        prevTable = table;
        table = t;
      }
      if (h !== hand) {
        prevHand = hand;
        hand = h;
        // Mano nueva: las cartas que siguen conservan su sitio y la nueva ocupa el hueco libre.
        prevOrder = order;
        if (h) order = reconcile(order, h.hand);
      }

      const events = publicEvents(t).sort((a, b) => a.n - b.n);
      if (!ready) {
        // Primera mesa que veo (o tras volver): lo anterior no se anima.
        lastN = Math.max(lastN, ...events.map((e) => e.n));
        ready = true;
      } else {
        const before: Before = {
          widow: [...(prevTable?.widow ?? t.widow)],
          widowOpen: prevTable?.widowOpen ?? t.widowOpen,
        };
        for (const event of events) {
          if (event.n <= lastN) continue;
          lastN = event.n;
          queue.push({ event, seq: t.seq, before });
        }
      }

      if (t.phase === "draw" && prevPhase !== "draw") playSorteo(t);
      prevPhase = t.phase;
      if (t.phase === "draw" || t.phase === "turn") {
        livesBefore = new Map(t.seats.map((s) => [s.playerId, s.lives]));
      }
      drain(nowMs);
    },
    update(dtSeconds, nowMs) {
      tl.update(dtSeconds);
      drain(nowMs);
    },
    isLocked() {
      return tl.isLocked() || waitingSince !== null;
    },
    waiting() {
      return waitingSince !== null;
    },
    skip() {
      queue = [];
      waitingSince = null;
      tl.skip();
    },
    reset: fullReset,
    order() {
      return order;
    },
    setOrder(next) {
      order = next;
    },
  };
}
