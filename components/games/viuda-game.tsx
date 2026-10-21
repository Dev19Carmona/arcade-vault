"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ViudaCanvas } from "@/components/games/viuda-canvas";
import { OnlineRoom } from "@/components/games/viuda-online/online-room";
import { Lobby, type EnteredRoom } from "@/components/games/viuda-online/lobby";
import type { GameCanvasProps, GameSnapshot } from "@/lib/games/types";
import {
  clearSession,
  loadSession,
  readAlias,
} from "@/lib/games/viuda/online/identity";
import { findRoom, setStatus } from "@/lib/supabase/rooms";

type View =
  | { name: "select" }
  | { name: "cpu" }
  | { name: "lobby" }
  | { name: "room"; room: EnteredRoom };

// Entrada de Viuda en el registro: elige entre VS CPU (el canvas de siempre) y el modo en línea.
export function ViudaGame(props: GameCanvasProps) {
  const [view, setView] = useState<View>({ name: "select" });
  const { onChange } = props;

  // Fuera de VS CPU la plataforma no debe mostrar PAUSA, FIN ni puntuación. Se avisa solo
  // cuando el snapshot cambia: la mesa en línea se actualiza varias veces por segundo.
  const lastReported = useRef("");
  const report = useCallback(
    (snapshot: GameSnapshot) => {
      const key = JSON.stringify(snapshot);
      if (key === lastReported.current) return;
      lastReported.current = key;
      onChange(snapshot);
    },
    [onChange],
  );
  useEffect(() => {
    if (view.name === "select" || view.name === "lobby") {
      report({ score: 0, online: true });
    }
  }, [view.name, report]);

  // Si la pestaña se recargó en plena partida, se vuelve al asiento reservado.
  useEffect(() => {
    const session = loadSession();
    if (!session) return;
    let cancelled = false;
    findRoom(session.code)
      .then((room) => {
        if (cancelled) return;
        if (room?.status === "playing" && room.host_id !== session.playerId) {
          setView((current) =>
            current.name === "select"
              ? {
                  name: "room",
                  room: {
                    code: session.code,
                    playerId: session.playerId,
                    name: readAlias() || "JUGADOR",
                    isHost: false,
                    hostId: room.host_id,
                    rejoin: true,
                  },
                }
              : current,
          );
          return;
        }
        // Sala en espera, cerrada o propia: no hay asiento al que volver. Si era la
        // del anfitrión que recargó, la sala se cierra (no hay migración de anfitrión).
        if (room?.host_id === session.playerId && room.status !== "closed") {
          void setStatus(session.code, "closed").catch(() => {});
        }
        clearSession();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (view.name === "cpu") return <ViudaCanvas {...props} />;

  if (view.name === "lobby") {
    return (
      <Lobby
        onBack={() => setView({ name: "select" })}
        onEnter={(room) => setView({ name: "room", room })}
      />
    );
  }

  if (view.name === "room") {
    return (
      <OnlineRoom
        room={view.room}
        onSnapshot={report}
        onLeave={() => setView({ name: "lobby" })}
      />
    );
  }

  return (
    <div className="vd-screen">
      <div className="vd-pick">
        <p className="vd-prompt">Elige cómo quieres jugar</p>
        <div className="vd-deal">
          <button
            type="button"
            className="vd-card cpu"
            onClick={() => setView({ name: "cpu" })}
          >
            <span className="vd-corner">
              <b>4</b>
              <b>♠</b>
            </span>
            <span className="vd-face">
              <span className="vd-name">VS CPU</span>
              <span className="vd-desc">
                Tú contra 3 CPU. Cada uno juega con 3 vidas.
              </span>
            </span>
            <span className="vd-corner bottom">
              <b>4</b>
              <b>♠</b>
            </span>
          </button>
          <button
            type="button"
            className="vd-card online"
            onClick={() => setView({ name: "lobby" })}
          >
            <span className="vd-corner">
              <b>9</b>
              <b>♥</b>
            </span>
            <span className="vd-face">
              <span className="vd-name">JUGAR EN LÍNEA</span>
              <span className="vd-desc">
                De 2 a 9 jugadores. Crea una sala o entra con un código.
              </span>
            </span>
            <span className="vd-corner bottom">
              <b>9</b>
              <b>♥</b>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
