import { FX_CATCHUP_SPEED, FX_MAX_MS } from "../constants";
import type { Card } from "../types";

// Reloj, cola y bloqueo de turno de las animaciones. TypeScript puro: el tiempo
// avanza con `update(dt)` (no con Date.now) para que la pausa lo congele.

export interface Pose {
  x: number;
  y: number;
  rot: number; // radianes
  scale: number;
  flip: number; // 0 = dorso, 1 = cara
}

export interface FlyingCard {
  card: Card | null; // null = se dibuja boca abajo todo el vuelo
  from: Pose;
  to: Pose;
  start: number; // ms en el reloj del timeline
  dur: number;
  hide: string[]; // huecos que no se dibujan quietos mientras dura (p. ej. "own:2")
}

export interface Badge {
  seat: number;
  text: string;
  color: string;
  start: number;
  dur: number;
  sticky?: boolean; // se queda hasta clearSticky (marca del llamador)
}

// Una escena es lo que provoca un evento: añade sus vuelos y carteles al empezar.
export interface Scene {
  dur: number; // duración nominal, sin acelerar
  run: (tl: Timeline, at: number, speed: number) => void;
}

export interface Timeline {
  readonly now: number;
  readonly flights: readonly FlyingCard[];
  readonly badges: readonly Badge[];
  readonly hidden: ReadonlySet<string>;
  readonly lockedUntil: number;
  update(dtSeconds: number): void;
  enqueue(scene: Scene): void;
  addFlight(flight: FlyingCard): void;
  addBadge(badge: Badge): void;
  isLocked(): boolean;
  skip(): void; // termina de golpe lo que anima y descarta lo encolado
  clearSticky(): void;
  reset(): void;
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
// Rebote corto al aparecer: lo usa el cartel de LLAMO.
export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Progreso 0..1 de una animación en `now`; null si aún no empezó o ya terminó.
export function progress(
  start: number,
  dur: number,
  now: number,
): number | null {
  if (now < start || now >= start + dur) return null;
  return clamp01((now - start) / dur);
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    rot: lerp(a.rot, b.rot, t),
    scale: lerp(a.scale, b.scale, t),
    flip: lerp(a.flip, b.flip, t),
  };
}

// Pose de una carta en vuelo; null mientras espera su turno de salir o si ya llegó.
export function flightPose(
  flight: FlyingCard,
  now: number,
  ease: (t: number) => number = easeOutCubic,
): Pose | null {
  const t = progress(flight.start, flight.dur, now);
  return t === null ? null : lerpPose(flight.from, flight.to, ease(t));
}

export function createTimeline(): Timeline {
  let now = 0;
  let lockedUntil = 0;
  let flights: FlyingCard[] = [];
  let badges: Badge[] = [];
  let hidden = new Set<string>();
  let queue: Scene[] = [];
  let sceneEnd = 0; // fin de la escena en curso

  // Los huecos se ocultan desde que se encola el vuelo, incluso durante su retardo.
  function rebuildHidden() {
    hidden = new Set(flights.flatMap((f) => f.hide));
  }

  function startNext() {
    const scene = queue.shift();
    if (!scene) return;
    const speed = queue.length > 0 ? FX_CATCHUP_SPEED : 1;
    scene.run(tl, now, speed);
    sceneEnd = now + Math.min(scene.dur / speed, FX_MAX_MS);
    lockedUntil = sceneEnd;
  }

  const tl: Timeline = {
    get now() {
      return now;
    },
    get flights() {
      return flights;
    },
    get badges() {
      return badges;
    },
    get hidden() {
      return hidden;
    },
    get lockedUntil() {
      return lockedUntil;
    },
    update(dtSeconds) {
      now += dtSeconds * 1000;
      if (queue.length > 0 && now >= sceneEnd) startNext();
      flights = flights.filter((f) => now < f.start + f.dur);
      badges = badges.filter((b) => b.sticky || now < b.start + b.dur);
      rebuildHidden();
    },
    enqueue(scene) {
      queue.push(scene);
      if (now >= sceneEnd) startNext();
    },
    addFlight(flight) {
      flights.push(flight);
      rebuildHidden();
    },
    addBadge(badge) {
      badges.push(badge);
    },
    isLocked() {
      return now < lockedUntil || queue.length > 0;
    },
    skip() {
      queue = [];
      flights = [];
      badges = badges.filter((b) => b.sticky);
      hidden = new Set();
      sceneEnd = now;
      lockedUntil = now;
    },
    clearSticky() {
      badges = badges.filter((b) => !b.sticky);
    },
    reset() {
      now = 0;
      sceneEnd = 0;
      lockedUntil = 0;
      flights = [];
      badges = [];
      hidden = new Set();
      queue = [];
    },
  };
  return tl;
}
