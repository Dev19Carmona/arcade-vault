import type { Scene } from "../fx/timeline";
import type { Sfx } from "./player";
import type { SfxId } from "./sounds";

// Engancha sonidos a una escena de animación: suenan cuando la escena arranca, no al
// encolarla, y una escena descartada por `skip` no suena. Lo comparten VS CPU y en línea.

export interface Cue {
  id: SfxId;
  delayMs?: number; // desde el inicio de la escena, ya ajustado a su velocidad
}

export function withSounds(
  scene: Scene,
  sfx: Sfx | undefined,
  cues: (speed: number) => Cue[],
): Scene {
  if (!sfx) return scene;
  return {
    dur: scene.dur,
    run: (tl, at, speed) => {
      for (const cue of cues(speed)) {
        sfx.play(cue.id, { delayMs: cue.delayMs });
      }
      scene.run(tl, at, speed);
    },
  };
}

export function withSound(
  scene: Scene,
  sfx: Sfx | undefined,
  id: SfxId,
): Scene {
  return withSounds(scene, sfx, () => [{ id }]);
}
