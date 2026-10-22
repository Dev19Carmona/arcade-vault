import type { Sfx } from "./sfx/player";

export interface ViudaSnapshot {
  score: number;
  lives: number; // vidas del jugador humano
  round: number;
  rivals: number; // CPU vivas
}

export interface ViudaEngineOptions {
  seatCount?: number; // asientos de la partida; por defecto SEATS (4)
  localSeat?: number; // asiento del jugador local; por defecto HUMAN_SEAT (0)
  onChange: (snapshot: ViudaSnapshot) => void; // solo cuando cambia algún campo
  onGameOver: (finalScore: number) => void; // una única vez por partida
  sfx?: Sfx; // efectos de sonido; sin él la partida es muda
}

export interface ViudaEngine {
  update(dt: number): void; // segundos, acotado a 0.05; mueve el reloj de las CPU
  draw(ctx: CanvasRenderingContext2D): void;
  press(code: string): void; // acción de un solo frame: KeyboardEvent.code
  setPointer(x: number, y: number): void; // coordenadas LÓGICAS, no de pantalla
  pointerDown(x: number, y: number): void; // pulsar: puede empezar un arrastre de carta
  pointerUp(x: number, y: number): void; // soltar: termina el arrastre o cuenta como clic
  pointerCancel(): void; // el gesto se interrumpió: se descarta sin clic
  click(): void;
  reset(): void; // nueva partida
  getSnapshot(): ViudaSnapshot;
}

// 0 = ♣, 1 = ♦, 2 = ♥, 3 = ♠ (identificador del palo; la jerarquía está en SUIT_POWER).
export type Suit = 0 | 1 | 2 | 3;

// 2–10 numéricos, 11 = J, 12 = Q, 13 = K, 14 = A.
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  rank: Rank;
  suit: Suit;
}

// Índice = fuerza: 0 carta alta … 8 escalera de color.
export type HandCategory = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface HandValue {
  category: HandCategory;
  // Rangos que desempatan, de más a menos importante.
  tiebreak: number[];
  // Último desempate: SUIT_POWER de la carta determinante (la de mayor pinta entre las del
  // rango `tiebreak[0]`). 0 en terna, full house y póker, donde el rango ya decide.
  suitBreak: number;
}

// Lo que acaba de ocurrir en la mesa; solo informa a quien anima, no interviene en las reglas.
// `n` crece de uno en uno en toda la partida; `seat` es el índice de asiento.
export type GameEvent =
  | { n: number; kind: "deal" }
  | { n: number; kind: "pass"; seat: number }
  | { n: number; kind: "call"; seat: number }
  | { n: number; kind: "swap5"; seat: number }
  | {
      n: number;
      kind: "swap1";
      seat: number;
      handIndex: number;
      widowIndex: number;
    }
  | { n: number; kind: "showdown" };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
