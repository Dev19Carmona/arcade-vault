// Preferencia de sonido (`av_sound`): "on" | "off", ausente = activo. Pensada para
// useSyncExternalStore; se comparte entre pestañas por el evento `storage`.

const SOUND_KEY = "av_sound";

// Respaldo en memoria por si localStorage está bloqueado (modo privado, etc.).
let memoryEnabled = true;
const listeners = new Set<() => void>();

export function subscribeSoundEnabled(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function getSoundEnabledSnapshot(): boolean {
  try {
    const raw = localStorage.getItem(SOUND_KEY);
    return raw === null ? memoryEnabled : raw !== "off";
  } catch {
    return memoryEnabled;
  }
}

export function writeSoundEnabled(on: boolean): void {
  memoryEnabled = on;
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // Sin persistencia disponible: la preferencia vive solo en memoria.
  }
  listeners.forEach((l) => l());
}
