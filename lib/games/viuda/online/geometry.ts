import {
  CARD_GAP,
  CARD_H,
  CARD_W,
  HAND_SIZE,
  HAND_Y,
  W,
  WIDOW_CARD_H,
  WIDOW_CARD_W,
  WIDOW_GAP,
  WIDOW_Y,
} from "../constants";
import { cardRowRects, lifeHeartPos } from "../entities";
import type { BadgeAnchor } from "../fx/draw";
import type { Rect } from "../types";
import { opponentRects, relativeSeat } from "./layout";

// Posiciones de la mesa en línea que comparten el dibujo (table-view) y las animaciones
// (table-fx). Todo en coordenadas lógicas del canvas 800×600.

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

// Cartas de un rival: dorsos solapados, o abiertas y separadas en el duelo y el sorteo.
// Las medidas salen del alto del panel, que es menor con 7 u 8 rivales.
export function onlineSeatCardRects(
  panel: Rect,
  count: number,
  faceUp: boolean,
): Rect[] {
  const w = faceUp ? 26 : 22;
  const h = faceUp ? 38 : 32;
  return cardRowRects(
    count,
    panel.x + panel.w / 2,
    panel.y + 44,
    w,
    h,
    faceUp ? 3 : -8,
  );
}

// Zona de «nombre y vidas» del jugador local: lo que late en su turno.
export const LOCAL_PANEL: Rect = { x: 36, y: HAND_Y + 14, w: 68, h: 52 };

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
    ? LOCAL_PANEL
    : rivalPanel(count, localIndex, index);
}

// Dónde se dibuja el cartel de la jugada de un asiento y su marca de llamador.
export function badgeAnchor(
  count: number,
  localIndex: number,
  index: number,
): BadgeAnchor {
  if (index === localIndex) {
    return { x: W / 2, y: HAND_Y - 58, tag: { x: 70, y: HAND_Y + 8 } };
  }
  const r = rivalPanel(count, localIndex, index);
  return {
    x: r.x + r.w / 2,
    y: r.y + 60,
    tag: { x: r.x + r.w - 32, y: r.y + 13 },
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
    return { ...lifeHeartPos(life, 70, HAND_Y + 54, 14), size: 14 };
  }
  const r = rivalPanel(count, localIndex, index);
  return { ...lifeHeartPos(life, r.x + r.w / 2, r.y + 30, 13), size: 13 };
}
