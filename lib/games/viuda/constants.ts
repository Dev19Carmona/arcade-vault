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
