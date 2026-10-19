import type { Shape } from "./types";

// Canvas lógico 4:3; el tablero (300×600) va centrado y la vista previa a su derecha.
export const W = 800;
export const H = 600;

export const COLS = 10;
export const ROWS = 20;
export const BLOCK = 30;

export const BOARD_X = (W - COLS * BLOCK) / 2;
export const BOARD_Y = 0;

export const NEXT_X = BOARD_X + COLS * BLOCK + 40;
export const NEXT_Y = 60;
export const NEXT_SIZE = 120;

export const MAX_DT = 0.05;
export const MIN_DROP_INTERVAL = 0.1; // segundos
export const BASE_DROP_INTERVAL = 1; // segundos
export const DROP_STEP = 0.09; // segundos menos por nivel
export const LINES_PER_LEVEL = 10;

export const GRID_LINE = "rgba(255, 255, 255, 0.08)";

export const COLORS: (string | null)[] = [
  null,
  "#4dd0e1", // I - cyan
  "#ffd54f", // O - yellow
  "#ba68c8", // T - purple
  "#81c784", // S - green
  "#e57373", // Z - red
  "#90caf9", // J - pale blue
  "#ffb74d", // L - orange
  "#9e9e9e", // N - tuerca (gris metálico)
];

export const PIECES: (Shape | null)[] = [
  null,
  [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ], // I
  [
    [2, 2],
    [2, 2],
  ], // O
  [
    [0, 3, 0],
    [3, 3, 3],
    [0, 0, 0],
  ], // T
  [
    [0, 4, 4],
    [4, 4, 0],
    [0, 0, 0],
  ], // S
  [
    [5, 5, 0],
    [0, 5, 5],
    [0, 0, 0],
  ], // Z
  [
    [6, 0, 0],
    [6, 6, 6],
    [0, 0, 0],
  ], // J
  [
    [0, 0, 7],
    [7, 7, 7],
    [0, 0, 0],
  ], // L
  [
    [8, 8, 8],
    [8, 0, 8],
    [8, 8, 8],
  ], // N (tuerca)
];

export const PIECE_TYPES = PIECES.length - 1;

export const LINE_SCORES = [0, 100, 300, 500, 800];
export const SOFT_DROP_POINTS = 1;
export const HARD_DROP_POINTS = 2;

// Desplazamientos horizontales que prueba la rotación junto a una pared.
export const WALL_KICKS = [0, -1, 1, -2, 2];
