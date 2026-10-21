"use client";

import { useState } from "react";
import { clearSession } from "@/lib/games/viuda/online/identity";
import type { EnteredRoom } from "./lobby";
import { useRoomSession, type RoomFailure } from "./use-room-session";
import { OnlineTable } from "./online-table";
import { WaitingRoom } from "./waiting-room";

function failureText(failure: RoomFailure): string {
  if (failure.kind === "error") return failure.message;
  return failure.reason === "full"
    ? "La sala se llenó antes de que entraras."
    : "La partida ya empezó y no admite más jugadores.";
}

// Una sala en línea: espera, partida y fin. Por ahora, espera y mesa de juego.
export function OnlineRoom({
  room,
  onLeave,
}: {
  room: EnteredRoom;
  onLeave: () => void;
}) {
  const { table, hand, failure, start, act, continueGame, leave } =
    useRoomSession(room);
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

  return (
    <OnlineTable
      table={table}
      hand={hand}
      playerId={room.playerId}
      isHost={room.isHost}
      onAction={act}
      onContinue={continueGame}
      onLeave={exit}
    />
  );
}
