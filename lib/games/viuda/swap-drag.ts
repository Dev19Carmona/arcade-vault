import {
  COLOR_CYAN,
  HAND_SIZE,
  LAYOUT_MODE,
  W,
  WIDOW_CARD_H,
  WIDOW_CARD_W,
} from "./constants";
import {
  drawCard,
  drawCardBack,
  drawCardPosed,
  pointInRect,
} from "./entities";
import { DRAG_THRESHOLD } from "./hand-order";
import type { DragIntent } from "./drag-preview";
import { ownCardRects, widowCardRects } from "./online/geometry";
import type { Card, Rect } from "./types";
import { cardLabel } from "./utils";

// Arrastre entre la mano y la viuda que no sale de una carta propia: una carta de la viuda
// (CAMBIAR 1 hacia mi mano) o el marco gris de cualquiera de los dos grupos (CAMBIAR 5).
// El arrastre de una carta propia (reordenar o cambiar 1 hacia la viuda) es de `hand-order`.
// TypeScript puro: no ejecuta acciones, solo decide qué se coge y sobre qué se suelta.

export type GroupId = "own" | "widow";

export type SwapSource =
  { kind: "widow-card"; index: number } | { kind: "group"; group: GroupId };

// --- Geometría de los marcos (dependen del lienzo vigente: léelos dentro de funciones) ---

const FRAME_COLOR = "rgba(176,180,196,0.55)";

export function groupFrame(group: GroupId): Rect {
  const rects = group === "own" ? ownCardRects(HAND_SIZE) : widowCardRects();
  const pad = LAYOUT_MODE === "portrait" ? 4 : 10;
  const first = rects[0];
  const last = rects[rects.length - 1];
  return {
    x: first.x - pad,
    y: first.y - pad,
    w: last.x + last.w - first.x + 2 * pad,
    h: first.h + 2 * pad,
  };
}

// La bolita de la esquina superior derecha: el asa del grupo.
export function groupDot(group: GroupId): { x: number; y: number; r: number } {
  const f = groupFrame(group);
  const r = LAYOUT_MODE === "portrait" ? 7 : 9;
  return { x: Math.min(f.x + f.w, W - r - 1), y: f.y, r };
}

// El marco y la bolita cuentan como parte del grupo; las cartas, también.
export function pointInGroup(group: GroupId, x: number, y: number): boolean {
  const d = groupDot(group);
  return (
    pointInRect(x, y, groupFrame(group)) ||
    Math.hypot(x - d.x, y - d.y) <= d.r + 5
  );
}

function pathFrame(ctx: CanvasRenderingContext2D, f: Rect) {
  ctx.beginPath();
  ctx.roundRect(f.x, f.y, f.w, f.h, LAYOUT_MODE === "portrait" ? 8 : 12);
}

// Marco gris y bolita de un grupo, detrás de sus cartas. `grabbable` los enciende un poco.
export function drawGroupFrame(
  ctx: CanvasRenderingContext2D,
  group: GroupId,
  dx = 0,
  dy = 0,
  grabbable = false,
): void {
  const f = groupFrame(group);
  const d = groupDot(group);
  ctx.save();
  ctx.translate(dx, dy);
  pathFrame(ctx, f);
  ctx.fillStyle = "rgba(255,255,255,0.035)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = grabbable ? "rgba(208,212,228,0.75)" : FRAME_COLOR;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
  ctx.fillStyle = grabbable ? "#c9cde0" : "#8d91a3";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(10,12,24,0.85)";
  ctx.stroke();
  ctx.restore();
}

// --- Destino ---

export interface SwapIntentInput {
  source: SwapSource;
  x: number; // puntero, en coordenadas lógicas
  y: number;
  ownCards: readonly Card[]; // mi mano en orden visual
  widow: readonly (Card | null)[]; // null = boca abajo
  blocked: string | null; // motivo por el que no se puede actuar ahora
}

// Qué haría soltar aquí lo que se arrastra (null si no está sobre un destino válido).
export function resolveSwapIntent(input: SwapIntentInput): DragIntent | null {
  const { source, x, y, ownCards, widow, blocked } = input;
  if (source.kind === "widow-card") {
    const own = ownCardRects(ownCards.length);
    const v = own.findIndex((r) => pointInRect(x, y, r));
    if (v < 0) return null;
    if (blocked) return { kind: "blocked", label: blocked };
    const taken = widow[source.index];
    return {
      kind: "swap1",
      widowIndex: source.index,
      handVisual: v,
      label: `CAMBIAR ${taken ? cardLabel(taken) : "?"} POR ${cardLabel(ownCards[v])}`,
      targets: [own[v]],
    };
  }
  const to: GroupId = source.group === "own" ? "widow" : "own";
  if (!pointInGroup(to, x, y)) return null;
  if (blocked) return { kind: "blocked", label: blocked };
  return { kind: "swap5", label: "CAMBIAR LAS 5", targets: [groupFrame(to)] };
}

// --- Gesto ---

export interface SwapGrabInput {
  canGrab: boolean; // se puede coger algo ahora (fase de turnos y mano completa)
  widowOpen: boolean; // con la viuda cerrada no hay cartas sueltas que coger
}

export type SwapRelease =
  | { kind: "click" }
  | { kind: "drop"; source: SwapSource; x: number; y: number }
  | null;

export interface SwapActive {
  source: SwapSource;
  dx: number; // desplazamiento desde donde se cogió
  dy: number;
}

export interface SwapDrag {
  // Pulsar fuera de las cartas propias: coge una carta de la viuda o un marco.
  down(x: number, y: number, input: SwapGrabInput): void;
  move(x: number, y: number): void;
  up(): SwapRelease;
  cancel(): void;
  active(): SwapActive | null; // arrastre en curso
  busy(): boolean; // hay candidata o arrastre en curso
}

export function createSwapDrag(): SwapDrag {
  let candidate: { source: SwapSource; x0: number; y0: number } | null = null;
  let dragging = false;
  let pos = { x: 0, y: 0 };

  return {
    down(x, y, { canGrab, widowOpen }) {
      pos = { x, y };
      candidate = null;
      if (!canGrab) return;
      let source: SwapSource | null = null;
      const wi = widowCardRects().findIndex((r) => pointInRect(x, y, r));
      if (wi >= 0 && widowOpen) source = { kind: "widow-card", index: wi };
      else if (pointInGroup("widow", x, y)) {
        source = { kind: "group", group: "widow" };
      } else if (
        pointInGroup("own", x, y) &&
        !ownCardRects(HAND_SIZE).some((r) => pointInRect(x, y, r))
      ) {
        source = { kind: "group", group: "own" };
      }
      if (source) candidate = { source, x0: x, y0: y };
    },
    move(x, y) {
      pos = { x, y };
      if (
        candidate &&
        !dragging &&
        Math.hypot(x - candidate.x0, y - candidate.y0) > DRAG_THRESHOLD
      ) {
        dragging = true;
      }
    },
    up() {
      if (!candidate) return null;
      const c = candidate;
      candidate = null;
      if (!dragging) return { kind: "click" };
      dragging = false;
      return { kind: "drop", source: c.source, x: pos.x, y: pos.y };
    },
    cancel() {
      candidate = null;
      dragging = false;
    },
    active() {
      if (!dragging || !candidate) return null;
      return {
        source: candidate.source,
        dx: pos.x - candidate.x0,
        dy: pos.y - candidate.y0,
      };
    },
    busy() {
      return candidate !== null;
    },
  };
}

// --- Dibujo de lo que se arrastra ---

// El grupo entero (marco y cartas) o la carta de la viuda siguen al puntero.
export function drawSwapFloating(
  ctx: CanvasRenderingContext2D,
  active: SwapActive,
  cards: { own: readonly Card[]; widow: readonly (Card | null)[] },
): void {
  const { source, dx, dy } = active;
  if (source.kind === "widow-card") {
    const r = widowCardRects()[source.index];
    drawCardPosed(
      ctx,
      cards.widow[source.index],
      { w: WIDOW_CARD_W, h: WIDOW_CARD_H },
      {
        x: r.x + r.w / 2 + dx,
        y: r.y + r.h / 2 + dy,
        rot: 0,
        scale: 1.12,
        flip: 1,
      },
      { highlight: COLOR_CYAN },
    );
    return;
  }
  const rects =
    source.group === "own" ? ownCardRects(HAND_SIZE) : widowCardRects();
  const list: readonly (Card | null)[] =
    source.group === "own" ? cards.own : cards.widow;
  ctx.save();
  ctx.globalAlpha = 0.92;
  drawGroupFrame(ctx, source.group, dx, dy, true);
  rects.forEach((r, i) => {
    const moved = { ...r, x: r.x + dx, y: r.y + dy };
    const card = list[i];
    if (card) drawCard(ctx, card, moved);
    else drawCardBack(ctx, moved);
  });
  ctx.restore();
}

