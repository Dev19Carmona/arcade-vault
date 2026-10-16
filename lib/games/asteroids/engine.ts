import {
  H,
  INITIAL_ASTEROIDS,
  INITIAL_LIVES,
  KILLS_FOR_GUARANTEED_POWERUP,
  MAX_DT,
  POINTS,
  POWERUP_DROP_CHANCE,
  POWERUP_DURATION,
  RESPAWN_DELAY,
  SAFE_DIST,
  W,
} from "./constants";
import { Asteroid, Bullet, Particle, PowerUp, Ship } from "./entities";
import type {
  AsteroidsEngine,
  AsteroidsEngineOptions,
  AsteroidsPhase,
  AsteroidsSnapshot,
} from "./types";
import { dist, rand } from "./utils";

const NO_KEYS: ReadonlySet<string> = new Set();

export function createAsteroidsEngine({
  onChange,
  onGameOver,
}: AsteroidsEngineOptions): AsteroidsEngine {
  let ship = new Ship();
  let bullets: Bullet[] = [];
  let asteroids: Asteroid[] = [];
  let particles: Particle[] = [];
  let powerUps: PowerUp[] = [];
  let score = 0;
  let lives = INITIAL_LIVES;
  let level = 1;
  let phase: AsteroidsPhase = "playing";
  let deadTimer = 0;
  let powerUpSpawned = false;
  let killsSinceSpawn = 0;
  let keys: ReadonlySet<string> = NO_KEYS;
  let shootQueued = false;
  let last: AsteroidsSnapshot | null = null;

  function getSnapshot(): AsteroidsSnapshot {
    return {
      score,
      lives,
      level,
      phase,
      // Redondeado a décimas para no emitir un cambio en cada frame.
      tripleShotLeft:
        ship.tripleShot > 0 ? Math.ceil(ship.tripleShot * 10) / 10 : 0,
    };
  }

  function emit(force = false) {
    const next = getSnapshot();
    if (
      !force &&
      last &&
      last.score === next.score &&
      last.lives === next.lives &&
      last.level === next.level &&
      last.phase === next.phase &&
      last.tripleShotLeft === next.tripleShotLeft
    ) {
      return;
    }
    last = next;
    onChange(next);
  }

  function spawnAsteroids(count: number) {
    for (let i = 0; i < count; i++) {
      let x: number;
      let y: number;
      do {
        x = rand(0, W);
        y = rand(0, H);
      } while (Math.hypot(x - W / 2, y - H / 2) < SAFE_DIST);
      asteroids.push(new Asteroid(x, y, 3));
    }
  }

  function explode(x: number, y: number, count = 8) {
    for (let i = 0; i < count; i++) particles.push(new Particle(x, y));
  }

  function reset() {
    ship = new Ship();
    bullets = [];
    asteroids = [];
    particles = [];
    powerUps = [];
    powerUpSpawned = false;
    killsSinceSpawn = 0;
    score = 0;
    lives = INITIAL_LIVES;
    level = 1;
    phase = "playing";
    deadTimer = 0;
    shootQueued = false;
    spawnAsteroids(INITIAL_ASTEROIDS);
    emit(true);
  }

  function nextLevel() {
    level++;
    bullets = [];
    particles = [];
    powerUps = [];
    powerUpSpawned = false;
    killsSinceSpawn = 0;
    ship.reset();
    spawnAsteroids(3 + level);
  }

  function killShip() {
    explode(ship.x, ship.y, 14);
    ship.dead = true;
    lives--;
    if (lives <= 0) {
      phase = "gameover";
      emit();
      onGameOver(score);
    } else {
      phase = "dead";
      deadTimer = RESPAWN_DELAY;
    }
  }

  function updateParticles(dt: number) {
    particles.forEach((p) => p.update(dt));
    particles = particles.filter((p) => !p.dead);
  }

  function update(rawDt: number) {
    const dt = Math.min(rawDt, MAX_DT);
    const shoot = shootQueued;
    shootQueued = false;

    if (phase === "gameover") {
      updateParticles(dt);
      return;
    }

    if (phase === "dead") {
      deadTimer -= dt;
      updateParticles(dt);
      asteroids.forEach((a) => a.update(dt));
      if (deadTimer <= 0) {
        phase = "playing";
        ship.reset();
      }
      emit();
      return;
    }

    if (shoot) bullets.push(...ship.tryShoot());

    ship.update(dt, keys);
    bullets.forEach((b) => b.update(dt));
    asteroids.forEach((a) => a.update(dt));
    particles.forEach((p) => p.update(dt));
    powerUps.forEach((p) => p.update(dt));

    bullets = bullets.filter((b) => !b.dead);
    particles = particles.filter((p) => !p.dead);
    powerUps = powerUps.filter((p) => !p.dead);

    for (const p of powerUps) {
      if (!p.dead && dist(ship, p) < ship.radius + p.radius) {
        p.dead = true;
        ship.tripleShot = POWERUP_DURATION;
      }
    }

    // Bala vs asteroide
    const newAsteroids: Asteroid[] = [];
    for (const b of bullets) {
      for (const a of asteroids) {
        if (!a.dead && !b.dead && dist(b, a) < a.radius) {
          b.dead = true;
          a.dead = true;
          score += POINTS[a.size];
          explode(a.x, a.y, a.size * 5);
          newAsteroids.push(...a.split());
          if (!powerUpSpawned) {
            killsSinceSpawn++;
            const guaranteed = killsSinceSpawn >= KILLS_FOR_GUARANTEED_POWERUP;
            if (guaranteed || Math.random() < POWERUP_DROP_CHANCE) {
              powerUps.push(new PowerUp(a.x, a.y));
              powerUpSpawned = true;
            }
          }
        }
      }
    }
    asteroids = asteroids.filter((a) => !a.dead).concat(newAsteroids);
    bullets = bullets.filter((b) => !b.dead);

    // Nave vs asteroide
    if (ship.invincible <= 0) {
      for (const a of asteroids) {
        if (dist(ship, a) < ship.radius + a.radius * 0.82) {
          killShip();
          break;
        }
      }
    }

    // Nivel completado
    if (asteroids.length === 0 && phase === "playing") nextLevel();

    emit();
  }

  function draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    particles.forEach((p) => p.draw(ctx));
    asteroids.forEach((a) => a.draw(ctx));
    powerUps.forEach((p) => p.draw(ctx));
    bullets.forEach((b) => b.draw(ctx));
    ship.draw(ctx);
  }

  reset();

  return {
    update,
    draw,
    setKeys(held) {
      keys = held;
    },
    pressShoot() {
      shootQueued = true;
    },
    reset,
    getSnapshot,
  };
}
