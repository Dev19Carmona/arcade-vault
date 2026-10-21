"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createClientSession,
  type ClientSession,
  type RoomNotice,
} from "@/lib/games/viuda/online/client";
import {
  createHostSession,
  type HostSession,
} from "@/lib/games/viuda/online/host";
import type {
  JoinRejection,
  OnlineAction,
  PrivateHand,
  PublicTable,
} from "@/lib/games/viuda/online/protocol";
import type { EnteredRoom } from "@/components/games/viuda-online/lobby";

export type RoomFailure =
  | { kind: "rejected"; reason: Exclude<JoinRejection, "running"> }
  | { kind: "closed" } // el anfitrión se desconectó
  | { kind: "error"; message: string };

type Session = HostSession | ClientSession;

// Conecta al jugador con su sala y devuelve la mesa pública y su mano privada.
export function useRoomSession(room: EnteredRoom) {
  const [table, setTable] = useState<PublicTable | null>(null);
  const [hand, setHand] = useState<PrivateHand | null>(null);
  const [failure, setFailure] = useState<RoomFailure | null>(null);
  const [notice, setNotice] = useState<RoomNotice | null>(null);
  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    let session: Session | null = null;
    // StrictMode monta, desmonta y vuelve a montar de golpe. Crear la sesión en el
    // siguiente tick hace que el primer montaje no llegue a abrir canal: el cliente
    // de Realtime reutiliza el canal de un mismo topic, así que abrir dos seguidos
    // acabaría con uno a medio cerrar.
    const timer = setTimeout(() => {
      const base = {
        code: room.code,
        playerId: room.playerId,
        name: room.name,
        onTable: setTable,
        onHand: setHand,
        onError: (message: string) => setFailure({ kind: "error", message }),
      };
      session = room.isHost
        ? createHostSession(base)
        : createClientSession({
            ...base,
            hostId: room.hostId ?? null,
            rejoin: room.rejoin ?? false,
            onRejected: (reason) => setFailure({ kind: "rejected", reason }),
            onNotice: setNotice,
            onHostLeft: () => setFailure({ kind: "closed" }),
          });
      sessionRef.current = session;
    }, 0);

    return () => {
      clearTimeout(timer);
      sessionRef.current = null;
      void session?.dispose();
    };
  }, [room]);

  // INICIAR (solo el anfitrión). Devuelve false si no se pudo.
  const start = useCallback(async (): Promise<boolean> => {
    const session = sessionRef.current;
    return session && "start" in session ? session.start() : false;
  }, []);

  // Pasar, llamar o cambiar cartas; el anfitrión valida y puede rechazarlo.
  const act = useCallback((action: OnlineAction) => {
    sessionRef.current?.act(action);
  }, []);

  // Controles del anfitrión: CONTINUAR, PAUSAR, REANUDAR y ELIMINAR.
  const host = useCallback((run: (session: HostSession) => void) => {
    const session = sessionRef.current;
    if (session && "start" in session) run(session);
  }, []);
  const continueGame = useCallback(() => host((s) => s.continueGame()), [host]);
  const pause = useCallback(() => host((s) => s.pause()), [host]);
  const resume = useCallback(() => host((s) => s.resume()), [host]);
  const rematch = useCallback(() => host((s) => s.rematch()), [host]);
  const eliminatePlayer = useCallback(
    (id: string) => host((s) => s.eliminatePlayer(id)),
    [host],
  );

  // SALIR: el anfitrión cierra la sala; un jugador avisa y se va.
  const leave = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null;
    void ("close" in session ? session.close() : session.leave());
  }, []);

  return {
    table,
    hand,
    failure,
    notice,
    start,
    act,
    continueGame,
    pause,
    resume,
    eliminatePlayer,
    rematch,
    leave,
  };
}
