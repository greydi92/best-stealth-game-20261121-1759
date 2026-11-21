// particles.js — lightweight particle effects for SHADOWLINE.
// One pool, no allocations in the hot loop: particles are plain objects in
// a single array, spawned by gameplay events and drawn as soft circles,
// sparks, dust puffs and floating motes of archive light.

import { randRange, TAU } from './utils.js';

export const PARTICLE_KIND = {
  SPARK: 'spark', // bright shard pickup burst
  DUST: 'dust', // soft grey puff for footsteps and dashes
  MOTES: 'motes', // slow golden dust drifting in lamp light
  RING: 'ring', // expanding ring for coin clinks and alarms
  GLOW: 'glow', // cyan glow puff on exit unlock
  LEAF: 'leaf', // green fleck when brushing a tall plant
};

/**
 * A single particle. `kind` picks the draw style, `life`/`maxLife` drive
 * the fade, and `vx`/`vy`/`gravity`/`drag` drive the motion.
 */
export class Particle {
  constructor(kind, x, y, vx, vy, life, size, color, gravity = 0, drag = 1) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.size = size;
    this.color = color;
    this.gravity = gravity;
    this.drag = drag;
    this.rotation = randRange(Math.random, 0, TAU);
    this.spin = randRange(Math.random, -3, 3);
  }

  update(dt) {
    this.life -= dt;
    this.vy += this.gravity * dt;
    this.vx *= Math.pow(this.drag, dt * 60);
    this.vy *= Math.pow(this.drag, dt * 60);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rotation += this.spin * dt;
  }

  get alive() {
    return this.life > 0;
  }

  /** Opacity 1 at birth, fading to 0 at death (eased). */
  get alpha() {
    const t = Math.max(0, this.life / this.maxLife);
    return t * t;
  }
}

export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.moteTimer = 0;
  }

  /** Spawn one particle, capping the pool so a burst never floods memory. */
  spawn(particle) {
    if (this.particles.length > 420) this.particles.splice(0, 40);
    this.particles.push(particle);
  }

  /** Star-shard pickup: cyan and gold sparks flying outward. */
  burstShard(x, y) {
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU + randRange(Math.random, -0.2, 0.2);
      const speed = randRange(Math.random, 40, 190);
      const color = i % 3 === 0 ? '#f2c14e' : i % 3 === 1 ? '#5fe3e0' : '#e8e6ff';
      this.spawn(
        new Particle(
          PARTICLE_KIND.SPARK,
          x,
          y,
          Math.cos(a) * speed,
          Math.sin(a) * speed,
          randRange(Math.random, 0.4, 0.9),
          randRange(Math.random, 2, 4.5),
          color,
          60,
          0.94,
        ),
      );
    }
    this.spawn(new Particle(PARTICLE_KIND.RING, x, y, 0, 0, 0.5, 4, '#5fe3e0'));
  }

  /** Footstep dust: a soft grey puff at the player's feet. */
  puffStep(x, y, sneaking) {
    const n = sneaking ? 2 : 4;
    for (let i = 0; i < n; i++) {
      this.spawn(
        new Particle(
          PARTICLE_KIND.DUST,
          x + randRange(Math.random, -6, 6),
          y + randRange(Math.random, -6, 6),
          randRange(Math.random, -12, 12),
          randRange(Math.random, -18, -4),
          randRange(Math.random, 0.3, 0.6),
          randRange(Math.random, 3, 6),
          'rgba(180, 176, 220, 0.5)',
          -20,
          0.92,
        ),
      );
    }
  }

  /** Dash burst: a streak of dust behind the roll. */
  burstDash(x, y, angle) {
    for (let i = 0; i < 10; i++) {
      const a = angle + Math.PI + randRange(Math.random, -0.7, 0.7);
      const speed = randRange(Math.random, 60, 160);
      this.spawn(
        new Particle(
          PARTICLE_KIND.DUST,
          x,
          y,
          Math.cos(a) * speed,
          Math.sin(a) * speed,
          randRange(Math.random, 0.25, 0.5),
          randRange(Math.random, 3, 6),
          'rgba(200, 196, 240, 0.55)',
          0,
          0.9,
        ),
      );
    }
  }

  /** Coin clink: a gold ring expanding from the landing spot. */
  ringCoin(x, y) {
    this.spawn(new Particle(PARTICLE_KIND.RING, x, y, 0, 0, 0.7, 5, '#f2c14e'));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      this.spawn(
        new Particle(
          PARTICLE_KIND.SPARK,
          x,
          y,
          Math.cos(a) * 70,
          Math.sin(a) * 70,
          0.35,
          2,
          '#f2c14e',
          0,
          0.9,
        ),
      );
    }
  }

  /** Alarm flash: red rings pulsing out from a guard who just spotted you. */
  ringAlarm(x, y) {
    this.spawn(new Particle(PARTICLE_KIND.RING, x, y, 0, 0, 0.9, 6, '#ff5a6e'));
    this.spawn(new Particle(PARTICLE_KIND.RING, x, y, 0, 0, 1.2, 3, '#ff5a6e'));
  }

  /** Exit reached: a rising column of cyan glow. */
  burstExit(x, y) {
    for (let i = 0; i < 40; i++) {
      this.spawn(
        new Particle(
          PARTICLE_KIND.GLOW,
          x + randRange(Math.random, -20, 20),
          y + randRange(Math.random, -10, 10),
          randRange(Math.random, -10, 10),
          randRange(Math.random, -90, -30),
          randRange(Math.random, 0.6, 1.2),
          randRange(Math.random, 2, 5),
          i % 2 ? '#5fe3e0' : '#f2c14e',
          -30,
          0.97,
        ),
      );
    }
  }

  /** Brushing a tall plant: a few green flecks. */
  fleckLeaf(x, y) {
    for (let i = 0; i < 5; i++) {
      this.spawn(
        new Particle(
          PARTICLE_KIND.LEAF,
          x + randRange(Math.random, -8, 8),
          y + randRange(Math.random, -8, 8),
          randRange(Math.random, -20, 20),
          randRange(Math.random, -30, -5),
          randRange(Math.random, 0.5, 0.9),
          randRange(Math.random, 2, 3.5),
          '#5da87a',
          40,
          0.96,
        ),
      );
    }
  }

  /** Ambient golden motes drifting through the level, for atmosphere. */
  ambientMotes(dt, view, rng) {
    this.moteTimer -= dt;
    if (this.moteTimer > 0) return;
    this.moteTimer = 0.12;
    const x = view.x + rng() * view.w;
    const y = view.y + rng() * view.h;
    this.spawn(
      new Particle(
        PARTICLE_KIND.MOTES,
        x,
        y,
        randRange(rng, -6, 6),
        randRange(rng, -12, -3),
        randRange(rng, 2, 4),
        randRange(rng, 1, 2.2),
        'rgba(242, 193, 78, 0.6)',
        0,
        1,
      ),
    );
  }

  update(dt) {
    for (const p of this.particles) p.update(dt);
    // Compact the array in place, keeping only the living.
    let write = 0;
    for (let i = 0; i < this.particles.length; i++) {
      if (this.particles[i].alive) this.particles[write++] = this.particles[i];
    }
    this.particles.length = write;
  }

  clear() {
    this.particles.length = 0;
  }
}
