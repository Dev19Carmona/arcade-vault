"use client";

import { useSyncExternalStore } from "react";
import {
  getSoundEnabledSnapshot,
  subscribeSoundEnabled,
  writeSoundEnabled,
} from "@/lib/games/viuda/sfx/preference";

// El servidor no tiene localStorage: devuelve «activo» para no desajustar la hidratación.
export function useSoundEnabled(): readonly [boolean, (on: boolean) => void] {
  const enabled = useSyncExternalStore(
    subscribeSoundEnabled,
    getSoundEnabledSnapshot,
    () => true,
  );
  return [enabled, writeSoundEnabled];
}
