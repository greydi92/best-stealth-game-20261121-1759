// vision.js — line-of-sight, vision cones and detection math for SHADOWLINE.
// A guard sees the player only when three things are all true:
//   1. the player is inside the cone's range and field of view,
//   2. no wall or cover tile blocks the straight line between them,
//   3. the player is not fully hidden behind cover (handled by the raycast).
// Shadow floor and sneaking shrink the effective range instead of hiding
// the player outright, so a patient player can always slip past.

import { TILE, clamp, dist, angleDiff, wrapAngle, toTile } from './utils.js';

/**
 * Cast a single ray from (x, y) along `angle` and return the distance to the
 * first solid tile, capped at `maxDist`. Steps in small increments so thin
 * cover tiles are never skipped over.
 */
export function castRay(grid, x, y, angle, maxDist) {
  const step = 6;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let d = step;
  while (d < maxDist) {
    const px = x + dx * d;
    const py = y + dy * d;
    if (grid.solid(toTile(px), toTile(py))) return d;
    d += step;
  }
  return maxDist;
}

/**
 * True when a straight line from (x1, y1) to (x2, y2) crosses no solid tile.
 * Samples every 6 px, which is finer than half a tile, so cover always blocks.
 */
export function lineOfSightClear(grid, x1, y1, x2, y2) {
  const d = dist(x1, y1, x2, y2);
  if (d < 1) return true;
  const steps = Math.max(1, Math.ceil(d / 6));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;
    if (grid.solid(toTile(px), toTile(py))) return false;
  }
  return true;
}

/**
 * Build the vision-cone polygon for a guard at (x, y) facing `angle`.
 * The cone is sampled as `rays` edge rays; each ray stops at the first wall,
 * so the cone hugs corners and cover exactly the way the guard's sight does.
 * Returns an array of {x, y} points starting at the guard's position.
 */
export function conePolygon(grid, x, y, angle, range, fov, rays = 26) {
  const points = [{ x, y }];
  const half = fov / 2;
  for (let i = 0; i <= rays; i++) {
    const a = angle - half + (fov * i) / rays;
    const d = castRay(grid, x, y, a, range);
    points.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d });
  }
  return points;
}

/**
 * Effective vision range for a guard looking at a player.
 * Modifiers multiply the guard's base range:
 *   - player standing in shadow floor: x0.45 (the dark swallows you)
 *   - player sneaking: x0.62 (low profile, quiet steps)
 *   - player dashing: x1.35 (a rolling body is easy to spot)
 *   - player standing still in the open: x1.0
 * The range never drops below 70 px, so a guard can always spot you if you
 * walk right up to him — shadow is cover, not invisibility.
 */
export function effectiveRange(guard, player) {
  let range = guard.range;
  if (player.inShadow) range *= 0.45;
  if (player.sneaking) range *= 0.62;
  if (player.dashing) range *= 1.35;
  return Math.max(70, range);
}

/**
 * Is the player inside this guard's cone right now (ignoring suspicion)?
 * Returns { seen, distance, angleToPlayer } — `seen` is true only when the
 * player is in range, inside the field of view, and line of sight is clear.
 */
export function canSeePlayer(grid, guard, player) {
  const dx = player.x - guard.x;
  const dy = player.y - guard.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const range = effectiveRange(guard, player);
  if (distance > range) return { seen: false, distance, angleToPlayer: 0 };
  const angleToPlayer = Math.atan2(dy, dx);
  const halfFov = (guard.fov * Math.PI) / 360;
  if (angleDiff(angleToPlayer, guard.angle) > halfFov) {
    return { seen: false, distance, angleToPlayer };
  }
  if (!lineOfSightClear(grid, guard.x, guard.y, player.x, player.y)) {
    return { seen: false, distance, angleToPlayer };
  }
  return { seen: true, distance, angleToPlayer };
}

/**
 * How fast suspicion should rise while the guard sees the player, per second.
 * Close and in the open fills the meter in about 0.7 s; far away, sneaking
 * and in shadow can take over 3 s — enough time to duck behind a crate.
 * Returns a rate in suspicion units per second (suspicion runs 0..1).
 */
export function suspicionRate(guard, player, distance) {
  const range = effectiveRange(guard, player);
  const closeness = 1 - clamp(distance / range, 0, 1); // 1 = point blank
  let rate = 0.55 + closeness * 1.35;
  if (player.inShadow) rate *= 0.55;
  if (player.sneaking) rate *= 0.7;
  if (player.dashing) rate *= 1.6;
  return rate;
}

/**
 * How fast suspicion decays while the guard cannot see the player.
 * The meter drains slowly at first (the guard stays wary) and faster once
 * it drops below half — hiding works, but it takes a few seconds.
 */
export function suspicionDecay(suspicion) {
  return suspicion > 0.5 ? 0.16 : 0.30;
}

/**
 * Point-in-polygon test for a vision cone (used by the HUD "in cone" flash
 * and by the minimap). Standard ray-crossing algorithm.
 */
export function pointInPolygon(px, py, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const crosses =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/**
 * Distance from a point to the nearest guard cone edge, used for the
 * "near miss" flash: when the player is just outside a cone, the screen
 * edge glows faintly so the player feels how close they came.
 * Returns the smallest distance to any cone boundary sample, or Infinity.
 */
export function distanceToConeEdge(grid, guard, px, py) {
  const poly = conePolygon(grid, guard.x, guard.y, guard.angle, guard.range, (guard.fov * Math.PI) / 180, 14);
  let best = Infinity;
  for (let i = 1; i < poly.length; i++) {
    const d = dist(px, py, poly[i].x, poly[i].y);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Angle a guard should face to look at a world point.
 */
export function angleTo(guard, tx, ty) {
  return Math.atan2(ty - guard.y, tx - guard.x);
}

/**
 * Smoothly turn a guard's facing toward a target angle.
 * `turnSpeed` is radians per second; returns the new angle.
 */
export function turnGuard(guard, targetAngle, turnSpeed, dt) {
  return guard.angle + clamp(wrapAngle(targetAngle - guard.angle), -turnSpeed * dt, turnSpeed * dt);
}
