"use client";

import { useState } from "react";
import { clearSession } from "@/lib/games/viuda/online/identity";
import type { EnteredRoom } from "./lobby";
import { useRoomSession, type RoomFailure } from "./use-room-session";
import { WaitingRoom } from "./waiting-room";

function failureText(failure: RoomFailure): string {
  if (failure.kind === "error") return failure.message;
  return failure.reason === "full"
    ? "La sala se llenó antes de que entraras."
    : "La partida ya empezó y no admite más jugadores.";
}

// Una sala en línea: espera, partida y fin. Por ahora solo la sala de espera.
export function OnlineRoom({
  room,
  onLeave,
}: {
  room: EnteredRoom;
  onLeave: () => void;
}) {
  const { table, failure, start, leave } = useRoomSession(room);
  const [starting, setStarting] = useState(false);

  function exit() {
    leave();
    clearSession();
    onLeave();
  }

  async function handleStart() {
    setStarting(true);
    const started = await start();
    if (!started) setStarting(false);
  }

  if (failure) {
    return (
      <div className="vd-screen">
        <div className="vd-pick">
          <p role="alert" className="vd-prompt">
            {failureText(failure)}
          </p>
          <button type="button" className="btn" onClick={exit}>
            VOLVER
          </button>
        </div>
      </div>
    );
  }

  if (!table) {
    return (
      <div className="vd-screen">
        <div className="vd-pick">
          <p role="status" className="vd-prompt">
            Conectando con la sala {room.code}…
          </p>
          <button type="button" className="btn ghost" onClick={exit}>
            CANCELAR
          </button>
        </div>
      </div>
    );
  }

  if (table.phase === "waiting") {
    return (
      <WaitingRoom
        code={room.code}
        table={table}
        playerId={room.playerId}
        isHost={room.isHost}
        starting={starting}
        onStart={() => void handleStart()}
        onLeave={exit}
      />
    );
  }

  // La mesa de juego llega en los pasos siguientes.
  return (
    <div className="vd-screen">
      <div className="vd-pick">
        <p role="status" className="vd-prompt">
          La partida ha comenzado con {table.seats.length} jugadores.
        </p>
        <button type="button" className="btn ghost" onClick={exit}>
          SALIR
        </button>
      </div>
    </div>
  );
}
