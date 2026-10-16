export type AsteroidsPhase = "playing" | "dead" | "gameover";

export interface AsteroidsSnapshot {
  score: number;
  lives: number;
  level: number;
  phase: AsteroidsPhase;
  tripleShotLeft: number; // segundos restantes del power-up, 0 si no hay
}

export interface AsteroidsEngineOptions {
  onChange: (snapshot: AsteroidsSnapshot) => void; // solo cuando cambia algún campo
  onGameOver: (finalScore: number) => void; // una única vez por partida
}

export interface AsteroidsEngine {
  update(dt: number): void; // dt en segundos, acotado a 0.05
  draw(ctx: CanvasRenderingContext2D): void;
  setKeys(held: ReadonlySet<string>): void; // códigos de `KeyboardEvent.code`
  pressShoot(): void; // pulsación de un solo frame (Space)
  reset(): void; // nueva partida
  getSnapshot(): AsteroidsSnapshot;
}
