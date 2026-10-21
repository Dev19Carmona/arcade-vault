"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createClientSession,
  type ClientSession,
} from "@/lib/games/viuda/online/client";
import {
  createHostSession,
  type HostSession,
} from "@/lib/games/viuda/online/host";
import type {
  JoinRejection,
  PublicTable,
} from "@/lib/games/viuda/online/protocol";
import type { EnteredRoom } from "@/components/games/viuda-online/lobby";

export type RoomFailure =
  | { kind: "rejected"; reason: JoinRejection }
  | { kind: "error"; message: string };

type Session = HostSession | ClientSession;

// Conecta al jugador con su sala y devuelve la mesa que difunde el anfitrión.
export function useRoomSession(room: EnteredRoom) {
  const [table, setTable] = useState<PublicTable | null>(null);
  const [failure, setFailure] = useState<RoomFailure | null>(null);
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
      };
      const onError = (message: string) =>
        setFailure({ kind: "error", message });
      session = room.isHost
        ? createHostSession({ ...base, onTable: setTable, onError })
        : createClientSession({
            ...base,
            onTable: setTable,
            onRejected: (reason) => setFailure({ kind: "rejected", reason }),
            onError,
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

  // SALIR: el anfitrión cierra la sala; un jugador avisa y se va.
  const leave = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null;
    void ("close" in session ? session.close() : session.leave());
  }, []);

  return { table, failure, start, leave };
}
