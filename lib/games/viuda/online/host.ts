import { createClient } from "@/lib/supabase/client";
import { cleanAlias, heartbeat, setStatus } from "@/lib/supabase/rooms";
import { LIVES, MAX_PLAYERS, MIN_PLAYERS } from "../constants";
import {
  EVENT_CLIENT,
  EVENT_REJECT,
  EVENT_TABLE,
  isClientMessage,
  roomChannelName,
  type JoinRejection,
  type PublicTable,
  type RejectMessage,
} from "./protocol";

// El latido mantiene la sala en la lista de abiertas (ventana de 60 s).
const HEARTBEAT_MS = 20_000;
const FALLBACK_NAME = "JUGADOR";

export interface HostSessionOptions {
  code: string;
  playerId: string;
  name: string;
  onTable: (table: PublicTable) => void; // la mesa que ve el propio anfitrión
  onError: (message: string) => void;
}

export interface HostSession {
  start(): Promise<boolean>; // INICIAR: cierra la entrada y pasa la sala a `playing`
  close(): Promise<void>; // SALIR: cierra la sala para todos
  dispose(): Promise<void>; // suelta canal y latido sin tocar el estado de la sala
}

interface Player {
  playerId: string;
  name: string;
}

// Sesión del anfitrión: es la autoridad de la sala. Decide quién entra, mantiene
// la lista de jugadores y difunde la mesa a todos por el canal público.
export function createHostSession(options: HostSessionOptions): HostSession {
  const { code, playerId, onTable, onError } = options;
  const supabase = createClient();
  const channel = supabase.channel(roomChannelName(code), {
    config: { presence: { key: playerId }, broadcast: { self: false } },
  });

  const hostName = cleanAlias(options.name) || FALLBACK_NAME;
  let players: Player[] = [{ playerId, name: hostName }];
  let phase: PublicTable["phase"] = "waiting";
  // Empieza en la hora actual para que una sesión nueva del mismo anfitrión
  // nunca quede por debajo del `seq` que los clientes ya vieron.
  let seq = Date.now();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  function buildTable(): PublicTable {
    return {
      seq,
      phase,
      paused: false,
      round: 0,
      hostId: playerId,
      seats: players.map((p) => ({
        playerId: p.playerId,
        name: p.name,
        lives: LIVES,
        alive: true,
        connected: true,
        handCount: 0,
        lastAction: null,
        hand: null,
      })),
      turnPlayerId: null,
      callerId: null,
      widow: [],
      widowOpen: false,
      ranking: null,
      autoAdvanceIn: null,
    };
  }

  function publish() {
    if (disposed) return;
    seq++;
    const table = buildTable();
    onTable(table);
    void channel.send({
      type: "broadcast",
      event: EVENT_TABLE,
      payload: table,
    });
  }

  function reject(targetId: string, reason: JoinRejection) {
    const payload: RejectMessage = { playerId: targetId, reason };
    void channel.send({ type: "broadcast", event: EVENT_REJECT, payload });
  }

  // Los fallos del latido no son críticos: el siguiente lo reintenta.
  function syncRoom() {
    if (disposed) return;
    heartbeat(code, players.length).catch(() => {});
  }

  // `reply`: el jugador lo pidió con un mensaje y espera la mesa aunque ya esté dentro.
  function addPlayer(id: string, rawName: string, reply: boolean) {
    if (disposed || id === playerId) return;
    if (players.some((p) => p.playerId === id)) {
      if (reply) publish();
      return;
    }
    if (phase !== "waiting") {
      reject(id, "started");
      return;
    }
    if (players.length >= MAX_PLAYERS) {
      reject(id, "full");
      return;
    }
    players = [
      ...players,
      { playerId: id, name: cleanAlias(rawName) || FALLBACK_NAME },
    ];
    publish();
    syncRoom();
  }

  function removePlayer(id: string) {
    // Solo en espera: una vez iniciada la partida, la desconexión la gestiona el paso de pausa.
    if (disposed || phase !== "waiting" || id === playerId) return;
    if (!players.some((p) => p.playerId === id)) return;
    players = players.filter((p) => p.playerId !== id);
    publish();
    syncRoom();
  }

  channel.on("broadcast", { event: EVENT_CLIENT }, ({ payload }) => {
    if (!isClientMessage(payload)) return;
    if (payload.kind === "join") {
      addPlayer(payload.playerId, payload.name, true);
    }
    else if (payload.kind === "leave") removePlayer(payload.playerId);
  });

  // Presence cubre lo que no llega por mensaje: pestañas cerradas y reconexiones.
  channel.on("presence", { event: "join" }, ({ newPresences }) => {
    for (const presence of newPresences) {
      const { playerId: id, name } = presence as {
        playerId?: unknown;
        name?: unknown;
      };
      if (typeof id === "string" && id.length <= 64) {
        addPlayer(id, typeof name === "string" ? name : "", false);
      }
    }
  });
  channel.on("presence", { event: "leave" }, ({ leftPresences }) => {
    for (const presence of leftPresences) {
      const { playerId: id } = presence as { playerId?: unknown };
      if (typeof id === "string") removePlayer(id);
    }
  });

  channel.subscribe(async (status) => {
    if (disposed) return;
    if (status === "SUBSCRIBED") {
      await channel.track({ playerId, name: hostName });
      publish();
      syncRoom();
      if (!heartbeatTimer && phase === "waiting") {
        heartbeatTimer = setInterval(syncRoom, HEARTBEAT_MS);
      }
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      onError("Se perdió la conexión con la sala.");
    }
  });

  function stopHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    stopHeartbeat();
    await supabase.removeChannel(channel);
  }

  return {
    async start() {
      if (disposed || phase !== "waiting") return false;
      if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS)
        return false;
      try {
        await setStatus(code, "playing");
      } catch {
        return false;
      }
      phase = "draw";
      stopHeartbeat();
      publish();
      return true;
    },
    async close() {
      try {
        await setStatus(code, "closed");
      } catch {
        // Sin la fila actualizada la sala caduca sola por falta de latido.
      }
      await dispose();
    },
    dispose,
  };
}
