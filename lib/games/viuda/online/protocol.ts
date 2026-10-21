import type { Card } from "../types";

// Acciones que un jugador puede pedir en su turno. Las usa el núcleo de reglas
// y, en el modo en línea, viajan del cliente al anfitrión.
export type OnlineAction =
  | { type: "pass" }
  | { type: "call" }
  | { type: "swap5" }
  | { type: "swap1"; handIndex: number; widowIndex: number };

// Cliente → host (canal público)
export type ClientMessage =
  | { kind: "join"; playerId: string; name: string }
  | { kind: "rejoin"; playerId: string }
  | { kind: "action"; playerId: string; action: OnlineAction }
  | { kind: "leave"; playerId: string };

export interface PublicSeat {
  playerId: string;
  name: string;
  lives: number;
  alive: boolean;
  connected: boolean;
  handCount: number;
  lastAction: string | null;
  hand: Card[] | null; // solo se rellena en el duelo
}

// Host → todos (canal público)
export interface PublicTable {
  seq: number; // creciente; el cliente descarta mensajes viejos
  phase: "waiting" | "draw" | "turn" | "showdown" | "final";
  paused: boolean;
  round: number;
  hostId: string;
  seats: PublicSeat[]; // en orden de turno
  turnPlayerId: string | null;
  callerId: string | null;
  widow: (Card | null)[]; // null = boca abajo
  widowOpen: boolean;
  ranking: string[] | null; // playerIds del primero al último, solo en `final`
  autoAdvanceIn: number | null; // segundos, sorteo y duelo
}

// Host → un jugador (canal de mano)
export interface PrivateHand {
  seq: number;
  hand: Card[];
  taken: Card[] | null; // lo que acaba de tomar de la viuda
}

// Host → todos: el anfitrión no admite a este jugador.
export type JoinRejection = "full" | "started";
export interface RejectMessage {
  playerId: string;
  reason: JoinRejection;
}

// Nombres de evento de broadcast en el canal público y en el de mano.
export const EVENT_CLIENT = "client";
export const EVENT_TABLE = "table";
export const EVENT_REJECT = "reject";
export const EVENT_HAND = "hand";

export const roomChannelName = (code: string) => `viuda:room:${code}`;
export const handChannelName = (code: string, playerId: string) =>
  `viuda:room:${code}:hand:${playerId}`;

// Los mensajes llegan de otros navegadores: se validan antes de usarlos.
export function isPublicTable(value: unknown): value is PublicTable {
  if (!value || typeof value !== "object") return false;
  const t = value as Partial<PublicTable>;
  return (
    typeof t.seq === "number" &&
    typeof t.phase === "string" &&
    typeof t.hostId === "string" &&
    Array.isArray(t.seats)
  );
}

export function isRejectMessage(value: unknown): value is RejectMessage {
  if (!value || typeof value !== "object") return false;
  const m = value as Partial<RejectMessage>;
  return (
    typeof m.playerId === "string" &&
    (m.reason === "full" || m.reason === "started")
  );
}

export function isClientMessage(value: unknown): value is ClientMessage {
  if (!value || typeof value !== "object") return false;
  const m = value as { kind?: unknown; playerId?: unknown; action?: unknown };
  if (
    typeof m.playerId !== "string" ||
    m.playerId.length === 0 ||
    m.playerId.length > 64
  ) {
    return false;
  }
  if (m.kind === "action") return isOnlineAction(m.action);
  return m.kind === "join" || m.kind === "rejoin" || m.kind === "leave";
}

export function isOnlineAction(value: unknown): value is OnlineAction {
  if (!value || typeof value !== "object") return false;
  const a = value as {
    type?: unknown;
    handIndex?: unknown;
    widowIndex?: unknown;
  };
  if (a.type === "pass" || a.type === "call" || a.type === "swap5") return true;
  return (
    a.type === "swap1" &&
    Number.isInteger(a.handIndex) &&
    Number.isInteger(a.widowIndex)
  );
}

export function isPrivateHand(value: unknown): value is PrivateHand {
  if (!value || typeof value !== "object") return false;
  const h = value as Partial<PrivateHand>;
  return (
    typeof h.seq === "number" &&
    Array.isArray(h.hand) &&
    (h.taken === null || Array.isArray(h.taken))
  );
}
