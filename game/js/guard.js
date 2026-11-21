// guard.js — guard AI for SHADOWLINE.
// States: PATROL -> SUSPICIOUS (investigate what was seen/heard) ->
// ALERTED (chase the player) -> SEARCH (lost the player, sweep the area) ->
// back to PATROL. Suspicion is a 0..1 meter: it rises while the guard sees
// the player and drains while he does not. A guard only catches the player
// by touching them while ALERTED, so there is always a chance to recover.

import { TILE, clamp, dist, moveToward, turnToward, tileCenter, wrapAngle } from './utils.js';
import { canSeePlayer, suspicionRate, suspicionDecay, angleTo, castRay } from './vision.js';

export const GUARD_STATE = {
  PATROL: 'patrol',
  SUSPICIOUS: 'suspicious',
  ALERTED: 'alerted',
  SEARCH: 'search',
  STUNNED: 'stunned',
};

// How suspicious a guard must be to start investigating / chasing.
export const SUSPICIOUS_AT = 0.35;
export const ALERTED_AT = 0.75;
// Distance at which an alerted guard catches the player.
export const CATCH_DISTANCE = 26;
// How long a guard searches the last-seen spot before giving up (seconds).
export const SEARCH_TIME = 6;
// How long a guard pauses to look around at each patrol waypoint.
export const LOOK_AROUND_TIME = 1.1;

/**
 * A single guard. `def` comes from the level data: a waypoint loop in tile
 * coordinates, a patrol speed, a pause at each stop, a vision range and FOV.
 */
export class Guard {
  constructor(def, index, grid) {
    this.index = index;
    this.def = def;
    this.grid = grid;
    const start = tileCenter(def.path[0][0], def.path[0][1]);
    this.x = start.x;
    this.y = start.y;
    this.waypoints = def.path.map(([tx, ty]) => tileCenter(tx, ty));
    this.waypointIndex = 1 % this.waypoints.length;
    this.pauseAtWaypoint = def.pause ?? 1.5;
    this.patrolSpeed = def.speed ?? 55;
    this.range = def.range ?? 260;
    this.fov = ((def.fov ?? 74) * Math.PI) / 180;
    // Facing: toward the next waypoint so the guard starts mid-round.
    const next = this.waypoints[this.waypointIndex];
    this.angle = Math.atan2(next.y - this.y, next.x - this.x);
    this.state = GUARD_STATE.PATROL;
    this.suspicion = 0;
    this.pauseTimer = 0;
    this.searchTimer = 0;
    this.lastSeen = null; // {x, y} of the player's last seen position
    this.investigateTarget = null; // {x, y} — a noise or a glimpse to check
    this.chaseSpeed = this.patrolSpeed * 2.1;
    this.searchSpeed = this.patrolSpeed * 1.5;
    this.stunTimer = 0;
    this.footstepTimer = 0;
    this.footstepPhase = Math.random() * 10;
    this.alertedBefore = false; // latched once, for the level rank
    this.caughtPlayer = false;
    this.turnSpeed = 2.6; // radians per second while patrolling
    this.chaseTurnSpeed = 5.2;
    this.scanAngle = 0; // look-around sweep while paused
    this.scanDirection = 1;
    this.heardNoiseAt = null;
    this.id = 'guard-' + index;
  }

  /** Distance to the player in pixels. */
  distanceToPlayer(player) {
    return dist(this.x, this.y, player.x, player.y);
  }

  /** True while this guard is actively hunting the player. */
  isHunting() {
    return this.state === GUARD_STATE.ALERTED;
  }

  /** True while this guard is at all worried (suspicious or worse). */
  isWorried() {
    return (
      this.state === GUARD_STATE.SUSPICIOUS ||
      this.state === GUARD_STATE.ALERTED ||
      this.state === GUARD_STATE.SEARCH
    );
  }

  /** Hear a noise: if it is close enough, walk over and look. */
  hearNoise(x, y, radius) {
    if (this.state === GUARD_STATE.ALERTED) return;
    if (this.state === GUARD_STATE.STUNNED) return;
    const d = dist(this.x, this.y, x, y);
    if (d > radius + 40) return;
    // A close noise is more convincing than a distant one.
    const strength = 1 - clamp(d / (radius + 40), 0, 1);
    this.heardNoiseAt = { x, y };
    this.investigateTarget = { x, y };
    if (strength > 0.45) {
      this.state = GUARD_STATE.SUSPICIOUS;
      this.suspicion = Math.max(this.suspicion, 0.4);
    } else {
      // A faint sound only turns the guard's head.
      this.angle = angleTo(this, x, y);
      this.suspicion = Math.max(this.suspicion, 0.18);
    }
  }

  /** Walk toward a target point at `speed`, sliding around solid tiles. */
  moveTowardPoint(tx, ty, speed, dt) {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 2) return true; // arrived
    const step = Math.min(d, speed * dt);
    const nx = this.x + (dx / d) * step;
    const ny = this.y + (dy / d) * step;
    // Axis-separated collision so the guard slides along walls.
    const r = 13;
    let cx = nx;
    let cy = this.y;
    if (this.hitsSolid(cx, cy, r)) cx = this.x;
    if (this.hitsSolid(cx, ny, r)) cy = this.y;
    else cy = ny;
    this.x = cx;
    this.y = cy;
    this.angle = turnToward(this.angle, Math.atan2(dy, dx), this.chaseTurnSpeed * dt);
    return d - step < 3;
  }

  /** Circle-vs-solid-tiles test at a candidate position. */
  hitsSolid(x, y, r) {
    const minTx = Math.floor((x - r) / TILE);
    const maxTx = Math.floor((x + r) / TILE);
    const minTy = Math.floor((y - r) / TILE);
    const maxTy = Math.floor((y + r) / TILE);
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (!this.grid.solid(tx, ty)) continue;
        const bx = tx * TILE;
        const by = ty * TILE;
        const closestX = clamp(x, bx, bx + TILE);
        const closestY = clamp(y, by, by + TILE);
        const dx = x - closestX;
        const dy = y - closestY;
        if (dx * dx + dy * dy < r * r) return true;
      }
    }
    return false;
  }

  /** Advance one patrol waypoint, pausing and looking around at each stop. */
  updatePatrol(dt) {
    if (this.pauseTimer > 0) {
      this.pauseTimer -= dt;
      // Look around while waiting: slow sweep left and right.
      this.scanAngle += this.scanDirection * dt * 0.9;
      if (this.scanAngle > 0.9) this.scanDirection = -1;
      if (this.scanAngle < -0.9) this.scanDirection = 1;
      const base = Math.atan2(
        this.waypoints[this.waypointIndex].y - this.y,
        this.waypoints[this.waypointIndex].x - this.x,
      );
      this.angle = turnToward(this.angle, base + this.scanAngle, 1.4 * dt);
      if (this.pauseTimer <= 0) {
        this.waypointIndex = (this.waypointIndex + 1) % this.waypoints.length;
        this.scanAngle = 0;
      }
      return;
    }
    const target = this.waypoints[this.waypointIndex];
    const arrived = this.moveTowardPoint(target.x, target.y, this.patrolSpeed, dt);
    if (arrived) this.pauseTimer = this.pauseAtWaypoint;
  }

  /** Walk to the investigate target, look around, then return to patrol. */
  updateSuspicious(dt) {
    if (!this.investigateTarget) {
      this.state = GUARD_STATE.PATROL;
      return;
    }
    const arrived = this.moveTowardPoint(
      this.investigateTarget.x,
      this.investigateTarget.y,
      this.searchSpeed,
      dt,
    );
    if (arrived) {
      this.pauseTimer -= dt;
      // Sweep the area with the cone.
      this.angle += dt * 1.8;
      if (this.pauseTimer <= -LOOK_AROUND_TIME * 2) {
        this.investigateTarget = null;
        this.state = GUARD_STATE.PATROL;
        this.pauseTimer = 0;
      }
    } else {
      this.pauseTimer = 0;
    }
  }

  /** Chase the player's last seen position; re-acquire if still visible. */
  updateAlerted(dt, player, world) {
    const target = this.lastSeen ?? { x: player.x, y: player.y };
    this.moveTowardPoint(target.x, target.y, this.chaseSpeed, dt);
    const d = this.distanceToPlayer(player);
    if (d < CATCH_DISTANCE) {
      this.caughtPlayer = true;
      world.onPlayerCaught(this);
    }
    // If the player is far ahead and unseen, keep running to the last spot.
    if (this.lastSeen && dist(this.x, this.y, this.lastSeen.x, this.lastSeen.y) < 12) {
      this.state = GUARD_STATE.SEARCH;
      this.searchTimer = SEARCH_TIME;
      this.lastSeen = null;
    }
  }

  /** Sweep around the last-seen spot, then give up and resume the round. */
  updateSearch(dt) {
    this.searchTimer -= dt;
    this.angle += dt * 2.4; // slow 360 sweep
    if (this.searchTimer <= 0) {
      this.state = GUARD_STATE.PATROL;
      this.investigateTarget = null;
    }
  }

  /** One simulation step. `world` carries the player, noises and events. */
  update(dt, player, world) {
    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
      return;
    }
    const seen = canSeePlayer(this.grid, this, player);
    if (seen.seen) {
      const rate = suspicionRate(this, player, seen.distance);
      this.suspicion = clamp(this.suspicion + rate * dt, 0, 1);
      this.lastSeen = { x: player.x, y: player.y };
      this.angle = turnToward(this.angle, seen.angleToPlayer, this.chaseTurnSpeed * dt);
      if (this.suspicion >= ALERTED_AT && this.state !== GUARD_STATE.ALERTED) {
        this.state = GUARD_STATE.ALERTED;
        this.alertedBefore = true;
        world.onGuardAlerted(this);
      } else if (
        this.suspicion >= SUSPICIOUS_AT &&
        this.state === GUARD_STATE.PATROL
      ) {
        this.state = GUARD_STATE.SUSPICIOUS;
        this.investigateTarget = { x: player.x, y: player.y };
        this.pauseTimer = 0;
      }
    } else {
      this.suspicion = clamp(this.suspicion - suspicionDecay(this.suspicion) * dt, 0, 1);
      if (this.state === GUARD_STATE.ALERTED && this.suspicion < ALERTED_AT) {
        // Lost sight mid-chase: fall back to searching the last seen spot.
        this.state = GUARD_STATE.SEARCH;
        this.searchTimer = SEARCH_TIME;
      } else if (
        this.state === GUARD_STATE.SUSPICIOUS &&
        this.suspicion < 0.12 &&
        !this.investigateTarget
      ) {
        this.state = GUARD_STATE.PATROL;
      }
    }

    // Footstep timing for the audio engine: a step every stride.
    const moving =
      this.state === GUARD_STATE.PATROL ||
      this.state === GUARD_STATE.SUSPICIOUS ||
      this.state === GUARD_STATE.ALERTED;
    if (moving) {
      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0) {
        this.footstepTimer = this.state === GUARD_STATE.ALERTED ? 0.34 : 0.55;
        this.footstepPhase += 1;
        world.onGuardStep(this);
      }
    }

    switch (this.state) {
      case GUARD_STATE.PATROL:
        this.updatePatrol(dt);
        break;
      case GUARD_STATE.SUSPICIOUS:
        this.updateSuspicious(dt);
        break;
      case GUARD_STATE.ALERTED:
        this.updateAlerted(dt, player, world);
        break;
      case GUARD_STATE.SEARCH:
        this.updateSearch(dt);
        break;
      default:
        this.updatePatrol(dt);
    }
  }

  /** Cone colour for rendering: calm blue, suspicious amber, hunting red. */
  coneColor() {
    if (this.state === GUARD_STATE.ALERTED) return { r: 255, g: 74, b: 96 };
    if (this.state === GUARD_STATE.SUSPICIOUS || this.state === GUARD_STATE.SEARCH)
      return { r: 255, g: 176, b: 66 };
    return { r: 95, g: 227, b: 224 };
  }

  /** Small status label used by the HUD eye and the minimap. */
  statusLabel() {
    switch (this.state) {
      case GUARD_STATE.PATROL:
        return this.suspicion > 0.05 ? 'wary' : 'calm';
      case GUARD_STATE.SUSPICIOUS:
        return 'suspicious';
      case GUARD_STATE.ALERTED:
        return 'hunting';
      case GUARD_STATE.SEARCH:
        return 'searching';
      default:
        return 'calm';
    }
  }
}

/**
 * Build all guards for a level from its guard definitions.
 */
export function buildGuards(level, grid) {
  return level.guards.map((def, i) => new Guard(def, i, grid));
}

/**
 * The highest suspicion among all guards — drives the HUD eye meter.
 */
export function maxSuspicion(guards) {
  let best = 0;
  for (const g of guards) best = Math.max(best, g.suspicion);
  return best;
}

/**
 * How many guards are currently hunting the player.
 */
export function huntingCount(guards) {
  return guards.filter((g) => g.state === GUARD_STATE.ALERTED).length;
}

/**
 * The alarm level for the level: 0 when calm, rising while any guard hunts,
 * decaying slowly once the hunt ends. Drives the HUD alarm bar and the
 * music intensity.
 */
export function alarmLevel(guards, current, dt) {
  const hunting = huntingCount(guards);
  if (hunting > 0) return clamp(current + dt * 0.9, 0, 1);
  return clamp(current - dt * 0.12, 0, 1);
}
