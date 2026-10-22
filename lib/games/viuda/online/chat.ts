import type { ChatMessage, PublicEvent, PublicTable } from "./protocol";

// Chat de la sala: TypeScript puro. Los mensajes son efímeros (broadcast del canal público,
// sin historial) y el cliente solo conserva los últimos en memoria.

export const MAX_CHAT_LENGTH = 140;
export const CHAT_HISTORY = 50;
export const CHAT_MIN_INTERVAL_MS = 1000; // un mensaje por segundo por emisor

export type ChatCommand = "pass" | "call";

// «paso» y «llamo» ejecutan la acción; solo cuenta el texto completo, sin importar
// mayúsculas, tildes ni espacios sobrantes («paso a paso» es un mensaje normal).
export function parseChatCommand(text: string): ChatCommand | null {
  const word = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (word === "paso") return "pass";
  if (word === "llamo") return "call";
  return null;
}

// Por qué un comando no se puede ejecutar ahora (null si sí). El anfitrión descarta en
// silencio las acciones inválidas, así que el motivo se calcula aquí con la mesa pública.
export function commandBlockReason(
  table: PublicTable | null,
  playerId: string,
  command: ChatCommand,
): string | null {
  if (!table || table.phase === "waiting") return "La partida aún no empieza";
  if (table.paused) return "La partida está en pausa";
  const me = table.seats.find((s) => s.playerId === playerId);
  if (!me || !me.alive) return "Estás eliminado";
  if (!me.connected) return "Estás desconectado";
  if (table.phase !== "turn") return "No es momento de jugar";
  if (table.turnPlayerId !== playerId) return "No es tu turno";
  if (command === "call" && table.callerId !== null) {
    return "Ya se llamó en esta ronda";
  }
  return null;
}

// Línea de sistema de un evento de la mesa (solo PASO y LLAMO), o null.
export function eventLine(
  event: PublicEvent,
  table: PublicTable,
): string | null {
  if (event.kind !== "pass" && event.kind !== "call") return null;
  const name =
    table.seats.find((s) => s.playerId === event.playerId)?.name ?? "?";
  return `${name} ${event.kind === "pass" ? "pasó" : "llamó"}`;
}

// Texto listo para enviar: recortado y de 1 a MAX_CHAT_LENGTH caracteres, o null.
export function cleanChatText(text: string): string | null {
  const clean = text.trim();
  return clean.length === 0 ? null : clean.slice(0, MAX_CHAT_LENGTH);
}

// Añade un mensaje al final, sin repetidos (por `id`) y conservando solo los últimos.
export function appendChat(
  list: readonly ChatMessage[],
  message: ChatMessage,
): ChatMessage[] {
  if (list.some((m) => m.id === message.id)) return [...list];
  return [...list, message].slice(-CHAT_HISTORY);
}

// Envío de un jugador: valida el texto, limita el ritmo y entrega el mensaje (la sesión lo
// difunde y lo añade a su propia lista). Devuelve false si se descartó.
export function createChatOutbox(
  playerId: string,
  alias: string,
  deliver: (message: ChatMessage) => void,
  now: () => number = Date.now,
): (text: string) => boolean {
  let lastAt = -Infinity;
  return (text) => {
    const clean = cleanChatText(text);
    const at = now();
    if (!clean || at - lastAt < CHAT_MIN_INTERVAL_MS) return false;
    lastAt = at;
    deliver({
      id: `${playerId}-${at}-${Math.random().toString(36).slice(2, 8)}`,
      playerId,
      alias,
      text: clean,
      at,
    });
    return true;
  };
}
