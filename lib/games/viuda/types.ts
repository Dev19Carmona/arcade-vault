export interface ViudaSnapshot {
  score: number;
  lives: number; // vidas del jugador humano
  round: number;
  rivals: number; // CPU vivas
}

export interface ViudaEngineOptions {
  onChange: (snapshot: ViudaSnapshot) => void; // solo cuando cambia algún campo
  onGameOver: (finalScore: number) => void; // una única vez por partida
}

export interface ViudaEngine {
  update(dt: number): void; // segundos, acotado a 0.05; mueve el reloj de las CPU
  draw(ctx: CanvasRenderingContext2D): void;
  press(code: string): void; // acción de un solo frame: KeyboardEvent.code
  setPointer(x: number, y: number): void; // coordenadas LÓGICAS, no de pantalla
  click(): void;
  reset(): void; // nueva partida
  getSnapshot(): ViudaSnapshot;
}

// 0 = ♣, 1 = ♦, 2 = ♥, 3 = ♠ (orden de desempate del sorteo).
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
  // Rangos que desempatan, de más a menos importante (los palos no desempatan).
  tiebreak: number[];
}
