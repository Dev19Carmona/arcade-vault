import { SFX_FILES, SFX_GAIN, type SfxId } from "./sounds";

// Reproductor de efectos con Web Audio. Los buffers se descargan al crearlo y se
// decodifican cuando hay AudioContext. El contexto se crea con el primer gesto del
// usuario (política de autoplay), así no hay avisos en consola antes de tiempo.

export interface PlayOptions {
  delayMs?: number; // retraso para alinear con el escalonado de la animación
  rate?: number; // velocidad de reproducción (1 = original)
}

export interface Sfx {
  play(id: SfxId, opts?: PlayOptions): void;
  setEnabled(on: boolean): void;
  dispose(): void;
}

const IDS = Object.keys(SFX_FILES) as SfxId[];
const UNLOCK_EVENTS = ["pointerdown", "keydown"] as const;

const NOOP_SFX: Sfx = { play() {}, setEnabled() {}, dispose() {} };

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  const w = window as Window & { webkitAudioContext?: AudioContextCtor };
  return globalThis.AudioContext ?? w.webkitAudioContext ?? null;
}

export function createSfx(): Sfx {
  if (typeof window === "undefined") return NOOP_SFX;
  const Ctor = audioContextCtor();
  if (!Ctor) return NOOP_SFX;

  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let enabled = true;
  let disposed = false;
  const raw = new Map<SfxId, ArrayBuffer>();
  const buffers = new Map<SfxId, AudioBuffer>();

  const decodePending = () => {
    if (!ctx) return;
    const target = ctx;
    for (const [id, data] of raw) {
      raw.delete(id);
      // decodeAudioData consume el ArrayBuffer; una copia evita fallos al reintentar.
      target
        .decodeAudioData(data.slice(0))
        .then((buf) => {
          if (!disposed) buffers.set(id, buf);
        })
        .catch(() => {});
    }
  };

  const unlock = () => {
    if (disposed) return;
    if (!ctx) {
      try {
        ctx = new Ctor();
        master = ctx.createGain();
        master.gain.value = SFX_GAIN;
        master.connect(ctx.destination);
      } catch {
        ctx = null;
        return;
      }
      decodePending();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    removeListeners();
  };

  const removeListeners = () => {
    for (const ev of UNLOCK_EVENTS) window.removeEventListener(ev, unlock);
  };

  // Si el usuario ya interactuó con la página, el contexto puede crearse sin aviso.
  if (navigator.userActivation?.hasBeenActive) unlock();
  if (!ctx) {
    for (const ev of UNLOCK_EVENTS) window.addEventListener(ev, unlock);
  }

  for (const id of IDS) {
    fetch(SFX_FILES[id])
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(res.status)))
      .then((data) => {
        if (disposed) return;
        raw.set(id, data);
        decodePending();
      })
      .catch(() => {});
  }

  return {
    play(id, opts) {
      if (!enabled || !ctx || !master || ctx.state !== "running") return;
      const buf = buffers.get(id);
      if (!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = opts?.rate ?? 1;
      src.connect(master);
      src.start(ctx.currentTime + Math.max(0, opts?.delayMs ?? 0) / 1000);
    },
    setEnabled(on) {
      enabled = on;
    },
    dispose() {
      disposed = true;
      removeListeners();
      raw.clear();
      buffers.clear();
      ctx?.close().catch(() => {});
      ctx = null;
      master = null;
    },
  };
}
