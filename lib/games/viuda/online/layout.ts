import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  SEAT_GAP,
  SEAT_H,
  SEAT_W,
  W,
} from "../constants";
import type { Rect } from "../types";

// Oponentes por lado de la mesa (izquierda, arriba, derecha) según cuántos hay.
const SIDES: Record<number, { left: number; top: number; right: number }> = {
  1: { left: 0, top: 1, right: 0 },
  2: { left: 0, top: 2, right: 0 },
  3: { left: 1, top: 1, right: 1 },
  4: { left: 1, top: 2, right: 1 },
  5: { left: 1, top: 3, right: 1 },
  6: { left: 1, top: 4, right: 1 },
  7: { left: 2, top: 3, right: 2 },
  8: { left: 2, top: 4, right: 2 },
};

const SIDE_X = 24;
const TOP_Y = 28;
const SIDE_MID_Y = 215;
// Con dos paneles por columna lateral se acortan para caber entre la fila superior y la mano.
const SIDE_PAIR_H = 104;
const SIDE_PAIR_Y = [156, 272];

function sideColumn(count: number, x: number): Rect[] {
  if (count === 0) return [];
  if (count === 1) return [{ x, y: SIDE_MID_Y, w: SEAT_W, h: SEAT_H }];
  return SIDE_PAIR_Y.map((y) => ({ x, y, w: SEAT_W, h: SIDE_PAIR_H }));
}

function topRow(count: number): Rect[] {
  const total = count * SEAT_W + (count - 1) * SEAT_GAP;
  const x0 = (W - total) / 2;
  return Array.from({ length: count }, (_, i) => ({
    x: x0 + i * (SEAT_W + SEAT_GAP),
    y: TOP_Y,
    w: SEAT_W,
    h: SEAT_H,
  }));
}

// Paneles de los oponentes, en sentido horario desde el jugador local (abajo):
// columna izquierda de abajo arriba, fila superior de izquierda a derecha y
// columna derecha de arriba abajo. El índice i corresponde al asiento relativo i + 1.
export function opponentRects(playerCount: number): Rect[] {
  if (
    !Number.isInteger(playerCount) ||
    playerCount < MIN_PLAYERS ||
    playerCount > MAX_PLAYERS
  ) {
    throw new RangeError(
      `playerCount debe estar entre ${MIN_PLAYERS} y ${MAX_PLAYERS}`,
    );
  }
  const sides = SIDES[playerCount - 1];
  return [
    ...sideColumn(sides.left, SIDE_X).reverse(),
    ...topRow(sides.top),
    ...sideColumn(sides.right, W - SEAT_W - SIDE_X),
  ];
}

// Posición del asiento `index` vista desde `localIndex`: 0 es el jugador local,
// 1 el siguiente en sentido horario, etc.
export function relativeSeat(
  index: number,
  localIndex: number,
  playerCount: number,
): number {
  return (index - localIndex + playerCount) % playerCount;
}

// Reordena una lista de asientos para que el local quede primero y el resto siga el orden de turno.
export function rotateToLocal<T>(items: readonly T[], localIndex: number): T[] {
  return items.map((_, i) => items[(localIndex + i) % items.length]);
}
