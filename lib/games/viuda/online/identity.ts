// Identidad del jugador en línea: alias libre (localStorage) e id anónimo de sesión (sessionStorage).
// Toda lectura y escritura va en try/catch: el almacenamiento puede estar bloqueado.

const ALIAS_KEY = "av_viuda_alias";
const SESSION_KEY = "av_viuda_session";

export interface ViudaSession {
  playerId: string;
  code: string;
}

export function readAlias(): string {
  try {
    return localStorage.getItem(ALIAS_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeAlias(alias: string): void {
  try {
    localStorage.setItem(ALIAS_KEY, alias);
  } catch {
    // Sin persistencia disponible: el alias se pide de nuevo la próxima vez.
  }
}

export function newPlayerId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // randomUUID solo existe en contextos seguros (https o localhost).
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function loadSession(): ViudaSession | null {
  try {
    const parsed: unknown = JSON.parse(
      sessionStorage.getItem(SESSION_KEY) ?? "null",
    );
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as ViudaSession).playerId === "string" &&
      typeof (parsed as ViudaSession).code === "string"
    ) {
      const { playerId, code } = parsed as ViudaSession;
      return { playerId, code };
    }
  } catch {
    // JSON corrupto o almacenamiento bloqueado: se trata como sin sesión.
  }
  return null;
}

export function saveSession(session: ViudaSession): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Sin persistencia: recargar la pestaña no podrá reenganchar la sala.
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Nada que limpiar.
  }
}
