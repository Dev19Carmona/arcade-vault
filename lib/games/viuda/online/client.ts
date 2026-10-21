import { createClient } from "@/lib/supabase/client";
import { setStatus } from "@/lib/supabase/rooms";
import {
  EVENT_CLIENT,
  EVENT_HAND,
  EVENT_REJECT,
  EVENT_TABLE,
  handChannelName,
  isPrivateHand,
  isPublicTable,
  isRejectMessage,
  roomChannelName,
  type ClientMessage,
  type JoinRejection,
  type OnlineAction,
  type PrivateHand,
  type PublicTable,
} from "./protocol";

// Para entrar, el anfitrión responde a cada `join` con la mesa; si no llega, se reintenta.
const JOIN_RETRY_MS = 2000;
const JOIN_MAX_ATTEMPTS = 5;
// Para volver a su asiento, mientras siga reservado.
const REJOIN_RETRY_MS = 3000;
// Margen antes de dar por caído al anfitrión: presence puede soltar un `leave` falso al sincronizarse.
const HOST_GRACE_MS = 4000;

// Avisos que no cierran la sesión: el jugador espera y el cliente sigue reintentando.
export type RoomNotice = "running" | "reconnecting";

export interface ClientSessionOptions {
  code: string;
  playerId: string;
  name: string;
  hostId: string | null; // para saber si el anfitrión sigue en la sala antes de recibir la mesa
  rejoin: boolean; // vuelve a una partida ya empezada en vez de entrar a una sala
  onTable: (table: PublicTable) => void;
  onHand: (hand: PrivateHand) => void;
  onRejected: (reason: Exclude<JoinRejection, "running">) => void; // definitivo
  onNotice: (notice: RoomNotice | null) => void;
  onHostLeft: () => void;
  onError: (message: string) => void;
}

export interface ClientSession {
  act(action: OnlineAction): void; // pide una acción; el anfitrión decide si vale
  leave(): Promise<void>; // SALIR: avisa al anfitrión y suelta los canales
  dispose(): Promise<void>; // suelta los canales
}

// Sesión de un jugador que no es anfitrión: presence para que el anfitrión lo vea,
// `join` o `rejoin` para pedir sitio, la mesa pública del anfitrión como única verdad y
// un canal propio por el que le llega solo su mano.
export function createClientSession(
  options: ClientSessionOptions,
): ClientSession {
  const { code, playerId, name, onTable, onHand, onRejected, onNotice } =
    options;
  const supabase = createClient();
  const channel = supabase.channel(roomChannelName(code), {
    config: { presence: { key: playerId }, broadcast: { self: false } },
  });
  const handChannel = supabase.channel(handChannelName(code, playerId));

  let hostId = options.hostId;
  let lastSeq = -1;
  let lastHandSeq = -1;
  // `member`: el anfitrión me ha incluido alguna vez en la mesa.
  // `admitted`: ahora mismo me ve conectado.
  let member = false;
  let admitted = false;
  let mode: "join" | "rejoin" = options.rejoin ? "rejoin" : "join";
  let attempts = 0;
  let retryTimer: ReturnType<typeof setInterval> | null = null;
  let hostTimer: ReturnType<typeof setTimeout> | null = null;
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

  function sendEntry() {
    if (mode === "join") send({ kind: "join", playerId, name });
    else send({ kind: "rejoin", playerId });
  }

  // Pide entrar (hasta 5 intentos) o volver (cada 3 s, sin límite) hasta que el anfitrión lo admite.
  function startEntry() {
    if (retryTimer) return;
    attempts = 0;
    sendEntry();
    retryTimer = setInterval(
      () => {
        if (admitted) return stopRetry();
        if (mode === "join" && ++attempts >= JOIN_MAX_ATTEMPTS) {
          stopRetry();
          options.onError("No se pudo contactar con el anfitrión de la sala.");
          return;
        }
        sendEntry();
      },
      mode === "join" ? JOIN_RETRY_MS : REJOIN_RETRY_MS,
    );
  }

  function hostPresent(): boolean {
    return hostId !== null && hostId in channel.presenceState();
  }

  // Sala cerrada para todos: no hay migración de anfitrión.
  function hostLeft() {
    if (disposed) return;
    // Mejor esfuerzo: que la sala no siga figurando como en curso.
    void setStatus(code, "closed").catch(() => {});
    void dispose();
    options.onHostLeft();
  }

  function scheduleHostCheck() {
    if (disposed || hostTimer || hostId === null) return;
    hostTimer = setTimeout(() => {
      hostTimer = null;
      // Si nuestra propia conexión no está al día, presence no es fiable.
      if (disposed || channel.state !== "joined" || hostPresent()) return;
      hostLeft();
    }, HOST_GRACE_MS);
  }

  channel.on("broadcast", { event: EVENT_TABLE }, ({ payload }) => {
    if (disposed || !isPublicTable(payload) || payload.seq <= lastSeq) return;
    const me = payload.seats.find((seat) => seat.playerId === playerId);
    // Solo cuenta como admitido si el anfitrión lo incluye en la mesa; antes de eso,
    // las mesas son de otros jugadores y no se muestran.
    if (!me && !member) return;
    lastSeq = payload.seq;
    hostId = payload.hostId;
    if (me) {
      member = true;
      if (me.connected) {
        admitted = true;
        stopRetry();
        onNotice(null);
      } else if (payload.phase !== "waiting") {
        // El anfitrión me ve desconectado: pido volver hasta que me admita.
        admitted = false;
        mode = "rejoin";
        startEntry();
      }
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
    if (payload.reason === "running") {
      // La partida sigue en curso: hay que esperar a que el anfitrión la pause.
      onNotice("running");
      return;
    }
    // Fuera de presence cuanto antes: el anfitrión no debe volver a verlo como candidato.
    void dispose();
    onRejected(payload.reason);
  });

  channel.on("presence", { event: "leave" }, ({ key }) => {
    if (key === hostId) scheduleHostCheck();
  });
  channel.on("presence", { event: "sync" }, () => {
    if (hostId !== null && !hostPresent()) scheduleHostCheck();
  });

  handChannel.on("broadcast", { event: EVENT_HAND }, ({ payload }) => {
    if (disposed || !isPrivateHand(payload) || payload.seq <= lastHandSeq) {
      return;
    }
    lastHandSeq = payload.seq;
    onHand(payload);
  });
  handChannel.subscribe();

  channel.subscribe(async (status) => {
    if (disposed) return;
    if (status === "SUBSCRIBED") {
      await channel.track({ playerId, name });
      // Tras una reconexión, el anfitrión ya no me da por conectado hasta que vuelva a pedirlo.
      if (member) {
        admitted = false;
        mode = "rejoin";
      }
      startEntry();
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      if (member) {
        // En partida, la librería reintenta sola; mientras tanto se avisa.
        admitted = false;
        onNotice("reconnecting");
      } else {
        options.onError("Se perdió la conexión con la sala.");
      }
    }
  });

  async function dispose() {
    if (disposed) return;
    disposed = true;
    stopRetry();
    if (hostTimer) clearTimeout(hostTimer);
    hostTimer = null;
    await Promise.all([
      supabase.removeChannel(channel),
      supabase.removeChannel(handChannel),
    ]);
  }

  return {
    act(action) {
      if (!disposed) send({ kind: "action", playerId, action });
    },
    async leave() {
      if (!disposed) send({ kind: "leave", playerId });
      await dispose();
    },
    dispose,
  };
}
