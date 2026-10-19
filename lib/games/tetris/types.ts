export interface TetrisSnapshot {
  score: number;
  lines: number;
  level: number;
}

export interface TetrisEngineOptions {
  onChange: (snapshot: TetrisSnapshot) => void; // solo cuando cambia algún campo
  onGameOver: (finalScore: number) => void; // una única vez por partida
}

export interface TetrisEngine {
  update(dt: number): void; // segundos, acotado a 0.05
  draw(ctx: CanvasRenderingContext2D): void;
  press(code: string): void; // acción de un solo frame: mover, rotar, soft/hard drop
  reset(): void; // nueva partida
  getSnapshot(): TetrisSnapshot;
}

export type Shape = number[][];

export interface Piece {
  type: number;
  shape: Shape;
  x: number;
  y: number;
}
