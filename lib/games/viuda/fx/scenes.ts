import {
  CARD_W,
  FX_CALL_MS,
  FX_COLOR_CALL,
  FX_COLOR_HIGHLIGHT,
  FX_COLOR_PASS,
  FX_DEAL_FLIGHT_MS,
  FX_DEAL_MS,
  FX_FLIGHT_MS,
  FX_FLIP_MS,
  FX_HEART_MS,
  FX_HIGHLIGHT_MS,
  FX_PASS_MS,
  FX_REVEAL_MS,
  FX_SHOWDOWN_MS,
  FX_STAGGER_MS,
  FX_SWAP1_MS,
  FX_SWAP5_MS,
  FX_TAG_MS,
  HAND_SIZE,
  W,
  WIDOW_CARD_H,
  WIDOW_Y,
} from "../constants";
import { poseOf } from "../entities";
import type { Card, Rect } from "../types";
import type { Pose, Scene } from "./timeline";

// De un evento de juego a lo que se anima. Solo geometría y tiempos: no conoce el
// motor ni la red, así que sirve igual para VS CPU y para la mesa en línea.

// Un hueco donde cabe una carta (de una mano, de un asiento o de la viuda).
export interface Slot {
  key: string; // identifica el hueco en Timeline.hidden, p. ej. "widow:3"
  rect: Rect;
}

// Una carta que viaja de un hueco a otro. `card` null = no se conoce (dorso siempre).
// `fromUp` / `toUp` dicen si se ve de cara en cada extremo; si cambian, se voltea.
export interface Move {
  card: Card | null;
  from: Slot;
  fromUp: boolean;
  to: Slot;
  toUp: boolean;
  order: number; // posición en el escalonado
}

// Dónde están, para un asiento concreto, sus cartas y las de la viuda.
export interface SwapLayout {
  seatSlot: (k: number) => Slot;
  // Hueco de las cartas que salen, si difiere de `seatSlot` (la mano propia reordenada:
  // salen de donde estaban y las nuevas entran en el orden nuevo).
  seatSlotOut?: (k: number) => Slot;
  seatUp: boolean; // las cartas del asiento se ven de cara (el jugador local)
  widowSlot: (k: number) => Slot;
}

// Las poses se escalan respecto al tamaño de la carta de la mano propia.
function slotPose(rect: Rect, up: boolean): Pose {
  return { ...poseOf(rect, up ? 1 : 0), scale: rect.w / CARD_W };
}

// Las dos cartas de un CAMBIAR 1. `handCard` es la que queda ahora en el asiento (venía
// de la viuda) y `widowCard` la que queda en la viuda (venía del asiento).
export function swap1Moves(
  layout: SwapLayout,
  handIndex: number,
  widowIndex: number,
  handCard: Card | null,
  widowCard: Card | null,
): Move[] {
  const seat = layout.seatSlot(handIndex);
  const seatOut = layout.seatSlotOut?.(handIndex) ?? seat;
  const widow = layout.widowSlot(widowIndex);
  return [
    {
      card: widowCard,
      from: seatOut,
      fromUp: layout.seatUp,
      to: widow,
      toUp: true, // CAMBIAR 1 solo existe con la viuda abierta
      order: 0,
    },
    {
      card: handCard,
      from: widow,
      fromUp: true,
      to: seat,
      toUp: layout.seatUp,
      order: 1,
    },
  ];
}

// Las 10 cartas de un CAMBIAR 5. `newHand` y `newWidow` son las listas ya cambiadas.
// Si la viuda estaba cerrada, sus cartas salen de dorso y llegan de cara a la mano
// propia; las que van a la viuda la abren, así que llegan de cara.
export function swap5Moves(
  layout: SwapLayout,
  newHand: readonly (Card | null)[],
  newWidow: readonly (Card | null)[],
  widowWasOpen: boolean,
): Move[] {
  const moves: Move[] = [];
  for (let k = 0; k < HAND_SIZE; k++) {
    moves.push(
      {
        card: newWidow[k],
        from: (layout.seatSlotOut ?? layout.seatSlot)(k),
        fromUp: layout.seatUp,
        to: layout.widowSlot(k),
        toUp: true,
        order: k,
      },
      {
        card: newHand[k],
        from: layout.widowSlot(k),
        fromUp: widowWasOpen,
        to: layout.seatSlot(k),
        toUp: layout.seatUp,
        order: k,
      },
    );
  }
  return moves;
}

// Cada carta pasa por tres tramos: espera resaltada en su origen, vuelo y reposo
// resaltado en su destino. Todo cabe en `dur` (acelerado si hay cola).
export function moveScene(moves: readonly Move[], dur: number): Scene {
  return {
    dur,
    run(tl, at, speed) {
      const k = 1 / speed;
      const hold = FX_HIGHLIGHT_MS * k;
      const flight = FX_FLIGHT_MS * k;
      const stagger = FX_STAGGER_MS * k;
      const end = at + dur * k;

      for (const m of moves) {
        const start = at + hold + m.order * stagger;
        const hide = [m.from.key, m.to.key];
        const origin = slotPose(m.from.rect, m.fromUp);
        const target = slotPose(m.to.rect, m.toUp);
        const highlight = FX_COLOR_HIGHLIGHT;

        tl.addFlight({
          card: m.card,
          from: origin,
          to: origin,
          start: at,
          dur: start - at,
          hide,
          highlight,
        });
        tl.addFlight({
          card: m.card,
          from: origin,
          to: target,
          start,
          dur: flight,
          hide,
        });
        if (end > start + flight) {
          tl.addFlight({
            card: m.card,
            from: target,
            to: target,
            start: start + flight,
            dur: end - (start + flight),
            hide,
            highlight,
          });
        }
      }
    },
  };
}

// Cartel breve sobre el asiento que pasa. Discreto: sin rebote ni aro.
export function passScene(seat: number, text: string): Scene {
  return {
    dur: FX_PASS_MS,
    run(tl, at, speed) {
      tl.addBadge({
        seat,
        text,
        color: FX_COLOR_PASS,
        start: at,
        dur: FX_PASS_MS / speed,
      });
    },
  };
}

// LLAMO es la jugada fuerte: cartel grande con rebote y aro, y una marca persistente
// en el asiento del llamador que se queda hasta que se muestren las manos.
export function callScene(seat: number, text: string, tag: string): Scene {
  return {
    dur: FX_CALL_MS,
    run(tl, at, speed) {
      tl.addBadge({
        seat,
        text,
        color: FX_COLOR_CALL,
        start: at,
        dur: FX_CALL_MS / speed,
        strong: true,
      });
      tl.addBadge({
        seat,
        text: tag,
        color: FX_COLOR_CALL,
        start: at,
        dur: FX_TAG_MS / speed,
        sticky: true,
      });
    },
  };
}

// La viuda se abre sin que nadie la toque (todos pasaron): sus cartas se voltean en su sitio.
export function widowFlipScene(
  slots: readonly Slot[],
  cards: readonly (Card | null)[],
): Scene {
  const dur = FX_FLIP_MS + (slots.length - 1) * FX_STAGGER_MS;
  return {
    dur,
    run(tl, at, speed) {
      slots.forEach((slot, i) => {
        tl.addFlight({
          card: cards[i],
          from: slotPose(slot.rect, false),
          to: slotPose(slot.rect, true),
          start: at + (i * FX_STAGGER_MS) / speed,
          dur: FX_FLIP_MS / speed,
          hide: [slot.key],
        });
      });
    },
  };
}

// El mazo del reparto: centro de la mesa, boca abajo y algo más pequeño que una carta.
const deck = (): Pose => ({
  x: W / 2,
  y: WIDOW_Y + WIDOW_CARD_H / 2,
  rot: 0,
  scale: 0.65,
  flip: 0,
});

// Una carta que sale del mazo hacia un hueco. `toUp`: se ve de cara al llegar (mano propia
// y sorteo); `card` null si no se conoce. `order` es el turno de reparto.
export interface DealMove {
  card: Card | null;
  to: Slot;
  toUp: boolean;
  order: number;
}

// Reparto escalonado desde el mazo: cada carta vuela y se queda en su hueco hasta el final.
// Con pocas cartas (el sorteo) dura menos que con una ronda completa.
export function dealScene(moves: readonly DealMove[]): Scene {
  const count = moves.length;
  const dur = Math.min(
    FX_DEAL_MS,
    FX_DEAL_FLIGHT_MS + Math.max(count - 1, 0) * FX_STAGGER_MS,
  );
  const last = Math.max(1, ...moves.map((m) => m.order));
  return {
    dur,
    run(tl, at, speed) {
      const k = 1 / speed;
      const flight = FX_DEAL_FLIGHT_MS * k;
      const end = at + dur * k;
      const step = (dur * k - flight) / last;
      for (const m of moves) {
        const start = at + m.order * step;
        const target = slotPose(m.to.rect, m.toUp);
        const hide = [m.to.key];
        tl.addFlight({
          card: m.card,
          from: deck(),
          to: target,
          start,
          dur: flight,
          hide,
        });
        if (end > start + flight) {
          tl.addFlight({
            card: m.card,
            from: target,
            to: target,
            start: start + flight,
            dur: end - (start + flight),
            hide,
          });
        }
      }
    },
  };
}

// Una mano rival que se voltea en el duelo: de dorsos solapados a cartas abiertas.
export interface Reveal {
  card: Card | null;
  from: Slot; // hueco de dorso
  to: Slot; // hueco de carta abierta
  order: number;
}

// Un corazón perdido en el duelo: posición del corazón que se rompe.
export interface HeartBreak {
  seat: number;
  x: number;
  y: number;
  size: number;
}

// Duelo: las manos rivales se voltean y, al terminar, se rompen los corazones perdidos.
// Las cartas abiertas se quedan en su sitio hasta que acaba la escena.
export function showdownScene(
  reveals: readonly Reveal[],
  hearts: readonly HeartBreak[],
): Scene {
  const last = Math.max(1, ...reveals.map((r) => r.order));
  return {
    dur: FX_SHOWDOWN_MS,
    run(tl, at, speed) {
      const k = 1 / speed;
      const flip = (FX_REVEAL_MS / 2) * k;
      const revealEnd = at + FX_REVEAL_MS * k;
      const end = at + FX_SHOWDOWN_MS * k;
      const step = (FX_REVEAL_MS * k - flip) / last;
      for (const r of reveals) {
        const start = at + r.order * step;
        const from = slotPose(r.from.rect, false);
        const to = slotPose(r.to.rect, true);
        const hide = [r.from.key];
        tl.addFlight({ card: r.card, from, to, start, dur: flip, hide });
        tl.addFlight({
          card: r.card,
          from: to,
          to,
          start: start + flip,
          dur: end - (start + flip),
          hide,
        });
      }
      for (const h of hearts) {
        tl.addEffect({
          kind: "heartBreak",
          ...h,
          start: revealEnd,
          dur: FX_HEART_MS * k,
        });
      }
    },
  };
}

export const swap1Scene = (moves: readonly Move[]) =>
  moveScene(moves, FX_SWAP1_MS);
export const swap5Scene = (moves: readonly Move[]) =>
  moveScene(moves, FX_SWAP5_MS);
