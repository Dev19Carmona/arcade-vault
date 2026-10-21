import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { cleanAlias, heartbeat, setStatus } from "@/lib/supabase/rooms";
import { LIVES, MAX_PLAYERS, MIN_PLAYERS } from "../constants";
import {
  advance,
  applyAction,
  createGame,
  getRanking,
  type RulesState,
} from "../rules";
import type { Card } from "../types";
import {
  EVENT_CLIENT,
  EVENT_HAND,
  EVENT_REJECT,
  EVENT_TABLE,
  handChannelName,
  isClientMessage,
  roomChannelName,
  type JoinRejection,
  type OnlineAction,
  type PrivateHand,
  type PublicTable,
  type RejectMessage,
} from "./protocol";

// El latido mantiene la sala en la lista de abiertas (ventana de 60 s).
const HEARTBEAT_MS = 20_000;
// El sorteo y el duelo avanzan solos tras este tiempo si el anfitrión no pulsa CONTINUAR.
const AUTO_ADVANCE_MS = 8000;
const ADVANCE_TICK_MS = 250;
const FALLBACK_NAME = "JUGADOR";

export interface HostSessionOptions {
  code: string;
  playerId: string;
  name: string;
  onTable: (table: PublicTable) => void; // la mesa que ve el propio anfitrión
  onHand: (hand: PrivateHand) => void; // su propia mano, sin pasar por la red
  onError: (message: string) => void;
}

export interface HostSession {
  start(): Promise<boolean>; // INICIAR: cierra la entrada y pasa la sala a `playing`
  act(action: OnlineAction): void; // acción del propio anfitrión
  continueGame(): void; // CONTINUAR en el sorteo y el duelo
  close(): Promise<void>; // SALIR: cierra la sala para todos
  dispose(): Promise<void>; // suelta canales y temporizadores sin tocar el estado de la sala
}

interface Player {
  playerId: string;
  name: string;
}

interface HandLink {
  channel: RealtimeChannel;
  ready: boolean;
  pending: PrivateHand | null;
}

// Sesión del anfitrión: es la autoridad de la sala. Decide quién entra, ejecuta las
// reglas, valida cada acción y difunde la mesa pública a todos y la mano privada a
// cada jugador. Solo él ve todas las cartas.
export function createHostSession(options: HostSessionOptions): HostSession {
  const { code, playerId, onTable, onHand, onError } = options;
  const supabase = createClient();
  const channel = supabase.channel(roomChannelName(code), {
    config: { presence: { key: playerId }, broadcast: { self: false } },
  });

  const hostName = cleanAlias(options.name) || FALLBACK_NAME;
  let players: Player[] = [{ playerId, name: hostName }];
  // null mientras la sala espera; con partida, el estado de las reglas.
  let game: RulesState | null = null;
  // Empieza en la hora actual para que una sesión nueva del mismo anfitrión
  // nunca quede por debajo del `seq` que los clientes ya vieron.
  let seq = Date.now();
  // Marca de tiempo (no acumulación por frame): la pestaña en segundo plano frena los timers.
  let advanceDeadline: number | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let advanceTimer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  // Un canal por jugador para su mano, así las cartas ocultas no viajan por el público.
  // Se envía por WebSocket cuando el canal ya está suscrito; hasta entonces, solo se
  // guarda la última mano pendiente (enviar antes de suscribirse cae a REST).
  const handLinks = new Map<string, HandLink>();
  const sentHands = new Map<string, string>(); // última mano enviada, para no repetir
  const pendingTaken = new Map<string, Card[]>(); // lo que acaba de tomar de la viuda

  function buildTable(): PublicTable {
    if (!game) {
      return {
        seq,
        phase: "waiting",
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

    const g = game;
    const names = new Map(players.map((p) => [p.playerId, p.name]));
    return {
      seq,
      phase: g.phase,
      paused: false,
      round: g.round,
      hostId: playerId,
      seats: g.seats.map((seat) => ({
        playerId: seat.id,
        name: names.get(seat.id) ?? FALLBACK_NAME,
        lives: seat.lives,
        alive: seat.alive,
        connected: true,
        handCount: seat.alive && g.phase !== "draw" ? seat.hand.length : 0,
        lastAction: seat.caption || null,
        // Las manos solo se ven en el duelo; en el sorteo, la carta sacada es pública.
        hand:
          g.phase === "showdown" && seat.alive
            ? seat.hand
            : g.phase === "draw" && seat.drawCard
              ? [seat.drawCard]
              : null,
      })),
      turnPlayerId: g.phase === "turn" ? g.seats[g.current].id : null,
      callerId: g.caller !== null ? g.seats[g.caller].id : null,
      // La viuda cerrada viaja como nulls: las cartas no salen del anfitrión.
      widow: g.widow.map((card) => (g.widowOpen ? card : null)),
      widowOpen: g.widowOpen,
      ranking: g.phase === "final" ? getRanking(g).flat() : null,
      autoAdvanceIn:
        advanceDeadline === null
          ? null
          : Math.max(0, Math.ceil((advanceDeadline - Date.now()) / 1000)),
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

  function sendHand(channel: RealtimeChannel, payload: PrivateHand) {
    void channel.send({ type: "broadcast", event: EVENT_HAND, payload });
  }

  function handLink(id: string): HandLink {
    let link = handLinks.get(id);
    if (!link) {
      const channel = supabase.channel(handChannelName(code, id));
      const created: HandLink = { channel, ready: false, pending: null };
      channel.subscribe((status) => {
        if (disposed || status !== "SUBSCRIBED") return;
        created.ready = true;
        if (created.pending) sendHand(channel, created.pending);
        created.pending = null;
      });
      handLinks.set(id, created);
      link = created;
    }
    return link;
  }

  // Envía a cada jugador su mano solo si cambió (reparto, cambio de cartas, nueva ronda).
  function sendHands() {
    if (disposed || !game) return;
    for (const seat of game.seats) {
      const hand = seat.alive ? seat.hand : [];
      const key = JSON.stringify(hand);
      const taken = pendingTaken.get(seat.id) ?? null;
      if (key === sentHands.get(seat.id) && !taken) continue;
      if (hand.length === 0 && !sentHands.has(seat.id)) continue;
      sentHands.set(seat.id, key);
      pendingTaken.delete(seat.id);
      seq++;
      const payload: PrivateHand = { seq, hand, taken };
      if (seat.id === playerId) {
        onHand(payload);
        continue;
      }
      const link = handLink(seat.id);
      if (link.ready) sendHand(link.channel, payload);
      else link.pending = payload;
    }
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

  // --- Sala de espera ---

  // `reply`: el jugador lo pidió con un mensaje y espera la mesa aunque ya esté dentro.
  function addPlayer(id: string, rawName: string, reply: boolean) {
    if (disposed || id === playerId) return;
    if (players.some((p) => p.playerId === id)) {
      if (reply) publish();
      return;
    }
    if (game) {
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
    if (disposed || game || id === playerId) return;
    if (!players.some((p) => p.playerId === id)) return;
    players = players.filter((p) => p.playerId !== id);
    publish();
    syncRoom();
  }

  // --- Partida ---

  // El sorteo y el duelo esperan CONTINUAR; si no llega, avanzan solos.
  function armAdvance() {
    const waiting = game?.phase === "draw" || game?.phase === "showdown";
    advanceDeadline = waiting ? Date.now() + AUTO_ADVANCE_MS : null;
  }

  function commit(next: RulesState) {
    game = next;
    armAdvance();
    publish();
    sendHands();
  }

  function advanceGame() {
    if (disposed || !game) return;
    const result = advance(game, Math.random);
    if (!result.error) commit(result.state);
  }

  function handleAction(id: string, action: OnlineAction) {
    if (disposed || !game) return;
    const before = game;
    const result = applyAction(before, id, action);
    // Acción inválida (fuera de turno, viuda cerrada, eliminado…): el estado no cambia.
    if (result.error) return;
    const index = result.state.seats.findIndex((seat) => seat.id === id);
    if (action.type === "swap5") {
      pendingTaken.set(id, result.state.seats[index].hand);
    } else if (action.type === "swap1") {
      pendingTaken.set(id, [before.widow[action.widowIndex]]);
    }
    commit(result.state);
  }

  channel.on("broadcast", { event: EVENT_CLIENT }, ({ payload }) => {
    if (!isClientMessage(payload)) return;
    if (payload.kind === "join") {
      addPlayer(payload.playerId, payload.name, true);
    } else if (payload.kind === "leave") {
      removePlayer(payload.playerId);
    } else if (payload.kind === "action") {
      handleAction(payload.playerId, payload.action);
    }
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
      if (!heartbeatTimer && !game) {
        heartbeatTimer = setInterval(syncRoom, HEARTBEAT_MS);
      }
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      onError("Se perdió la conexión con la sala.");
    }
  });

  function stopTimers() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (advanceTimer) clearInterval(advanceTimer);
    heartbeatTimer = null;
    advanceTimer = null;
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    stopTimers();
    await Promise.all([
      supabase.removeChannel(channel),
      ...[...handLinks.values()].map((link) =>
        supabase.removeChannel(link.channel),
      ),
    ]);
    handLinks.clear();
  }

  return {
    async start() {
      if (disposed || game) return false;
      if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS)
        return false;
      try {
        await setStatus(code, "playing");
      } catch {
        return false;
      }
      game = createGame(
        players.map((p) => p.playerId),
        Math.random,
      );
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      // Se suscriben ya los canales de mano para que estén listos al repartir.
      for (const p of players)
        if (p.playerId !== playerId) handLink(p.playerId);
      advanceTimer = setInterval(() => {
        if (advanceDeadline !== null && Date.now() >= advanceDeadline) {
          advanceGame();
        }
      }, ADVANCE_TICK_MS);
      armAdvance();
      publish();
      return true;
    },
    act(action) {
      handleAction(playerId, action);
    },
    continueGame() {
      advanceGame();
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
