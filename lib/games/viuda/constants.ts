import type { HandCategory, Rank, Suit } from "./types";

// Canvas lógico 4:3.
export const W = 800;
export const H = 600;

export const MAX_DT = 0.05;

// Hoy 4 asientos (tú + 3 CPU); el motor los recibe como parámetro para el modo en línea.
export const SEATS = 4;
export const HUMAN_SEAT = 0;
export const LIVES = 3;
export const HAND_SIZE = 5;

// Pensar de las CPU, en segundos.
export const CPU_THINK_MIN = 0.8;
export const CPU_THINK_MAX = 1.4;

// Puntuación: solo cuenta la victoria.
export const WIN_POINTS_PER_RIVAL = 1000;
export const WIN_POINTS_PER_LIFE = 300;

export const SUITS: Suit[] = [0, 1, 2, 3];
export const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export const SUIT_SYMBOLS: Record<Suit, string> = {
  0: "♣",
  1: "♦",
  2: "♥",
  3: "♠",
};

export const RANK_LABELS: Record<Rank, string> = {
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};

export const HAND_NAMES: Record<HandCategory, string> = {
  0: "CARTA ALTA",
  1: "PAR",
  2: "DOBLE PAR",
  3: "TERNA",
  4: "ESCALERA",
  5: "COLOR",
  6: "FULL HOUSE",
  7: "PÓKER",
  8: "ESCALERA DE COLOR",
};

// Colores del tapete (tokens de la plataforma, fijos porque el motor no toca el DOM).
export const COLOR_FELT = "#0b3d2a";
export const COLOR_FELT_DARK = "#07281c";
export const COLOR_INK = "#e8e8f0";
export const COLOR_DIM = "#8a8aa0";
export const COLOR_CYAN = "#00f5ff";
export const COLOR_MAGENTA = "#ff006e";
export const COLOR_YELLOW = "#f5ff00";
export const COLOR_GREEN = "#00ff88";
export const COLOR_CARD = "#f4f1e8";
export const COLOR_RED_SUIT = "#d62839";
export const COLOR_BLACK_SUIT = "#15151f";

export const FONT = "ui-monospace, Menlo, Consolas, monospace";

// Geometría lógica de la mesa.
export const CARD_W = 64;
export const CARD_H = 90;
export const CARD_GAP = 12;
export const HAND_Y = 440;

export const WIDOW_CARD_W = 56;
export const WIDOW_CARD_H = 80;
export const WIDOW_GAP = 10;
export const WIDOW_Y = 235;

export const SEAT_W = 150;
export const SEAT_H = 120;

// Esquina superior izquierda del panel de cada CPU, por asiento (el 0 es el jugador).
export const SEAT_POSITIONS: Record<number, { x: number; y: number }> = {
  1: { x: 24, y: 215 },
  2: { x: (W - SEAT_W) / 2, y: 28 },
  3: { x: W - SEAT_W - 24, y: 215 },
};

export const BUTTON_W = 150;
export const BUTTON_H = 38;
export const BUTTON_GAP = 16;
export const BUTTON_Y = 550;
