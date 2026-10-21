import type { HandCategory, Rank, Suit } from "./types";

// Canvas lógico 4:3.
export const W = 800;
export const H = 600;

export const MAX_DT = 0.05;

// VS CPU usa 4 asientos (tú + 3 CPU); el motor los recibe como parámetro para el modo en línea.
export const SEATS = 4;
export const HUMAN_SEAT = 0;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 9;

// Códigos de sala: sin I, O, 0 ni 1 para no confundirlos al dictarlos.
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 5;
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
export const SEAT_GAP = 16;

export const BUTTON_W = 150;
export const BUTTON_H = 38;
export const BUTTON_GAP = 16;
export const BUTTON_Y = 550;

// Animaciones (SPEC 10), en milisegundos. Cortas a propósito: bloquean el turno, así que no deben aburrir.
export const FX_MAX_MS = 1000; // tope duro de bloqueo por evento
export const FX_PASS_MS = 450;
export const FX_CALL_MS = 800;
export const FX_SWAP1_MS = 700;
export const FX_SWAP5_MS = 900;
export const FX_DEAL_MS = 900;
export const FX_SHOWDOWN_MS = 1000;
export const FX_HIGHLIGHT_MS = 150; // resalte de origen y destino antes del vuelo
export const FX_FLIGHT_MS = 450;
export const FX_FLIP_MS = 400;
export const FX_STAGGER_MS = 60; // desfase entre cartas de un mismo evento
export const FX_CATCHUP_SPEED = 2; // con más de un evento pendiente se acelera

// PASO discreto; LLAMO es la jugada fuerte; el resalte amarillo es el mismo de la selección.
export const FX_COLOR_PASS = COLOR_DIM;
export const FX_COLOR_CALL = COLOR_MAGENTA;
export const FX_COLOR_SWAP = COLOR_CYAN;
export const FX_COLOR_HIGHLIGHT = COLOR_YELLOW;
