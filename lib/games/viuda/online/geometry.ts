import {
  CARD_GAP,
  CARD_H,
  CARD_W,
  HAND_SIZE,
  HAND_Y,
  LAYOUT_MODE,
  W,
  WIDOW_CARD_H,
  WIDOW_CARD_W,
  WIDOW_GAP,
  WIDOW_Y,
} from "../constants";
import {
  cardRowRects,
  lifeHeartPos,
  SEAT_LIVES_Y,
  seatCardRects,
} from "../entities";
import type { BadgeAnchor } from "../fx/draw";
import type { WidowTarget } from "../hand-order";
import type { Rect } from "../types";
import { opponentRects, relativeSeat } from "./layout";

// Posiciones de la mesa que comparten el dibujo (motor VS CPU y table-view) y las
// animaciones (table-fx). Todo en coordenadas lógicas del canvas vigente (apaisado
// 800×600 o vertical 400×720): son funciones porque dependen del modo.

export function ownCardRects(count = HAND_SIZE): Rect[] {
  return cardRowRects(count, W / 2, HAND_Y, CARD_W, CARD_H, CARD_GAP);
}

export function widowCardRects(): Rect[] {
  return cardRowRects(
    HAND_SIZE,
    W / 2,
    WIDOW_Y,
    WIDOW_CARD_W,
    WIDOW_CARD_H,
    WIDOW_GAP,
  );
}

const WIDOW_ZONE_MARGIN = 14; // px lógicos alrededor de las cartas de la viuda

// Qué parte de la viuda hay bajo el punto: una carta (solo con la viuda abierta), el resto
// de la zona (hueco entre cartas o marco; cualquier punto si está cerrada) o nada.
export function widowTargetAt(
  x: number,
  y: number,
  widowOpen: boolean,
): WidowTarget | null {
  const rects = widowCardRects();
  const left = rects[0].x - WIDOW_ZONE_MARGIN;
  const top = rects[0].y - WIDOW_ZONE_MARGIN;
  const right = rects[rects.length - 1].x + rects[rects.length - 1].w;
  const bottom = rects[0].y + rects[0].h;
  const inside =
    x >= left &&
    x <= right + WIDOW_ZONE_MARGIN &&
    y >= top &&
    y <= bottom + WIDOW_ZONE_MARGIN;
  if (!inside) return null;
  if (widowOpen) {
    const i = rects.findIndex(
      (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h,
    );
    if (i >= 0) return { kind: "widow-card", widowIndex: i };
  }
  return { kind: "widow-zone" };
}

// Cartas de un rival: dorsos solapados, o abiertas en el duelo y el sorteo.
export function onlineSeatCardRects(
  panel: Rect,
  count: number,
  faceUp: boolean,
): Rect[] {
  return seatCardRects(panel, count, faceUp);
}

// Rótulos y avisos de la mesa que no son de un asiento concreto.
export function tableLabels() {
  const portrait = LAYOUT_MODE === "portrait";
  return {
    widowLabelY: WIDOW_Y - 22,
    statusY: WIDOW_Y + WIDOW_CARD_H + (portrait ? 22 : 26),
    lastLap: { x: W / 2, y: portrait ? 440 : 320 },
    bannerY: portrait ? 430 : 326,
    bannerX: portrait ? 8 : 184,
    statusW: portrait ? W - 16 : W - 2 * 184, // ancho del texto de estado: entre los paneles laterales
  };
}

// Dónde va el jugador local: nombre, vidas, ronda y rótulo de su mano. En el lienzo vertical
// la mano ocupa todo el ancho y esos datos se reparten en una fila sobre ella (sin rótulo).
export function localAnchors() {
  if (LAYOUT_MODE === "portrait") {
    const y = HAND_Y - 24;
    return {
      panel: { x: 8, y: y - 16, w: 140, h: 32 },
      name: { x: 48, y },
      hearts: { x: 112, y },
      round: { x: W - 44, y },
      label: null,
      badge: { x: W / 2, y: HAND_Y - 44 },
      tag: { x: 24, y: y - 16 },
    };
  }
  return {
    panel: { x: 16, y: HAND_Y + 24, w: 104, h: 62 },
    name: { x: 68, y: HAND_Y + 40 },
    hearts: { x: 68, y: HAND_Y + 66 },
    round: { x: W - 68, y: HAND_Y + 40 },
    label: { x: W / 2, y: HAND_Y - 30 },
    badge: { x: W / 2, y: HAND_Y - 50 },
    tag: { x: 68, y: HAND_Y + 18 },
  };
}

// Panel de un rival visto desde el asiento `localIndex` (índices de `table.seats`).
export function rivalPanel(
  count: number,
  localIndex: number,
  index: number,
): Rect {
  return opponentRects(count)[relativeSeat(index, localIndex, count) - 1];
}

// Panel de cualquier asiento, incluido el local.
export function seatPanel(
  count: number,
  localIndex: number,
  index: number,
): Rect {
  return index === localIndex
    ? localAnchors().panel
    : rivalPanel(count, localIndex, index);
}

// Dónde se dibuja el cartel de la jugada de un asiento y su marca de llamador.
export function badgeAnchor(
  count: number,
  localIndex: number,
  index: number,
): BadgeAnchor {
  if (index === localIndex) {
    const { badge, tag } = localAnchors();
    return { ...badge, tag };
  }
  return panelBadgeAnchor(rivalPanel(count, localIndex, index));
}

// Cartel y marca de un panel de rival: el cartel sobre sus cartas, la marca en la esquina.
export function panelBadgeAnchor(r: Rect): BadgeAnchor {
  return {
    x: r.x + r.w / 2,
    y: r.y + r.h * 0.55,
    tag: { x: r.x + r.w - 30, y: r.y + 14 },
  };
}

// Centro del corazón `life` de la fila de vidas de un asiento, y su tamaño.
export function heartAnchor(
  count: number,
  localIndex: number,
  index: number,
  life: number,
): { x: number; y: number; size: number } {
  if (index === localIndex) {
    const { hearts } = localAnchors();
    return { ...lifeHeartPos(life, hearts.x, hearts.y, 14), size: 14 };
  }
  return panelHeartAnchor(rivalPanel(count, localIndex, index), life);
}

export function panelHeartAnchor(
  r: Rect,
  life: number,
): { x: number; y: number; size: number } {
  return {
    ...lifeHeartPos(life, r.x + r.w / 2, r.y + SEAT_LIVES_Y, 14),
    size: 14,
  };
}
