import {
  BASE_DROP_INTERVAL,
  COLS,
  DROP_STEP,
  MIN_DROP_INTERVAL,
  ROWS,
} from "./constants";
import type { Shape } from "./types";

export function createBoard(): number[][] {
  return Array.from({ length: ROWS }, () => new Array<number>(COLS).fill(0));
}

export function rotateCW(shape: Shape): Shape {
  const rows = shape.length;
  const cols = shape[0].length;
  const result: Shape = Array.from({ length: cols }, () =>
    new Array<number>(rows).fill(0),
  );
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) result[c][rows - 1 - r] = shape[r][c];
  return result;
}

// Segundos entre caídas automáticas: max(100 ms, 1000 ms − (nivel − 1) × 90 ms).
export function dropIntervalFor(level: number): number {
  return Math.max(
    MIN_DROP_INTERVAL,
    BASE_DROP_INTERVAL - (level - 1) * DROP_STEP,
  );
}
