import type { RulesState } from "../rules";
import type { Card, GameEvent } from "../types";

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

// Lo que acaba de ocurrir, para que cada cliente lo anime. Es el `GameEvent` de las reglas
// con `playerId` en lugar del índice de asiento. No lleva cartas: `swap1` solo dice qué
// huecos se intercambiaron.
export type PublicEvent =
  | { n: number; kind: "deal" }
  | { n: number; kind: "pass" | "call" | "swap5"; playerId: string }
  | {
      n: number;
      kind: "swap1";
      playerId: string;
      handIndex: number;
      widowIndex: number;
    }
  | { n: number; kind: "showdown" };

// De los eventos de las reglas (por asiento) a los públicos (por jugador).
export function toPublicEvents(
  events: readonly GameEvent[],
  seatIds: readonly string[],
): PublicEvent[] {
  return events.map((event): PublicEvent => {
    switch (event.kind) {
      case "deal":
      case "showdown":
        return event;
      case "swap1":
        return {
          n: event.n,
          kind: "swap1",
          playerId: seatIds[event.seat],
          handIndex: event.handIndex,
          widowIndex: event.widowIndex,
        };
      default:
        return { n: event.n, kind: event.kind, playerId: seatIds[event.seat] };
    }
  });
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
  // Lo mismo agrupado: los de un mismo grupo empatan (eliminados en el mismo duelo).
  rankingGroups?: string[][] | null;
  autoAdvanceIn: number | null; // segundos, sorteo y duelo
  // Eventos de la última transición, en orden. Opcional: un cliente que no lo conozca lo
  // ignora y uno nuevo sin él (p. ej. tras `rejoin`) no anima. Se repite en cada mesa hasta
  // la siguiente transición, así que el cliente se queda con los que no vio (`n` nuevo).
  events?: PublicEvent[];
  // Relevo del anfitrión. `term` sube en cada relevo: un anfitrión con `term` menor está
  // desbancado. `backupIds` son los jugadores (por orden) que guardan la copia del estado y
  // pueden tomar la sala si el anfitrión no vuelve. Opcionales por compatibilidad.
  term?: number;
  backupIds?: string[];
}

// Copia completa del estado del anfitrión (incluye todas las manos). Solo viaja, por su
// canal de mano, a los jugadores de `backupIds`, para que uno de ellos pueda seguir la sala.
export interface HostBackup {
  seq: number;
  term: number;
  players: { playerId: string; name: string }[];
  game: RulesState | null;
  removed: string[];
  advanceRemainingMs: number | null; // lo que faltaba para que avanzara solo el sorteo o el duelo
}

// Host → un jugador (canal de mano)
export interface PrivateHand {
  seq: number;
  hand: Card[];
  taken: Card[] | null; // lo que acaba de tomar de la viuda
}

// Host → todos: el anfitrión no admite a este jugador.
// `running` no es definitivo: la partida sigue en marcha y se puede volver cuando el anfitrión la pause.
export type JoinRejection = "full" | "started" | "running" | "removed";
export interface RejectMessage {
  playerId: string;
  reason: JoinRejection;
}

// Nombres de evento de broadcast en el canal público y en el de mano.
export const EVENT_CLIENT = "client";
export const EVENT_TABLE = "table";
export const EVENT_REJECT = "reject";
export const EVENT_HAND = "hand";
export const EVENT_BACKUP = "backup"; // canal de mano: copia del estado para el relevo
export const EVENT_CLOSED = "closed"; // canal público: el anfitrión cierra la sala a propósito
export const EVENT_CHAT = "chat"; // canal público: mensaje de chat de un jugador (efímero)

// Mensaje de chat. Viaja por broadcast entre jugadores, sin pasar por el anfitrión ni guardarse.
export interface ChatMessage {
  id: string; // aleatorio, para deduplicar
  playerId: string;
  alias: string;
  text: string; // 1–140 caracteres
  at: number; // Date.now() del emisor, solo para mostrar
}

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
    Array.isArray(t.seats) &&
    (t.events === undefined || Array.isArray(t.events))
  );
}

export function isPublicEvent(value: unknown): value is PublicEvent {
  if (!value || typeof value !== "object") return false;
  const e = value as {
    n?: unknown;
    kind?: unknown;
    playerId?: unknown;
    handIndex?: unknown;
    widowIndex?: unknown;
  };
  if (typeof e.n !== "number") return false;
  if (e.kind === "deal" || e.kind === "showdown") return true;
  if (typeof e.playerId !== "string") return false;
  if (e.kind === "pass" || e.kind === "call" || e.kind === "swap5") return true;
  return (
    e.kind === "swap1" &&
    Number.isInteger(e.handIndex) &&
    Number.isInteger(e.widowIndex)
  );
}

// Los eventos de una mesa que este cliente sabe animar. Los de un tipo desconocido (de
// un anfitrión más nuevo) se descartan en vez de invalidar la mesa entera.
export function publicEvents(table: PublicTable): PublicEvent[] {
  return (table.events ?? []).filter(isPublicEvent);
}

export function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const m = value as Partial<ChatMessage>;
  return (
    typeof m.id === "string" &&
    m.id.length > 0 &&
    m.id.length <= 96 &&
    typeof m.playerId === "string" &&
    m.playerId.length > 0 &&
    m.playerId.length <= 64 &&
    typeof m.alias === "string" &&
    m.alias.length > 0 &&
    m.alias.length <= 32 &&
    typeof m.text === "string" &&
    m.text.trim().length > 0 &&
    m.text.length <= 140 &&
    typeof m.at === "number"
  );
}

export function isRejectMessage(value: unknown): value is RejectMessage {
  if (!value || typeof value !== "object") return false;
  const m = value as Partial<RejectMessage>;
  return (
    typeof m.playerId === "string" &&
    (m.reason === "full" ||
      m.reason === "started" ||
      m.reason === "running" ||
      m.reason === "removed")
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

export function isHostBackup(value: unknown): value is HostBackup {
  if (!value || typeof value !== "object") return false;
  const b = value as Partial<HostBackup>;
  return (
    typeof b.seq === "number" &&
    typeof b.term === "number" &&
    Array.isArray(b.players) &&
    Array.isArray(b.removed) &&
    (b.game === null ||
      (typeof b.game === "object" && Array.isArray(b.game?.seats)))
  );
}
