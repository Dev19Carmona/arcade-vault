import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  claimRoom,
  cleanAlias,
  heartbeat,
  setStatus,
} from "@/lib/supabase/rooms";
import {
  CPU_ONLINE_PAD_MS,
  CPU_THINK_MAX,
  CPU_THINK_MIN,
  LIVES,
  MAX_PLAYERS,
  MIN_HUMANS,
  MIN_PLAYERS,
} from "../constants";
import { chooseCpuAction } from "../cpu";
import {
  advance,
  applyAction,
  createGame,
  eliminate,
  getRanking,
  type RulesState,
} from "../rules";
import type { Card } from "../types";
import { createChatOutbox } from "./chat";
import { saveHostBackup } from "./identity";
import {
  EVENT_BACKUP,
  EVENT_CHAT,
  EVENT_CLIENT,
  EVENT_CLOSED,
  EVENT_HAND,
  EVENT_REJECT,
  EVENT_TABLE,
  handChannelName,
  isChatMessage,
  isClientMessage,
  isPublicTable,
  roomChannelName,
  toPublicEvents,
  type ChatMessage,
  type HostBackup,
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
// Una desconexión solo cuenta si presence sigue sin el jugador pasado este margen:
// al sincronizarse, presence puede emitir un leave seguido de un join sin que nadie se vaya.
const LEAVE_GRACE_MS = 1500;
const FALLBACK_NAME = "JUGADOR";
// Las CPU se identifican por este prefijo; ningún humano puede unirse con un id así.
const CPU_ID_PREFIX = "cpu-";
// Cuántos jugadores guardan la copia del estado para tomar la sala si el anfitrión cae.
const BACKUP_COUNT = 2;
// Tras un relevo, margen para que presence se sincronice antes de dar a cada uno por conectado.
const RESTORE_SYNC_MS = 2000;

export interface HostSessionOptions {
  code: string;
  playerId: string;
  name: string;
  onTable: (table: PublicTable) => void; // la mesa que ve el propio anfitrión
  onHand: (hand: PrivateHand) => void; // su propia mano, sin pasar por la red
  onChat: (message: ChatMessage) => void; // también recibe los propios, sin pasar por la red
  onError: (message: string) => void;
  onReconnecting?: (reconnecting: boolean) => void; // el canal se cayó y se está reconectando
  restore?: HostBackup; // relevo: sigue la sala con el estado que tenía el anfitrión anterior
  onSuperseded?: (hostId: string) => void; // otro jugador tomó la sala mientras este estaba caído
}

export interface HostSession {
  start(): Promise<boolean>; // INICIAR: cierra la entrada y pasa la sala a `playing`
  act(action: OnlineAction): void; // acción del propio anfitrión
  chat(text: string): boolean; // mensaje de chat del anfitrión; false si se descartó
  continueGame(): void; // CONTINUAR en el sorteo y el duelo
  pause(): void; // PAUSAR: ninguna acción de juego se acepta y los desconectados pueden volver
  resume(): void; // REANUDAR: los que siguen desconectados quedan eliminados
  addCpu(): boolean; // ocupa un puesto libre con una CPU; false si no hay hueco o la partida ya empezó
  fillCpus(): number; // ocupa con CPU todos los puestos libres; devuelve cuántas añadió
  removeCpu(playerId: string): void; // quita una CPU de la sala de espera
  eliminatePlayer(playerId: string): void; // ELIMINAR a un jugador desconectado
  rematch(): void; // REVANCHA: vuelve a la sala de espera con los jugadores presentes
  close(): Promise<void>; // SALIR: cierra la sala para todos
  dispose(): Promise<void>; // suelta canales y temporizadores sin tocar el estado de la sala
}

interface Player {
  playerId: string;
  name: string;
  cpu?: boolean; // ausente = humano
}

interface HandLink {
  channel: RealtimeChannel;
  ready: boolean;
  pending: PrivateHand | null;
  pendingBackup: HostBackup | null;
}

// Sesión del anfitrión: es la autoridad de la sala. Decide quién entra, ejecuta las
// reglas, valida cada acción y difunde la mesa pública a todos y la mano privada a
// cada jugador. Solo él ve todas las cartas.
export function createHostSession(options: HostSessionOptions): HostSession {
  const { code, playerId, onTable, onHand, onError, restore } = options;
  const supabase = createClient();
  const channel = supabase.channel(roomChannelName(code), {
    config: { presence: { key: playerId }, broadcast: { self: false } },
  });

  const hostName = cleanAlias(options.name) || FALLBACK_NAME;
  let players: Player[] = restore?.players ?? [{ playerId, name: hostName }];
  // null mientras la sala espera; con partida, el estado de las reglas.
  let game: RulesState | null = restore?.game ?? null;
  // Sube en cada relevo; los clientes ignoran lo que llegue de un `term` menor.
  const term = restore ? restore.term + 1 : 0;
  // Empieza en la hora actual para que una sesión nueva del mismo anfitrión
  // nunca quede por debajo del `seq` que los clientes ya vieron (y, en un relevo,
  // por debajo del último del anfitrión anterior).
  let seq = Math.max(Date.now(), restore ? restore.seq + 1 : 0);
  let superseded = false;
  let everSubscribed = false;
  let restoring = restore !== undefined; // hasta sincronizar presence no se publica
  // Marca de tiempo (no acumulación por frame): la pestaña en segundo plano frena los timers.
  let advanceDeadline: number | null = null;
  // Cuándo actúa la CPU a la que le toca; null si no le toca a ninguna (o en pausa).
  let cpuDeadline: number | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let advanceTimer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  // Pausa y desconexiones (solo con partida).
  let paused = false;
  let pausedRemainingMs: number | null = null; // lo que faltaba para avanzar al pausar
  let pausedPhase: RulesState["phase"] | null = null;
  const connected = new Set<string>(); // jugadores de la partida que siguen conectados
  const removed = new Set<string>(restore?.removed ?? []); // eliminados por desconexión: su asiento ya no está reservado
  const leaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // Un canal por jugador para su mano, así las cartas ocultas no viajan por el público.
  // Se envía por WebSocket cuando el canal ya está suscrito; hasta entonces, solo se
  // guarda la última mano pendiente (enviar antes de suscribirse cae a REST).
  const handLinks = new Map<string, HandLink>();
  const sentHands = new Map<string, string>(); // última mano enviada, para no repetir
  const pendingTaken = new Map<string, Card[]>(); // lo que acaba de tomar de la viuda

  // Quiénes guardan la copia: los siguientes de la lista que siguen conectados.
  function backupTargets(): string[] {
    return players
      .filter(
        (p) =>
          p.playerId !== playerId &&
          !p.cpu &&
          !removed.has(p.playerId) &&
          (!game || connected.has(p.playerId)),
      )
      .slice(0, BACKUP_COUNT)
      .map((p) => p.playerId);
  }

  function makeBackup(): HostBackup {
    const remaining = paused
      ? pausedRemainingMs
      : advanceDeadline === null
        ? null
        : Math.max(0, advanceDeadline - Date.now());
    return {
      seq,
      term,
      players,
      game,
      removed: [...removed],
      advanceRemainingMs: remaining,
    };
  }

  function buildTable(): PublicTable {
    if (!game) {
      return {
        seq,
        term,
        backupIds: backupTargets(),
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
          ...(p.cpu ? { cpu: true } : {}),
        })),
        turnPlayerId: null,
        callerId: null,
        widow: [],
        widowOpen: false,
        ranking: null,
        rankingGroups: null,
        autoAdvanceIn: null,
      };
    }

    const g = game;
    const names = new Map(players.map((p) => [p.playerId, p.name]));
    return {
      seq,
      term,
      backupIds: backupTargets(),
      phase: g.phase,
      paused,
      round: g.round,
      hostId: playerId,
      seats: g.seats.map((seat) => ({
        playerId: seat.id,
        name: names.get(seat.id) ?? FALLBACK_NAME,
        lives: seat.lives,
        alive: seat.alive,
        connected: seat.id === playerId || connected.has(seat.id),
        ...(isCpu(seat.id) ? { cpu: true } : {}),
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
      rankingGroups: g.phase === "final" ? getRanking(g) : null,
      // En pausa la cuenta atrás queda congelada en lo que faltaba.
      autoAdvanceIn: paused
        ? pausedRemainingMs === null
          ? null
          : Math.ceil(pausedRemainingMs / 1000)
        : advanceDeadline === null
          ? null
          : Math.max(0, Math.ceil((advanceDeadline - Date.now()) / 1000)),
      events: toPublicEvents(
        g.lastEvents,
        g.seats.map((seat) => seat.id),
      ),
    };
  }

  function publish() {
    if (disposed || superseded || restoring) return;
    seq++;
    const table = buildTable();
    onTable(table);
    saveHostBackup(code, makeBackup());
    void channel.send({
      type: "broadcast",
      event: EVENT_TABLE,
      payload: table,
    });
    sendBackups(table.backupIds ?? []);
  }

  // La copia del estado va solo a los que pueden relevar al anfitrión, por su canal de mano.
  function sendBackups(ids: string[]) {
    if (ids.length === 0) return;
    const backup = makeBackup();
    for (const id of ids) {
      const link = handLink(id);
      if (link.ready) {
        void link.channel.send({
          type: "broadcast",
          event: EVENT_BACKUP,
          payload: backup,
        });
      } else link.pendingBackup = backup;
    }
  }

  function sendHand(channel: RealtimeChannel, payload: PrivateHand) {
    void channel.send({ type: "broadcast", event: EVENT_HAND, payload });
  }

  function handLink(id: string): HandLink {
    let link = handLinks.get(id);
    if (!link) {
      const channel = supabase.channel(handChannelName(code, id));
      const created: HandLink = {
        channel,
        ready: false,
        pending: null,
        pendingBackup: null,
      };
      channel.subscribe((status) => {
        if (disposed || status !== "SUBSCRIBED") return;
        created.ready = true;
        if (created.pending) sendHand(channel, created.pending);
        if (created.pendingBackup) {
          void channel.send({
            type: "broadcast",
            event: EVENT_BACKUP,
            payload: created.pendingBackup,
          });
        }
        created.pending = null;
        created.pendingBackup = null;
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
      if (isCpu(seat.id)) continue; // el anfitrión ya tiene su mano
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
    // La sala figura con sus humanos: las CPU ceden el puesto a quien entre.
    heartbeat(code, humanCount()).catch(() => {});
  }

  const humanCount = () => players.filter((p) => !p.cpu).length;
  const isCpu = (id: string) => players.some((p) => p.playerId === id && p.cpu);

  // Menor número de CPU libre: al quitar una, su número queda disponible.
  function nextCpu(): Player {
    const taken = new Set(players.map((p) => p.playerId));
    let n = 1;
    while (taken.has(`${CPU_ID_PREFIX}${n}`)) n++;
    return { playerId: `${CPU_ID_PREFIX}${n}`, name: `CPU ${n}`, cpu: true };
  }

  function addCpu(): boolean {
    if (disposed || game || players.length >= MAX_PLAYERS) return false;
    players = [...players, nextCpu()];
    publish();
    return true;
  }

  function fillCpus(): number {
    if (disposed || game) return 0;
    const free = MAX_PLAYERS - players.length;
    if (free <= 0) return 0;
    for (let i = 0; i < free; i++) players = [...players, nextCpu()];
    publish();
    return free;
  }

  function removeCpu(id: string) {
    if (disposed || game) return;
    if (!players.some((p) => p.playerId === id && p.cpu)) return;
    players = players.filter((p) => p.playerId !== id);
    publish();
  }

  // --- Sala de espera ---

  // `reply`: el jugador lo pidió con un mensaje y espera la mesa aunque ya esté dentro.
  function addPlayer(id: string, rawName: string, reply: boolean) {
    if (disposed || id === playerId || id.startsWith(CPU_ID_PREFIX)) return;
    if (players.some((p) => p.playerId === id)) {
      if (reply) publish();
      return;
    }
    if (game) {
      reject(id, "started");
      return;
    }
    const joining: Player = {
      playerId: id,
      name: cleanAlias(rawName) || FALLBACK_NAME,
    };
    if (players.length >= MAX_PLAYERS) {
      // Con la sala llena, el humano toma el puesto de la última CPU añadida.
      const lastCpu = players.findLast((p) => p.cpu);
      if (!lastCpu) {
        reject(id, "full");
        return;
      }
      players = players.map((p) => (p === lastCpu ? joining : p));
    } else {
      players = [...players, joining];
    }
    publish();
    syncRoom();
  }

  function removePlayer(id: string) {
    // Solo en espera: una vez iniciada la partida, la desconexión la gestiona el paso de pausa.
    if (disposed || game || id === playerId) return;
    if (!players.some((p) => p.playerId === id)) return;
    players = players.filter((p) => p.playerId !== id);
    const link = handLinks.get(id);
    if (link) {
      handLinks.delete(id);
      void supabase.removeChannel(link.channel);
    }
    publish();
    syncRoom();
  }

  // --- Partida ---

  // El sorteo y el duelo esperan CONTINUAR; si no llega, avanzan solos (salvo en pausa).
  function armAdvance() {
    if (paused) return;
    const waiting = game?.phase === "draw" || game?.phase === "showdown";
    advanceDeadline = waiting ? Date.now() + AUTO_ADVANCE_MS : null;
  }

  // Si le toca a una CPU, programa su jugada: tiempo de pensar más un margen para que los
  // clientes terminen de animar la anterior. Marca de tiempo, no acumulación por frame.
  function armCpu() {
    cpuDeadline = null;
    if (paused || !game || game.phase !== "turn") return;
    if (!isCpu(game.seats[game.current].id)) return;
    const thinkMs =
      (CPU_THINK_MIN + Math.random() * (CPU_THINK_MAX - CPU_THINK_MIN)) * 1000;
    cpuDeadline = Date.now() + thinkMs + CPU_ONLINE_PAD_MS;
  }

  function runCpu() {
    cpuDeadline = null;
    if (disposed || superseded || paused || !game || game.phase !== "turn") {
      return;
    }
    const id = game.seats[game.current].id;
    if (!isCpu(id)) return;
    // Una acción rechazada dejaría la mesa parada: se pasa como último recurso.
    if (!handleAction(id, chooseCpuAction(game, Math.random))) {
      handleAction(id, { type: "pass" });
    }
  }

  function commit(next: RulesState) {
    game = next;
    armAdvance();
    armCpu();
    publish();
    sendHands();
  }

  function advanceGame() {
    if (disposed || !game || paused) return;
    const result = advance(game, Math.random);
    if (!result.error) commit(result.state);
  }

  // Devuelve true si la acción se aplicó.
  function handleAction(id: string, action: OnlineAction): boolean {
    // En pausa no se acepta ninguna acción; un jugador que el anfitrión ve desconectado tampoco puede jugar.
    if (disposed || !game || paused) return false;
    if (id !== playerId && !connected.has(id)) return false;
    const before = game;
    const result = applyAction(before, id, action);
    // Acción inválida (fuera de turno, viuda cerrada, eliminado…): el estado no cambia.
    if (result.error) return false;
    // Las CPU no reciben mano por la red, así que no hay nada que anunciar.
    if (!isCpu(id)) {
      const index = result.state.seats.findIndex((seat) => seat.id === id);
      if (action.type === "swap5") {
        pendingTaken.set(id, result.state.seats[index].hand);
      } else if (action.type === "swap1") {
        pendingTaken.set(id, [before.widow[action.widowIndex]]);
      }
    }
    commit(result.state);
    return true;
  }

  // --- Desconexión, reenganche y pausa ---

  // En espera, quien se va sale de la sala; en partida, solo queda marcado como desconectado.
  function handleDisconnect(id: string) {
    if (disposed || id === playerId) return;
    if (!game) {
      removePlayer(id);
      return;
    }
    if (connected.delete(id)) publish();
  }

  function scheduleLeaveCheck(id: string) {
    if (disposed || id === playerId) return;
    const pending = leaveTimers.get(id);
    if (pending) clearTimeout(pending);
    leaveTimers.set(
      id,
      setTimeout(() => {
        leaveTimers.delete(id);
        if (disposed || id in channel.presenceState()) return;
        handleDisconnect(id);
      }, LEAVE_GRACE_MS),
    );
  }

  // Un jugador pide volver a su asiento (recargó la pestaña o perdió la conexión).
  function handleRejoin(id: string) {
    if (disposed || id === playerId) return;
    if (!game) {
      // En espera no hay asiento que reservar: si sigue en la lista, se le reenvía la mesa.
      if (players.some((p) => p.playerId === id)) publish();
      else reject(id, "removed");
      return;
    }
    const seat = game.seats.find((s) => s.id === id);
    if (!seat || removed.has(id)) {
      reject(id, "removed");
      return;
    }
    if (connected.has(id)) {
      // El anfitrión aún lo ve conectado: solo recupera la mesa y su mano.
      sentHands.delete(id);
      publish();
      sendHands();
      return;
    }
    // Con la partida en marcha un jugador vivo no puede volver; un espectador sí.
    if (!paused && seat.alive) {
      reject(id, "running");
      return;
    }
    connected.add(id);
    sentHands.delete(id);
    publish();
    sendHands();
  }

  function pause() {
    if (disposed || !game || paused || game.phase === "final") return;
    paused = true;
    pausedPhase = game.phase;
    pausedRemainingMs =
      advanceDeadline === null
        ? null
        : Math.max(0, advanceDeadline - Date.now());
    advanceDeadline = null;
    cpuDeadline = null;
    publish();
  }

  function resume() {
    if (disposed || !game || !paused) return;
    // Quien sigue desconectado al reanudar queda eliminado.
    let next = game;
    for (const seat of game.seats) {
      if (!seat.alive || seat.id === playerId || connected.has(seat.id))
        continue;
      const result = eliminate(next, seat.id);
      if (result.error) continue;
      next = result.state;
      removed.add(seat.id);
    }
    paused = false;
    const remaining = pausedRemainingMs;
    pausedRemainingMs = null;
    game = next;
    armAdvance();
    armCpu();
    // Si la fase no cambió, la cuenta atrás sigue donde se quedó.
    if (
      remaining !== null &&
      advanceDeadline !== null &&
      next.phase === pausedPhase
    ) {
      advanceDeadline = Date.now() + remaining;
    }
    pausedPhase = null;
    publish();
    sendHands();
  }

  // REVANCHA: nueva sala de espera con quienes siguen conectados. Se restauran las vidas
  // al crear la partida siguiente; la sala vuelve a figurar como abierta.
  function rematch() {
    if (disposed || !game || game.phase !== "final") return;
    // Las CPU se quedan en la sala de espera; los humanos, solo si siguen conectados.
    players = players.filter(
      (p) => p.cpu || p.playerId === playerId || connected.has(p.playerId),
    );
    game = null;
    paused = false;
    pausedRemainingMs = null;
    pausedPhase = null;
    advanceDeadline = null;
    cpuDeadline = null;
    if (advanceTimer) clearInterval(advanceTimer);
    advanceTimer = null;
    connected.clear();
    removed.clear();
    sentHands.clear();
    pendingTaken.clear();
    // Los canales de mano se vuelven a abrir al iniciar la siguiente partida.
    const links = [...handLinks.values()];
    handLinks.clear();
    for (const link of links) void supabase.removeChannel(link.channel);
    publish();
    setStatus(code, "waiting").catch(() => {});
    syncRoom();
    if (!heartbeatTimer) heartbeatTimer = setInterval(syncRoom, HEARTBEAT_MS);
  }

  function eliminatePlayer(id: string) {
    if (disposed || !game || id === playerId || isCpu(id)) return;
    const seat = game.seats.find((s) => s.id === id);
    // Solo se elimina a quien está desconectado.
    if (!seat?.alive || connected.has(id)) return;
    const result = eliminate(game, id);
    if (result.error) return;
    removed.add(id);
    commit(result.state);
  }

  channel.on("broadcast", { event: EVENT_CLIENT }, ({ payload }) => {
    if (!isClientMessage(payload)) return;
    // Las CPU solo las mueve el anfitrión: nada que llegue por la red actúa en su nombre.
    if (payload.playerId.startsWith(CPU_ID_PREFIX)) return;
    if (payload.kind === "join") {
      addPlayer(payload.playerId, payload.name, true);
    } else if (payload.kind === "leave") {
      handleDisconnect(payload.playerId);
    } else if (payload.kind === "rejoin") {
      handleRejoin(payload.playerId);
    } else if (payload.kind === "action") {
      handleAction(payload.playerId, payload.action);
    }
  });

  // Chat: llega directo de los demás jugadores; el anfitrión solo lo recibe como uno más.
  channel.on("broadcast", { event: EVENT_CHAT }, ({ payload }) => {
    if (disposed || !isChatMessage(payload) || payload.playerId === playerId) {
      return;
    }
    options.onChat(payload);
  });
  const sendChat = createChatOutbox(playerId, hostName, (message) => {
    void channel.send({
      type: "broadcast",
      event: EVENT_CHAT,
      payload: message,
    });
    options.onChat(message);
  });

  // Otro anfitrión publica en la misma sala: el de `term` mayor (o, en empate, el de id menor) manda.
  channel.on("broadcast", { event: EVENT_TABLE }, ({ payload }) => {
    if (disposed || superseded || !isPublicTable(payload)) return;
    if (payload.hostId === playerId) return;
    const other = payload.term ?? 0;
    if (other > term || (other === term && payload.hostId < playerId)) {
      superseded = true;
      options.onSuperseded?.(payload.hostId);
    } else {
      publish(); // que el otro se entere de que ya no manda
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
      if (typeof id === "string") scheduleLeaveCheck(id);
    }
  });

  channel.subscribe(async (status) => {
    if (disposed) return;
    if (status === "SUBSCRIBED") {
      everSubscribed = true;
      options.onReconnecting?.(false);
      await channel.track({ playerId, name: hostName, host: true });
      if (restoring) {
        setTimeout(finishRestore, RESTORE_SYNC_MS);
        return;
      }
      publish();
      syncRoom();
      if (!heartbeatTimer && !game) {
        heartbeatTimer = setInterval(syncRoom, HEARTBEAT_MS);
      }
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      // Con la sala ya abierta (móvil bloqueado, red caída) la librería reintenta sola y al
      // volver a SUBSCRIBED se retoma la mesa: no es un fallo definitivo.
      if (everSubscribed) options.onReconnecting?.(true);
      else onError("Se perdió la conexión con la sala.");
    }
  });

  function startAdvanceTimer() {
    if (advanceTimer) return;
    advanceTimer = setInterval(() => {
      if (!paused && cpuDeadline !== null && Date.now() >= cpuDeadline) {
        runCpu();
      }
      if (
        !paused &&
        advanceDeadline !== null &&
        Date.now() >= advanceDeadline
      ) {
        advanceGame();
      }
    }, ADVANCE_TICK_MS);
  }

  // Relevo: tras sincronizar presence, se da por conectado a quien siga en el canal y la
  // partida queda en pausa para que los demás puedan volver con `rejoin`.
  function finishRestore() {
    if (disposed || superseded || !restoring || !restore) return;
    restoring = false;
    const present = channel.presenceState();
    if (game) {
      for (const seat of game.seats) {
        if (seat.id === playerId) continue;
        // Las CPU no tienen presence: las dirige quien tenga la sala.
        if (isCpu(seat.id) || (seat.id in present && !removed.has(seat.id)))
          connected.add(seat.id);
      }
      if (game.phase !== "final") {
        paused = true;
        pausedPhase = game.phase;
        pausedRemainingMs =
          game.phase === "draw" || game.phase === "showdown"
            ? restore.advanceRemainingMs
            : null;
      }
      startAdvanceTimer();
      armAdvance();
    } else {
      players = players.filter(
        (p) => p.cpu || p.playerId === playerId || p.playerId in present,
      );
      if (!heartbeatTimer) heartbeatTimer = setInterval(syncRoom, HEARTBEAT_MS);
    }
    claimRoom(code, playerId, hostName, game ? "playing" : "waiting").catch(
      () => {},
    );
    publish();
    sendHands();
  }

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
    for (const timer of leaveTimers.values()) clearTimeout(timer);
    leaveTimers.clear();
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
      if (
        humanCount() < MIN_HUMANS ||
        players.length < MIN_PLAYERS ||
        players.length > MAX_PLAYERS
      )
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
      // Las CPU figuran siempre conectadas: no se desconectan ni se eliminan al reanudar.
      for (const p of players) {
        if (p.playerId !== playerId) connected.add(p.playerId);
      }
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      // Se suscriben ya los canales de mano para que estén listos al repartir.
      for (const p of players)
        if (p.playerId !== playerId && !p.cpu) handLink(p.playerId);
      startAdvanceTimer();
      armAdvance();
      publish();
      return true;
    },
    act(action) {
      handleAction(playerId, action);
    },
    chat(text) {
      if (disposed || channel.state !== "joined") return false;
      return sendChat(text);
    },
    continueGame() {
      advanceGame();
    },
    pause,
    resume,
    addCpu,
    fillCpus,
    removeCpu,
    eliminatePlayer,
    rematch,
    async close() {
      // Aviso explícito: los jugadores no esperan a un relevo cuando se cierra a propósito.
      try {
        await channel.send({
          type: "broadcast",
          event: EVENT_CLOSED,
          payload: { hostId: playerId },
        });
      } catch {
        // Sin aviso, los jugadores caen en la espera normal del anfitrión.
      }
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
