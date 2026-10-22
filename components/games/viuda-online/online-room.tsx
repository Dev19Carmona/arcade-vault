"use client";

import { useEffect, useState } from "react";
import type { GameSnapshot } from "@/lib/games/types";
import { clearSession, touchSession } from "@/lib/games/viuda/online/identity";
import { onlineSnapshot } from "@/lib/games/viuda/online/snapshot";
import { RoomChat } from "./chat";
import type { EnteredRoom } from "./lobby";
import { OnlineTable } from "./online-table";
import { useRoomSession, type RoomFailure } from "./use-room-session";
import { WaitingRoom } from "./waiting-room";

function failureText(failure: RoomFailure): string {
  if (failure.kind === "error") return failure.message;
  if (failure.kind === "closed") return "El anfitrión se desconectó.";
  if (failure.reason === "full")
    return "La sala se llenó antes de que entraras.";
  if (failure.reason === "removed") {
    return "Te quitaron de la partida por estar desconectado.";
  }
  return "La partida ya empezó y no admite más jugadores.";
}

// Una sala en línea: espera, partida y fin.
export function OnlineRoom({
  room,
  onLeave,
  onSnapshot,
}: {
  room: EnteredRoom;
  onLeave: () => void;
  onSnapshot: (snapshot: GameSnapshot) => void; // HUD de la plataforma
}) {
  const {
    table,
    hand,
    failure,
    notice,
    hostAwayUntil,
    isHost,
    chat,
    sendChat,
    start,
    act,
    continueGame,
    pause,
    resume,
    eliminatePlayer,
    addCpu,
    fillCpus,
    removeCpu,
    rematch,
    leave,
  } = useRoomSession(room);
  const [starting, setStarting] = useState(false);

  // El HUD muestra RONDA, JUGADORES y mis vidas; sin puntuación ni pausa.
  useEffect(() => {
    onSnapshot(onlineSnapshot(table, room.playerId));
  }, [table, room.playerId, onSnapshot]);

  // Latido para poder volver a la sala si se cierra la ventana (ver identity.ts).
  useEffect(() => {
    touchSession();
    const timer = setInterval(() => touchSession(), 4000);
    const release = () => touchSession(true);
    const resume = () => {
      if (!document.hidden) touchSession();
    };
    window.addEventListener("pagehide", release);
    document.addEventListener("visibilitychange", resume);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", release);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);

  function exit() {
    leave();
    clearSession();
    onLeave();
  }

  async function handleStart() {
    setStarting(true);
    await start();
    // Si salió bien, la pantalla pasa a la partida; tras una revancha vuelve a estar libre.
    setStarting(false);
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
            {notice === "running"
              ? "La partida sigue en curso; espera a que el anfitrión la pause."
              : `Conectando con la sala ${room.code}…`}
          </p>
          <button type="button" className="btn ghost" onClick={exit}>
            {notice === "running" ? "SALIR" : "CANCELAR"}
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
        isHost={isHost}
        hostAwayUntil={hostAwayUntil}
        starting={starting}
        onStart={() => void handleStart()}
        onAddCpu={addCpu}
        onFillCpus={fillCpus}
        onRemoveCpu={removeCpu}
        onLeave={exit}
      />
    );
  }

  return (
    <>
      <OnlineTable
        table={table}
        hand={hand}
        playerId={room.playerId}
        isHost={isHost}
        notice={notice}
        hostAwayUntil={hostAwayUntil}
        onAction={act}
        onContinue={continueGame}
        onPause={pause}
        onResume={resume}
        onEliminate={eliminatePlayer}
        onRematch={rematch}
        onLeave={exit}
      />
      <RoomChat
        table={table}
        playerId={room.playerId}
        chat={chat}
        sendChat={sendChat}
        onAction={act}
      />
    </>
  );
}
