import type { HandCategory, Rank, Suit } from "./types";

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

// Jerarquía de pintas del reglamento (mayor valor = mayor jerarquía): ♣ < ♠ < ♥ < ♦.
export const SUIT_POWER: Record<Suit, number> = { 0: 0, 3: 1, 2: 2, 1: 3 };

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

// Geometría lógica de la mesa. Hay dos lienzos: apaisado (800×600, escritorio) y vertical
// (400×720, móvil en vertical). El canvas elige uno con `setLayoutMode`; las variables
// de abajo son enlaces vivos, así que todo el que las importa lee siempre el modo vigente
// (léelas dentro de funciones, no en constantes de módulo).
export type LayoutMode = "landscape" | "portrait";

const GEOMETRY = {
  landscape: {
    W: 800,
    H: 600,
    CARD_W: 96,
    CARD_H: 134,
    CARD_GAP: 12,
    HAND_Y: 392,
    WIDOW_CARD_W: 68,
    WIDOW_CARD_H: 96,
    WIDOW_GAP: 10,
    WIDOW_Y: 178,
    SEAT_W: 156,
    SEAT_H: 128,
    SEAT_GAP: 16,
    BUTTON_W: 150,
    BUTTON_H: 40,
    BUTTON_GAP: 16,
    BUTTON_Y: 548,
  },
  portrait: {
    W: 400,
    H: 720,
    CARD_W: 70,
    CARD_H: 100,
    CARD_GAP: 8,
    HAND_Y: 506,
    WIDOW_CARD_W: 62,
    WIDOW_CARD_H: 88,
    WIDOW_GAP: 8,
    WIDOW_Y: 306,
    SEAT_W: 121,
    SEAT_H: 118,
    SEAT_GAP: 8,
    BUTTON_W: 190,
    BUTTON_H: 44,
    BUTTON_GAP: 8,
    BUTTON_Y: 622,
  },
} as const;

export let LAYOUT_MODE: LayoutMode = "landscape";
export let W: number = GEOMETRY.landscape.W;
export let H: number = GEOMETRY.landscape.H;
export let CARD_W: number = GEOMETRY.landscape.CARD_W;
export let CARD_H: number = GEOMETRY.landscape.CARD_H;
export let CARD_GAP: number = GEOMETRY.landscape.CARD_GAP;
export let HAND_Y: number = GEOMETRY.landscape.HAND_Y;
export let WIDOW_CARD_W: number = GEOMETRY.landscape.WIDOW_CARD_W;
export let WIDOW_CARD_H: number = GEOMETRY.landscape.WIDOW_CARD_H;
export let WIDOW_GAP: number = GEOMETRY.landscape.WIDOW_GAP;
export let WIDOW_Y: number = GEOMETRY.landscape.WIDOW_Y;
export let SEAT_W: number = GEOMETRY.landscape.SEAT_W;
export let SEAT_H: number = GEOMETRY.landscape.SEAT_H;
export let SEAT_GAP: number = GEOMETRY.landscape.SEAT_GAP;
export let BUTTON_W: number = GEOMETRY.landscape.BUTTON_W;
export let BUTTON_H: number = GEOMETRY.landscape.BUTTON_H;
export let BUTTON_GAP: number = GEOMETRY.landscape.BUTTON_GAP;
export let BUTTON_Y: number = GEOMETRY.landscape.BUTTON_Y;

export function setLayoutMode(mode: LayoutMode): void {
  const g = GEOMETRY[mode];
  LAYOUT_MODE = mode;
  W = g.W;
  H = g.H;
  CARD_W = g.CARD_W;
  CARD_H = g.CARD_H;
  CARD_GAP = g.CARD_GAP;
  HAND_Y = g.HAND_Y;
  WIDOW_CARD_W = g.WIDOW_CARD_W;
  WIDOW_CARD_H = g.WIDOW_CARD_H;
  WIDOW_GAP = g.WIDOW_GAP;
  WIDOW_Y = g.WIDOW_Y;
  SEAT_W = g.SEAT_W;
  SEAT_H = g.SEAT_H;
  SEAT_GAP = g.SEAT_GAP;
  BUTTON_W = g.BUTTON_W;
  BUTTON_H = g.BUTTON_H;
  BUTTON_GAP = g.BUTTON_GAP;
  BUTTON_Y = g.BUTTON_Y;
}

// Consulta de medios que decide el modo vertical; el CSS usa la misma (`.crt:has(.game-canvas--drag)`).
export const PORTRAIT_QUERY = "(max-width: 720px) and (orientation: portrait)";

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
export const FX_TAG_MS = 300; // entrada de la marca persistente del llamador
export const FX_DEAL_FLIGHT_MS = 300; // vuelo de una carta repartida
export const FX_REVEAL_MS = 600; // volteo de las manos rivales en el duelo
export const FX_HEART_MS = 400; // corazón que se rompe, tras el volteo
export const FX_STAGGER_MS = 60; // desfase entre cartas de un mismo evento
export const FX_CATCHUP_SPEED = 2; // con más de un evento pendiente se acelera

// PASO discreto; LLAMO es la jugada fuerte; el resalte amarillo es el mismo de la selección.
export const FX_COLOR_PASS = COLOR_DIM;
export const FX_COLOR_CALL = COLOR_MAGENTA;
export const FX_COLOR_SWAP = COLOR_CYAN;
export const FX_COLOR_HIGHLIGHT = COLOR_YELLOW;
