export interface User {
  name: string;
}

export interface SavedScore {
  game: string;
  score: number;
  name: string;
  at: number;
}

const USER_KEY = "av_user";
const SCORES_KEY = "av_scores";

// Respaldo en memoria por si localStorage está bloqueado (modo privado, etc.).
let memoryUserRaw: string | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function subscribeUser(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Valor crudo de `av_user`; es un string estable, apto para useSyncExternalStore. */
export function getUserSnapshot(): string | null {
  try {
    return localStorage.getItem(USER_KEY);
  } catch {
    return memoryUserRaw;
  }
}

export function parseUser(raw: string | null): User | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as User).name === "string"
    ) {
      return { name: (parsed as User).name };
    }
  } catch {
    // JSON corrupto: se trata como sin sesión.
  }
  return null;
}

export function writeUser(user: User | null): void {
  memoryUserRaw = user ? JSON.stringify(user) : null;
  try {
    if (memoryUserRaw) localStorage.setItem(USER_KEY, memoryUserRaw);
    else localStorage.removeItem(USER_KEY);
  } catch {
    // Sin persistencia disponible: la sesión vive solo en memoria.
  }
  notify();
}

const PLAYER_NAME_KEY = "av_player_name";

// Nombre del leaderboard: independiente del nick de sesión (`av_user`).
let memoryPlayerName: string | null = null;
const playerNameListeners = new Set<() => void>();

export function subscribePlayerName(listener: () => void): () => void {
  playerNameListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    playerNameListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function getPlayerNameSnapshot(): string | null {
  try {
    return localStorage.getItem(PLAYER_NAME_KEY);
  } catch {
    return memoryPlayerName;
  }
}

export function writePlayerName(name: string): void {
  memoryPlayerName = name;
  try {
    localStorage.setItem(PLAYER_NAME_KEY, name);
  } catch {
    // Sin persistencia disponible: el nombre vive solo en memoria.
  }
  playerNameListeners.forEach((l) => l());
}

export function readScores(): SavedScore[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(SCORES_KEY) || "[]",
    );
    return Array.isArray(parsed) ? (parsed as SavedScore[]) : [];
  } catch {
    return [];
  }
}

export function appendScore(entry: Omit<SavedScore, "at">): void {
  try {
    const all = readScores();
    all.push({ ...entry, at: Date.now() });
    localStorage.setItem(SCORES_KEY, JSON.stringify(all));
  } catch {
    // Sin persistencia disponible: la puntuación se descarta.
  }
}
