import { createClient } from "@/lib/supabase/client";
import {
  EVENT_CLIENT,
  EVENT_REJECT,
  EVENT_TABLE,
  isPublicTable,
  isRejectMessage,
  roomChannelName,
  type ClientMessage,
  type JoinRejection,
  type PublicTable,
} from "./protocol";

// El anfitrión responde a cada `join` con la mesa; si no llega, se reintenta.
const JOIN_RETRY_MS = 2000;
const JOIN_MAX_ATTEMPTS = 5;

export interface ClientSessionOptions {
  code: string;
  playerId: string;
  name: string;
  onTable: (table: PublicTable) => void;
  onRejected: (reason: JoinRejection) => void;
  onError: (message: string) => void;
}

export interface ClientSession {
  leave(): Promise<void>; // SALIR: avisa al anfitrión y suelta el canal
  dispose(): Promise<void>; // suelta el canal
}

// Sesión de un jugador que no es anfitrión: presence para que el anfitrión lo vea,
// `join` para pedir sitio y la mesa que difunde el anfitrión como única verdad.
export function createClientSession(
  options: ClientSessionOptions,
): ClientSession {
  const { code, playerId, name, onTable, onRejected, onError } = options;
  const supabase = createClient();
  const channel = supabase.channel(roomChannelName(code), {
    config: { presence: { key: playerId }, broadcast: { self: false } },
  });

  let lastSeq = -1;
  let joined = false;
  let attempts = 0;
  let retryTimer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  function send(message: ClientMessage) {
    void channel.send({
      type: "broadcast",
      event: EVENT_CLIENT,
      payload: message,
    });
  }

  function stopRetry() {
    if (retryTimer) clearInterval(retryTimer);
    retryTimer = null;
  }

  function requestJoin() {
    send({ kind: "join", playerId, name });
  }

  channel.on("broadcast", { event: EVENT_TABLE }, ({ payload }) => {
    if (disposed || !isPublicTable(payload) || payload.seq <= lastSeq) return;
    // Solo cuenta como admitido si el anfitrión lo incluye en la mesa; antes de eso,
    // las mesas son de otros jugadores y no se muestran.
    const included = payload.seats.some((seat) => seat.playerId === playerId);
    if (!included && !joined) return;
    lastSeq = payload.seq;
    if (included) {
      joined = true;
      stopRetry();
    }
    onTable(payload);
  });

  channel.on("broadcast", { event: EVENT_REJECT }, ({ payload }) => {
    if (
      disposed ||
      !isRejectMessage(payload) ||
      payload.playerId !== playerId
    ) {
      return;
    }
    // Fuera de presence cuanto antes: el anfitrión no debe volver a verlo como candidato.
    void dispose();
    onRejected(payload.reason);
  });

  channel.subscribe(async (status) => {
    if (disposed) return;
    if (status === "SUBSCRIBED") {
      await channel.track({ playerId, name });
      if (joined) return; // reconexión: el anfitrión ya nos conoce por presence
      requestJoin();
      if (!retryTimer) {
        retryTimer = setInterval(() => {
          if (joined) return stopRetry();
          if (++attempts >= JOIN_MAX_ATTEMPTS) {
            stopRetry();
            onError("No se pudo contactar con el anfitrión de la sala.");
            return;
          }
          requestJoin();
        }, JOIN_RETRY_MS);
      }
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      onError("Se perdió la conexión con la sala.");
    }
  });

  async function dispose() {
    if (disposed) return;
    disposed = true;
    stopRetry();
    await supabase.removeChannel(channel);
  }

  return {
    async leave() {
      if (!disposed) send({ kind: "leave", playerId });
      await dispose();
    },
    dispose,
  };
}
