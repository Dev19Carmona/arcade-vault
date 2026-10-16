// Resolución lógica del canvas; el escalado visual se resuelve por CSS.
export const W = 800;
export const H = 600;

// Máximo dt por frame (s) para evitar saltos al volver de una pestaña inactiva.
export const MAX_DT = 0.05;

// Power-up de disparo triple
export const POWERUP_DROP_CHANCE = 0.15;
export const POWERUP_DURATION = 5;
export const POWERUP_TTL = 12;
export const TRIPLE_SPREAD = 0.18;

// Asteroides: arrays indexados por tamaño (1 = pequeño, 2 = mediano, 3 = grande)
export const RADII = [0, 16, 30, 50];
export const SPEEDS = [0, 85, 55, 32];
export const POINTS = [0, 100, 50, 20];

// Partida
export const INITIAL_LIVES = 3;
export const INITIAL_ASTEROIDS = 4;
export const SAFE_DIST = 130; // distancia mínima al centro al generar asteroides
export const RESPAWN_DELAY = 2; // s entre morir y reaparecer
export const KILLS_FOR_GUARANTEED_POWERUP = 5;
