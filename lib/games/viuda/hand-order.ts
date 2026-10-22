import type { Card, Rect } from "./types";

// Orden local de la mano propia y arrastre de cartas. TypeScript puro: no toca el DOM,
// no viaja por la red y no cambia las reglas; solo decide qué carta se dibuja en cada hueco.

// El orden se guarda por identidad de carta (no por índice) para sobrevivir a un CAMBIAR 1
// (sale una carta) y a un CAMBIAR 5 (sale toda la mano).
export type CardKey = string;

export interface HandOrder {
  keys: CardKey[]; // orden visual, de izquierda a derecha
}

export const cardKey = (card: Card): CardKey => `${card.suit}-${card.rank}`;

// Orden de reparto: las cartas tal como llegan de las reglas.
export function initialOrder(hand: readonly Card[]): HandOrder {
  return { keys: hand.map(cardKey) };
}

// Adapta el orden a una mano nueva: las cartas que siguen conservan su posición y las
// nuevas ocupan los huecos libres de izquierda a derecha (con CAMBIAR 1 entra en el hueco
// de la que salió).
export function reconcile(order: HandOrder, hand: readonly Card[]): HandOrder {
  const handKeys = hand.map(cardKey);
  if (order.keys.length !== hand.length) return { keys: handKeys };
  const present = new Set(handKeys);
  const kept = new Set(order.keys.filter((k) => present.has(k)));
  const fresh = handKeys.filter((k) => !kept.has(k));
  let next = 0;
  return {
    keys: order.keys.map((k) => (present.has(k) ? k : fresh[next++])),
  };
}

// Índice de la mano de las reglas que hay en cada posición visual.
export function visualIndices(
  order: HandOrder,
  hand: readonly Card[],
): number[] {
  const byKey = new Map(hand.map((card, i) => [cardKey(card), i]));
  const indices = order.keys.map((k) => byKey.get(k) ?? -1);
  // Un orden que no corresponde a la mano (no debería pasar) no se aplica.
  return indices.includes(-1) ? hand.map((_, i) => i) : indices;
}

export function visualHand(order: HandOrder, hand: readonly Card[]): Card[] {
  return visualIndices(order, hand).map((i) => hand[i]);
}

// De una posición visual al índice que esperan las reglas (`handIndex` de CAMBIAR 1).
export function visualToRules(
  order: HandOrder,
  hand: readonly Card[],
  visual: number,
): number {
  return visualIndices(order, hand)[visual] ?? visual;
}

// Del índice de las reglas a la posición en que se dibuja esa carta.
export function rulesToVisual(
  order: HandOrder,
  hand: readonly Card[],
  rulesIndex: number,
): number {
  const visual = visualIndices(order, hand).indexOf(rulesIndex);
  return visual < 0 ? rulesIndex : visual;
}

// Mueve la carta de la posición `from` a la posición `to`.
export function moveCard(
  order: HandOrder,
  from: number,
  to: number,
): HandOrder {
  const keys = [...order.keys];
  const [key] = keys.splice(from, 1);
  keys.splice(to, 0, key);
  return { keys };
}

// --- Arrastre ---

export const DRAG_THRESHOLD = 6; // px lógicos: por debajo es un clic
const DRAG_SETTLE_S = 0.12; // la carta soltada se asienta en su hueco
const DRAG_SLIDE_RATE = 18; // velocidad con que las vecinas abren hueco
const DRAG_SCALE = 1.06;

// Carta que se dibuja flotando: la que se arrastra o la que acaba de soltarse.
export interface FloatingCard {
  slot: number; // posición visual de esa carta (la quieta de ese hueco no se dibuja)
  x: number; // centro
  y: number;
  scale: number;
  dragging: boolean;
}

// Qué hay bajo la carta arrastrada. «hand»: otra posición de la mano (reordenar);
// las demás son la viuda, que calcula quien dibuja con su geometría.
export type WidowTarget =
  | { kind: "widow-card"; widowIndex: number } // sobre una carta de la viuda abierta
  | { kind: "widow-zone" }; // sobre la zona de la viuda, no sobre una carta concreta
export type DragTarget =
  { kind: "hand"; to: number } | WidowTarget | { kind: "none" };

export type DragRelease =
  | { kind: "click"; slot: number }
  | { kind: "drop"; from: number; to: number; target: DragTarget }
  | null;

export interface HandDrag {
  // Pulsar: si hay carta bajo el puntero (y se puede coger) queda como candidata.
  down(
    x: number,
    y: number,
    rects: readonly Rect[],
    canGrab?: (slot: number) => boolean,
  ): void;
  // `over` es el destino de la viuda bajo el puntero (null si no hay): mientras lo hay, la
  // mano no se reordena y las vecinas no se apartan.
  move(x: number, y: number, over?: WidowTarget | null): void;
  // Destino actual del arrastre en curso (null si no se está arrastrando).
  target(): DragTarget | null;
  // Soltar: clic corto, arrastre terminado o nada (sin candidata).
  up(): DragRelease;
  cancel(): void;
  update(dt: number): void; // segundos
  floating(): FloatingCard | null;
  offsets(): readonly number[]; // desplazamiento de cada carta quieta, en ranuras
  busy(): boolean; // hay candidata o arrastre en curso
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function createHandDrag(slots: number): HandDrag {
  let candidate: {
    slot: number;
    grabDx: number; // puntero - centro de la carta, para no «saltar» al cogerla
    grabDy: number;
    startX: number;
    startY: number;
    rects: Rect[];
  } | null = null;
  let dragging = false;
  let from = -1;
  let target = -1;
  let overWidow: WidowTarget | null = null;
  let pos = { x: 0, y: 0 };
  let settle: {
    slot: number;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    t: number;
  } | null = null;
  const offs: number[] = Array.from({ length: slots }, () => 0);

  const centerOf = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

  // Hacia dónde debe estar cada carta quieta mientras se arrastra de `from` a `target`.
  function targetOffset(i: number): number {
    if (i === from) return 0;
    if (from < target && i > from && i <= target) return -1;
    if (from > target && i >= target && i < from) return 1;
    return 0;
  }

  return {
    down(x, y, rects, canGrab) {
      settle = null;
      pos = { x, y };
      const slot = rects.findIndex(
        (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h,
      );
      if (slot < 0 || (canGrab && !canGrab(slot))) return;
      const c = centerOf(rects[slot]);
      candidate = {
        slot,
        grabDx: x - c.x,
        grabDy: y - c.y,
        startX: x,
        startY: y,
        rects: [...rects],
      };
    },
    move(x, y, over = null) {
      pos = { x, y };
      overWidow = over;
      if (!candidate) return;
      if (
        !dragging &&
        Math.hypot(x - candidate.startX, y - candidate.startY) > DRAG_THRESHOLD
      ) {
        dragging = true;
        from = candidate.slot;
        target = from;
      }
      if (dragging && overWidow) {
        // Sobre la viuda no se reordena: la carta volverá a su sitio.
        target = from;
      } else if (dragging) {
        // El hueco destino es la carta cuyo centro queda más cerca en horizontal.
        let best = from;
        let bestDist = Infinity;
        candidate.rects.forEach((r, i) => {
          const d = Math.abs(x - candidate!.grabDx - centerOf(r).x);
          if (d < bestDist) {
            bestDist = d;
            best = i;
          }
        });
        target = best;
      }
    },
    up() {
      if (!candidate) return null;
      const c = candidate;
      candidate = null;
      if (!dragging) return { kind: "click", slot: c.slot };
      dragging = false;
      const released = overWidow;
      overWidow = null;
      const end = centerOf(c.rects[target]);
      settle = {
        slot: target,
        x0: pos.x - c.grabDx,
        y0: pos.y - c.grabDy,
        x1: end.x,
        y1: end.y,
        t: 0,
      };
      offs.fill(0);
      return {
        kind: "drop",
        from,
        to: target,
        target: released ?? { kind: "hand", to: target },
      };
    },
    target() {
      if (!dragging) return null;
      return overWidow ?? { kind: "hand", to: target };
    },
    cancel() {
      candidate = null;
      dragging = false;
      overWidow = null;
      settle = null;
      offs.fill(0);
    },
    update(dt) {
      const k = Math.min(1, dt * DRAG_SLIDE_RATE);
      for (let i = 0; i < offs.length; i++) {
        const goal = dragging ? targetOffset(i) : 0;
        offs[i] += (goal - offs[i]) * k;
      }
      if (settle) {
        settle.t += dt / DRAG_SETTLE_S;
        if (settle.t >= 1) settle = null;
      }
    },
    floating() {
      if (dragging && candidate) {
        return {
          slot: from,
          x: pos.x - candidate.grabDx,
          y: pos.y - candidate.grabDy,
          scale: DRAG_SCALE,
          dragging: true,
        };
      }
      if (settle) {
        const e = easeOutCubic(Math.min(settle.t, 1));
        return {
          slot: settle.slot,
          x: settle.x0 + (settle.x1 - settle.x0) * e,
          y: settle.y0 + (settle.y1 - settle.y0) * e,
          scale: DRAG_SCALE + (1 - DRAG_SCALE) * e,
          dragging: false,
        };
      }
      return null;
    },
    offsets() {
      return offs;
    },
    busy() {
      return candidate !== null;
    },
  };
}
