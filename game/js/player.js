// player.js — Moth, the courier-thief.
// Movement: WASD / arrows. SHIFT sneaks (slow, quiet, hard to spot).
// SPACE dashes (fast, loud, short cooldown). Click throws a coin that
// clinks on the floor and pulls the nearest guard over to investigate.
// The player has a noise radius: guards within it hear footsteps, dashing
// and coin clinks, and walk over to look.

import { TILE, clamp, dist, moveToward, tileCenter, toTile } from './utils.js';
import { collideCircle } from './utils.js';

export const WALK_SPEED = 148;
export const SNEAK_SPEED = 78;
export const DASH_SPEED = 430;
export const DASH_TIME = 0.22;
export const DASH_COOLDOWN = 1.2;
export const DASH_NOISE_RADIUS = 130;
export const STEP_NOISE_RADIUS = 46;
export const SNEAK_NOISE_RADIUS = 0;
export const COIN_RANGE = 320;
export const COIN_NOISE_RADIUS = 190;
export const COINS_PER_LEVEL = 3;
export const PLAYER_RADIUS = 13;

/**
 * A thrown coin: it arcs to a target tile, lands with a clink, and keeps
 * ringing for a short while so guards have time to turn toward it.
 */
export class Coin {
  constructor(x, y, tx, ty) {
    this.x = x;
    this.y = y;
    this.startX = x;
    this.startY = y;
    this.targetX = tx;
    this.targetY = ty;
    this.flight = 0; // 0..1, the arc progress
    this.flightTime = 0.45;
    this.landed = false;
    this.ringTimer = 0; // seconds left ringing after landing
    this.ringDuration = 1.6;
    this.noiseSent = false;
  }

  update(dt) {
    if (!this.landed) {
      this.flight += dt / this.flightTime;
      if (this.flight >= 1) {
        this.flight = 1;
        this.landed = true;
        this.x = this.targetX;
        this.y = this.targetY;
        this.ringTimer = this.ringDuration;
      } else {
        const t = this.flight;
        this.x = this.startX + (this.targetX - this.startX) * t;
        this.y = this.startY + (this.targetY - this.startY) * t;
      }
    } else if (this.ringTimer > 0) {
      this.ringTimer -= dt;
    }
  }

  /** Height of the coin above the floor while it flies (for the render). */
  arcHeight() {
    if (this.landed) return 0;
    const t = this.flight;
    return Math.sin(t * Math.PI) * 26;
  }

  get active() {
    return !this.landed || this.ringTimer > 0;
  }
}

export class Player {
  constructor(grid) {
    const spawn = tileCenter(grid.spawn.tx, grid.spawn.ty);
    this.grid = grid;
    this.x = spawn.x;
    this.y = spawn.y;
    this.radius = PLAYER_RADIUS;
    this.angle = -Math.PI / 2; // facing up the gallery
    this.moveAngle = -Math.PI / 2;
    this.speed = 0;
    this.sneaking = false;
    this.dashing = false;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.dashDirection = { x: 0, y: -1 };
    this.coins = COINS_PER_LEVEL;
    this.thrownCoins = [];
    this.inShadow = false;
    this.moving = false;
    this.stepTimer = 0;
    this.stepPhase = 0;
    this.shardsCollected = 0;
    this.timesSpotted = 0; // how many times a guard reached ALERTED
    this.dashTrail = []; // fading afterimages while dashing
    this.trailTimer = 0;
    this.idleTime = 0;
  }

  /** Read the keyboard state and turn it into a movement vector. */
  readMoveInput(input) {
    let dx = 0;
    let dy = 0;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;
    if (dx !== 0 && dy !== 0) {
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }
    return { dx, dy };
  }

  /** Start a dash if the cooldown has expired and the player is moving. */
  tryDash(input) {
    if (this.dashCooldown > 0 || this.dashing) return false;
    const { dx, dy } = this.readMoveInput(input);
    if (dx === 0 && dy === 0) return false;
    this.dashing = true;
    this.dashTimer = DASH_TIME;
    this.dashCooldown = DASH_COOLDOWN;
    this.dashDirection = { x: dx, y: dy };
    this.dashTrail = [];
    return true;
  }

  /** Throw a coin toward a world point. Returns the coin or null. */
  throwCoin(worldX, worldY) {
    if (this.coins <= 0) return null;
    const d = dist(this.x, this.y, worldX, worldY);
    const range = Math.min(d, COIN_RANGE);
    const angle = Math.atan2(worldY - this.y, worldX - this.x);
    const tx = this.x + Math.cos(angle) * range;
    const ty = this.y + Math.sin(angle) * range;
    // The coin cannot land inside a wall: pull it back to the last free tile.
    const clamped = this.clampToFreeTile(tx, ty);
    this.coins -= 1;
    const coin = new Coin(this.x, this.y, clamped.x, clamped.y);
    this.thrownCoins.push(coin);
    return coin;
  }

  /** Walk a target point back toward the player until it is on free floor. */
  clampToFreeTile(tx, ty) {
    let x = tx;
    let y = ty;
    for (let i = 0; i < 12; i++) {
      if (!this.grid.solid(toTile(x), toTile(y))) return { x, y };
      x = (x + this.x) / 2;
      y = (y + this.y) / 2;
    }
    return { x: this.x, y: this.y };
  }

  /** Is the player standing on shadow floor right now? */
  updateShadow() {
    this.inShadow = this.grid.isShadow(toTile(this.x), toTile(this.y));
  }

  /** Noise this player makes right now, as a radius guards can hear. */
  noiseRadius() {
    if (this.dashing) return DASH_NOISE_RADIUS;
    if (this.sneaking) return SNEAK_NOISE_RADIUS;
    if (this.moving) return STEP_NOISE_RADIUS;
    return 0;
  }

  /** One simulation step. `world` carries guards, noises and events. */
  update(dt, input, world) {
    this.sneaking = Boolean(input.sneak);
    this.updateShadow();

    // Dash input.
    if (input.dashPressed) {
      if (this.tryDash(input)) world.onPlayerDash(this);
      input.dashPressed = false;
    }

    // Movement.
    const { dx, dy } = this.readMoveInput(input);
    this.moving = dx !== 0 || dy !== 0;
    let speed = this.sneaking ? SNEAK_SPEED : WALK_SPEED;
    let vx = dx * speed;
    let vy = dy * speed;
    if (this.dashing) {
      this.dashTimer -= dt;
      vx = this.dashDirection.x * DASH_SPEED;
      vy = this.dashDirection.y * DASH_SPEED;
      this.trailTimer -= dt;
      if (this.trailTimer <= 0) {
        this.trailTimer = 0.03;
        this.dashTrail.push({ x: this.x, y: this.y, life: 0.3 });
      }
      if (this.dashTimer <= 0) this.dashing = false;
    }
    if (this.dashCooldown > 0) this.dashCooldown -= dt;

    if (this.moving || this.dashing) {
      const nx = this.x + vx * dt;
      const ny = this.y + vy * dt;
      const solved = collideCircle(this.grid, nx, ny, this.radius);
      this.x = solved.x;
      this.y = solved.y;
      this.moveAngle = Math.atan2(vy, vx);
      this.angle = this.moveAngle;
      this.idleTime = 0;
      // Footsteps: walking ticks, sneaking is silent, dashing thuds.
      this.stepTimer -= dt;
      const stepInterval = this.dashing ? 0.16 : this.sneaking ? 0.62 : 0.42;
      if (this.stepTimer <= 0) {
        this.stepTimer = stepInterval;
        this.stepPhase += 1;
        world.onPlayerStep(this);
      }
    } else {
      this.idleTime += dt;
      this.stepTimer = 0.1;
    }

    // Dash afterimages fade.
    for (const t of this.dashTrail) t.life -= dt;
    this.dashTrail = this.dashTrail.filter((t) => t.life > 0);

    // Coins in flight / ringing.
    for (const coin of this.thrownCoins) {
      const wasLanded = coin.landed;
      coin.update(dt);
      if (coin.landed && !wasLanded && !coin.noiseSent) {
        coin.noiseSent = true;
        world.onCoinLanded(coin);
      }
    }
    this.thrownCoins = this.thrownCoins.filter((c) => c.active);

    // Shard pickup: standing on a shard tile collects it.
    const tx = toTile(this.x);
    const ty = toTile(this.y);
    for (const shard of this.grid.shards) {
      if (!shard.taken && shard.tx === tx && shard.ty === ty) {
        shard.taken = true;
        this.shardsCollected += 1;
        world.onShardCollected(shard);
      }
    }

    // Exit: standing on the exit tile ends the level.
    if (this.grid.exit && tx === this.grid.exit.tx && ty === this.grid.exit.ty) {
      world.onReachExit();
    }
  }

  /** Dash cooldown as a 0..1 fraction (1 = ready). */
  dashReadyFraction() {
    return clamp(1 - this.dashCooldown / DASH_COOLDOWN, 0, 1);
  }

  /** Reset the player to the level spawn, for restarts. */
  reset(grid) {
    this.grid = grid;
    const spawn = tileCenter(grid.spawn.tx, grid.spawn.ty);
    this.x = spawn.x;
    this.y = spawn.y;
    this.angle = -Math.PI / 2;
    this.moveAngle = -Math.PI / 2;
    this.coins = COINS_PER_LEVEL;
    this.thrownCoins = [];
    this.shardsCollected = 0;
    this.timesSpotted = 0;
    this.dashing = false;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.dashTrail = [];
    this.idleTime = 0;
  }
}
