// Identidad del jugador en línea: alias libre (localStorage) e id anónimo de sesión (sessionStorage).
// Toda lectura y escritura va en try/catch: el almacenamiento puede estar bloqueado.

import { isHostBackup, type HostBackup } from "./protocol";

const ALIAS_KEY = "av_viuda_alias";
const SESSION_KEY = "av_viuda_session";

export interface ViudaSession {
  playerId: string;
  code: string;
  isHost?: boolean; // creó la sala: si la pestaña se recarga, vuelve a ella como anfitrión
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
      const { playerId, code, isHost } = parsed as ViudaSession;
      return { playerId, code, isHost: isHost === true };
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
  writeLast(session, false);
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Nada que limpiar.
  }
  try {
    localStorage.removeItem(LAST_KEY);
    localStorage.removeItem(HOST_BACKUP_KEY);
  } catch {
    // Nada que limpiar.
  }
}

// Estado de la partida del anfitrión, para retomarla como anfitrión si cierra la ventana
// o recarga (sin esto solo lo conservan los 2 jugadores de respaldo).
const HOST_BACKUP_KEY = "av_viuda_host_backup";

export function saveHostBackup(code: string, backup: HostBackup): void {
  try {
    localStorage.setItem(HOST_BACKUP_KEY, JSON.stringify({ code, backup }));
  } catch {
    // Sin persistencia: al volver, el anfitrión entra como jugador.
  }
}

export function loadHostBackup(code: string): HostBackup | null {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(HOST_BACKUP_KEY) ?? "null",
    );
    if (parsed && typeof parsed === "object") {
      const { code: saved, backup } = parsed as {
        code?: unknown;
        backup?: unknown;
      };
      if (saved === code && isHostBackup(backup)) return backup;
    }
  } catch {
    // JSON corrupto o almacenamiento bloqueado.
  }
  return null;
}

// Copia en localStorage para volver a la sala tras cerrar la ventana (sessionStorage no
// sobrevive). Solo se recupera dentro del plazo en que la sala espera a quien se fue y si
// ninguna otra pestaña la mantiene viva (así dos pestañas de prueba siguen siendo dos jugadores).
const LAST_KEY = "av_viuda_last";
const RECOVER_MAX_MS = 150_000; // HOST_TIMEOUT_MS (2 min) más margen del relevo
const ALIVE_MS = 12_000; // sin latido durante este tiempo: la pestaña ya no existe

interface LastSession extends ViudaSession {
  seenAt: number;
  released: boolean; // la pestaña se cerró o se ocultó
}

function writeLast(session: ViudaSession, released: boolean): void {
  try {
    const last: LastSession = { ...session, seenAt: Date.now(), released };
    localStorage.setItem(LAST_KEY, JSON.stringify(last));
  } catch {
    // Sin persistencia: no se podrá volver tras cerrar la ventana.
  }
}

function readLast(): LastSession | null {
  try {
    const p = JSON.parse(
      localStorage.getItem(LAST_KEY) ?? "null",
    ) as Partial<LastSession> | null;
    if (
      p &&
      typeof p.playerId === "string" &&
      typeof p.code === "string" &&
      typeof p.seenAt === "number"
    ) {
      return {
        playerId: p.playerId,
        code: p.code,
        isHost: p.isHost === true,
        seenAt: p.seenAt,
        released: p.released === true,
      };
    }
  } catch {
    // JSON corrupto o almacenamiento bloqueado.
  }
  return null;
}

// Latido de la pestaña que está en una sala; `released` marca que se va (pagehide).
export function touchSession(released = false): void {
  const mine = loadSession();
  if (!mine) return;
  const last = readLast();
  if (!last || last.playerId === mine.playerId) writeLast(mine, released);
}

// Sesión de una ventana cerrada, si aún está dentro del plazo y nadie más la usa.
export function recoverSession(): ViudaSession | null {
  const last = readLast();
  if (!last) return null;
  const age = Date.now() - last.seenAt;
  if (age > RECOVER_MAX_MS || (!last.released && age < ALIVE_MS)) return null;
  const session: ViudaSession = {
    playerId: last.playerId,
    code: last.code,
    isHost: last.isHost,
  };
  saveSession(session);
  return session;
}
