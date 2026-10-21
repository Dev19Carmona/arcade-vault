"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_PLAYERS } from "@/lib/games/viuda/constants";
import {
  loadSession,
  newPlayerId,
  readAlias,
  saveSession,
  writeAlias,
} from "@/lib/games/viuda/online/identity";
import {
  isValidRoomCode,
  normalizeRoomCode,
} from "@/lib/games/viuda/online/room-code";
import {
  cleanAlias,
  createRoom,
  findRoom,
  joinBlocker,
  listOpenRooms,
  type RoomRow,
} from "@/lib/supabase/rooms";

export interface EnteredRoom {
  code: string;
  playerId: string;
  name: string;
  isHost: boolean;
}

const REFRESH_MS = 5000;

const MESSAGES = {
  missing: "No existe una sala con ese código.",
  closed: "Esa sala ya se cerró.",
  started: "Esa partida ya empezó y no admite más jugadores.",
  full: `La sala está llena (${MAX_PLAYERS} de ${MAX_PLAYERS}).`,
  format: "El código tiene 5 letras o números, por ejemplo K7M2Q.",
  network: "No se pudo conectar con el servidor. Inténtalo de nuevo.",
} as const;

export function Lobby({
  onEnter,
  onBack,
}: {
  onEnter: (room: EnteredRoom) => void;
  onBack: () => void;
}) {
  // El lobby solo se monta tras un clic, así que leer el almacenamiento aquí no desajusta la hidratación.
  const [alias, setAlias] = useState(readAlias);
  const [playerId] = useState(() => loadSession()?.playerId ?? newPlayerId());
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rooms, setRooms] = useState<RoomRow[] | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const requestId = useRef(0);

  const name = cleanAlias(alias);
  const canAct = name.length > 0 && busy === null;

  // Descarta respuestas viejas: solo la última petición actualiza la lista.
  const loadRooms = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const list = await listOpenRooms();
      if (id !== requestId.current) return;
      setRooms(list);
      setListFailed(false);
    } catch {
      if (id === requestId.current) setListFailed(true);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void loadRooms(), 0);
    const timer = setInterval(() => {
      if (!document.hidden) void loadRooms();
    }, REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [loadRooms]);

  function enter(roomCode: string, isHost: boolean) {
    writeAlias(name);
    saveSession({ playerId, code: roomCode });
    onEnter({ code: roomCode, playerId, name, isHost });
  }

  async function create() {
    if (!canAct) return;
    setBusy("create");
    setError(null);
    try {
      const room = await createRoom(playerId, name);
      enter(room.code, true);
    } catch {
      setError(MESSAGES.network);
    } finally {
      setBusy(null);
    }
  }

  async function join(rawCode: string) {
    if (!canAct) return;
    const target = normalizeRoomCode(rawCode);
    if (!isValidRoomCode(target)) {
      setError(MESSAGES.format);
      return;
    }
    setBusy("join");
    setError(null);
    try {
      const room = await findRoom(target);
      if (!room) {
        setError(MESSAGES.missing);
        return;
      }
      const blocker = joinBlocker(room);
      if (blocker) {
        setError(MESSAGES[blocker]);
        void loadRooms();
        return;
      }
      enter(room.code, false);
    } catch {
      setError(MESSAGES.network);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="vd-screen">
      <div className="vd-lobby">
        <header className="vd-head">
          <h2 className="vd-title neon-cyan">JUGAR EN LÍNEA</h2>
          <button type="button" className="btn ghost" onClick={onBack}>
            VOLVER
          </button>
        </header>

        <div className="vd-cols">
          <section className="vd-panel" aria-label="Tu partida">
            <div className="vd-field">
              <label htmlFor="vd-alias">Tu alias</label>
              <input
                id="vd-alias"
                className="vd-input"
                value={alias}
                maxLength={16}
                autoComplete="off"
                spellCheck={false}
                aria-describedby="vd-alias-hint"
                onChange={(e) => setAlias(e.target.value)}
              />
              <p id="vd-alias-hint" className="vd-hint">
                {name
                  ? "Así te verán los demás en la mesa."
                  : "Escribe un alias para crear una sala o unirte a una."}
              </p>
            </div>

            <button
              type="button"
              className="btn lg"
              onClick={create}
              disabled={!canAct}
            >
              {busy === "create" ? "CREANDO…" : "CREAR SALA"}
            </button>

            <div className="vd-or" aria-hidden="true">
              o
            </div>

            <form
              className="vd-field"
              onSubmit={(e) => {
                e.preventDefault();
                void join(code);
              }}
            >
              <label htmlFor="vd-code">Código de sala</label>
              <div className="vd-join">
                <input
                  id="vd-code"
                  className="vd-input code"
                  value={code}
                  maxLength={5}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="K7M2Q"
                  onChange={(e) => {
                    setCode(normalizeRoomCode(e.target.value));
                    setError(null);
                  }}
                />
                <button
                  type="submit"
                  className="btn magenta"
                  disabled={!canAct || code.length === 0}
                >
                  {busy === "join" ? "ENTRANDO…" : "UNIRSE"}
                </button>
              </div>
            </form>

            {error && (
              <p role="alert" className="vd-error">
                {error}
              </p>
            )}
          </section>

          <section className="vd-panel" aria-label="Salas abiertas">
            <div className="vd-panel-head">
              <h3>Salas abiertas</h3>
              <button
                type="button"
                className="btn ghost"
                onClick={() => void loadRooms()}
              >
                ACTUALIZAR
              </button>
            </div>

            {rooms === null && !listFailed && (
              <p className="vd-hint">Buscando salas…</p>
            )}
            {listFailed && (
              <p role="alert" className="vd-error">
                No se pudieron cargar las salas. Pulsa Actualizar para
                reintentar.
              </p>
            )}
            {rooms?.length === 0 && (
              <p className="vd-hint">
                No hay salas abiertas. Crea una y comparte el código.
              </p>
            )}
            {rooms && rooms.length > 0 && (
              <ul className="vd-rooms">
                {rooms.map((room) => (
                  <li key={room.code} className="vd-room">
                    <span className="code">{room.code}</span>
                    <span className="host">{room.host_name}</span>
                    <span
                      className="vd-seats"
                      role="img"
                      aria-label={`${room.player_count} de ${MAX_PLAYERS} jugadores`}
                    >
                      <span className="vd-pips" aria-hidden="true">
                        {Array.from({ length: MAX_PLAYERS }, (_, i) => (
                          <i
                            key={i}
                            className={i < room.player_count ? "on" : ""}
                          />
                        ))}
                      </span>
                      <span className="vd-count" aria-hidden="true">
                        {room.player_count}/{MAX_PLAYERS}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn"
                      disabled={!canAct}
                      onClick={() => void join(room.code)}
                    >
                      ENTRAR
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
