"use client";

import { useSyncExternalStore } from "react";
import {
  H,
  PORTRAIT_QUERY,
  W,
  setLayoutMode,
} from "@/lib/games/viuda/constants";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(PORTRAIT_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const isPortrait = () => window.matchMedia(PORTRAIT_QUERY).matches;

// Elige el lienzo de la mesa de Viuda según la pantalla: vertical (400×720) en móvil
// en vertical y apaisado (800×600) en el resto. Fija el modo al renderizar, antes de que
// los efectos del canvas creen el motor o dibujen, y devuelve el tamaño del canvas.
export function useViudaLayout(): { width: number; height: number } {
  const portrait = useSyncExternalStore(subscribe, isPortrait, () => false);
  setLayoutMode(portrait ? "portrait" : "landscape");
  return { width: W, height: H };
}
