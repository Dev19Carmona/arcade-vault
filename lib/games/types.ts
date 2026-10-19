export interface GameSnapshot {
  score: number;
  lives?: number; // el HUD oculta "Vidas" si es undefined
  level?: number; // el HUD oculta "Nivel" si es undefined
  stats?: { label: string; value: string }[]; // extras, p. ej. LÍNEAS
}

export interface GameCanvasProps {
  paused: boolean;
  runId: number; // cambiarlo reinicia la partida
  onChange: (snapshot: GameSnapshot) => void;
  onGameOver: (finalScore: number) => void;
}
