"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { appendScore, getUserSnapshot, parseUser, subscribeUser, writeUser } from "@/lib/session";
import type { SavedScore, User } from "@/lib/session";

interface SessionContextValue {
  user: User | null;
  ready: boolean;
  login: (user: User | null) => void;
  signOut: () => void;
  saveScore: (entry: Omit<SavedScore, "at">) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const subscribeNoop = () => () => {};

export function SessionProvider({ children }: { children: ReactNode }) {
  // En servidor y durante la hidratación: sin sesión y ready=false.
  // Tras hidratar, React relee el snapshot de cliente (localStorage) sin desajuste.
  const rawUser = useSyncExternalStore(subscribeUser, getUserSnapshot, () => null);
  const ready = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const user = useMemo(() => parseUser(rawUser), [rawUser]);

  const login = useCallback((next: User | null) => writeUser(next), []);
  const signOut = useCallback(() => writeUser(null), []);
  const saveScore = useCallback((entry: Omit<SavedScore, "at">) => appendScore(entry), []);

  const value = useMemo(
    () => ({ user, ready, login, signOut, saveScore }),
    [user, ready, login, signOut, saveScore],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de <SessionProvider>");
  return ctx;
}
