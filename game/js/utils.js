// utils.js — small math and grid helpers shared by every SHADOWLINE module.
// No dependencies; pure functions so the game logic stays testable in isolation.

export const TILE = 44;
export const TAU = Math.PI * 2;

/** Clamp a number into [min, max]. */
export function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Linear interpolation between a and b by t (0..1). */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Smoothstep easing: 0 at edge0, 1 at edge1, smooth in between. */
export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Euclidean distance between two points. */
export function dist(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Squared distance (cheaper when only comparing). */
export function distSq(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

/** Wrap an angle to the range [-PI, PI]. */
export function wrapAngle(angle) {
  while (angle > Math.PI) angle -= TAU;
  while (angle < -Math.PI) angle += TAU;
  return angle;
}

/** Smallest absolute difference between two angles, in radians. */
export function angleDiff(a, b) {
  return Math.abs(wrapAngle(a - b));
}

/** Move `current` toward `target` by at most `maxStep`. */
export function moveToward(current, target, maxStep) {
  if (current < target) return Math.min(current + maxStep, target);
  if (current > target) return Math.max(current - maxStep, target);
  return current;
}

/** Turn `current` angle toward `target` angle by at most `maxStep` radians. */
export function turnToward(current, target, maxStep) {
  const d = wrapAngle(target - current);
  if (Math.abs(d) <= maxStep) return target;
  return current + Math.sign(d) * maxStep;
}

/** Convert a world pixel coordinate to a tile index. */
export function toTile(px) {
  return Math.floor(px / TILE);
}

/** Centre of a tile in world pixels. */
export function tileCenter(tx, ty) {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

/** Format seconds as MM:SS. */
export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}

/** Deterministic mulberry32 PRNG, seeded per level so replays are stable. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick a random element from an array with a seeded rng. */
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/** Fisher-Yates shuffle, returns a new array. */
export function shuffled(rng, arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** Random float in [min, max). */
export function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

/** Random integer in [min, max]. */
export function randInt(rng, min, max) {
  return Math.floor(randRange(rng, min, max + 1));
}

/**
 * Parse a level grid (array of equal-length strings) into a lookup object.
 * Legend: '#' wall, 'C' crate, 'D' display case, 'T' tall plant (all block sight
 * and movement), ',' shadow floor, '.' open floor, 'L' shard, 'E' exit, 'P' player
 * start, 'G' guard spawn marker (floor under it).
 * Returns { width, height, solid(tx,ty), isWall, isCover, isShadow, shards, exit, spawn }.
 */
export function parseGrid(rows) {
  const height = rows.length;
  const width = rows[0].length;
  const walls = new Set();
  const cover = new Set();
  const shadow = new Set();
  const shards = [];
  let exit = null;
  let spawn = null;
  const guardSpawns = [];

  for (let y = 0; y < height; y++) {
    const row = rows[y];
    for (let x = 0; x < width; x++) {
      const ch = row[x];
      const key = x + ',' + y;
      if (ch === '#') walls.add(key);
      else if (ch === 'C' || ch === 'D' || ch === 'T') cover.add(key);
      else if (ch === ',') shadow.add(key);
      else if (ch === 'L') shards.push({ tx: x, ty: y, taken: false });
      else if (ch === 'E') exit = { tx: x, ty: y };
      else if (ch === 'P') spawn = { tx: x, ty: y };
      else if (ch === 'G') guardSpawns.push({ tx: x, ty: y });
    }
  }

  function inBounds(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < width && ty < height;
  }

  function solid(tx, ty) {
    if (!inBounds(tx, ty)) return true;
    const key = tx + ',' + ty;
    return walls.has(key) || cover.has(key);
  }

  function blocksSight(tx, ty) {
    return solid(tx, ty);
  }

  function isShadow(tx, ty) {
    if (!inBounds(tx, ty)) return false;
    return shadow.has(tx + ',' + ty);
  }

  function isWall(tx, ty) {
    if (!inBounds(tx, ty)) return true;
    return walls.has(tx + ',' + ty);
  }

  function isCover(tx, ty) {
    if (!inBounds(tx, ty)) return false;
    return cover.has(tx + ',' + ty);
  }

  function coverKind(tx, ty) {
    if (!inBounds(tx, ty)) return null;
    const ch = rows[ty][tx];
    if (ch === 'C') return 'crate';
    if (ch === 'D') return 'case';
    if (ch === 'T') return 'plant';
    return null;
  }

  return {
    width,
    height,
    rows,
    walls,
    cover,
    shadow,
    shards,
    exit,
    spawn,
    guardSpawns,
    inBounds,
    solid,
    blocksSight,
    isShadow,
    isWall,
    isCover,
    coverKind,
  };
}

/**
 * Circle-vs-tile collision: given a circle at (x, y) with radius r, push it out
 * of any solid tile. Returns the corrected {x, y}. Axis-separated so the entity
 * slides along walls instead of sticking.
 */
export function collideCircle(grid, x, y, r) {
  // Resolve X axis first.
  let nx = x;
  const minTx = toTile(x - r);
  const maxTx = toTile(x + r);
  const minTy = toTile(y - r);
  const maxTy = toTile(y + r);
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (!grid.solid(tx, ty)) continue;
      const bx = tx * TILE;
      const by = ty * TILE;
      const closestX = clamp(nx, bx, bx + TILE);
      const closestY = clamp(y, by, by + TILE);
      const dx = nx - closestX;
      const dy = y - closestY;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        nx = closestX + (dx / d) * r;
      } else if (d2 <= 0.0001) {
        // Centre inside the tile: push out along the smallest penetration.
        const left = nx - bx;
        const right = bx + TILE - nx;
        const top = y - by;
        const bottom = by + TILE - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) nx = bx - r;
        else if (m === right) nx = bx + TILE + r;
        else if (m === top) nx = x; // handled on Y pass
        else nx = x;
      }
    }
  }
  // Then Y axis.
  let ny = y;
  const minTx2 = toTile(nx - r);
  const maxTx2 = toTile(nx + r);
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx2; tx <= maxTx2; tx++) {
      if (!grid.solid(tx, ty)) continue;
      const bx = tx * TILE;
      const by = ty * TILE;
      const closestX = clamp(nx, bx, bx + TILE);
      const closestY = clamp(ny, by, by + TILE);
      const dx = nx - closestX;
      const dy = ny - closestY;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        ny = closestY + (dy / d) * r;
      } else if (d2 <= 0.0001) {
        const left = nx - bx;
        const right = bx + TILE - nx;
        const top = ny - by;
        const bottom = by + TILE - ny;
        const m = Math.min(left, right, top, bottom);
        if (m === top) ny = by - r;
        else if (m === bottom) ny = by + TILE + r;
      }
    }
  }
  return { x: nx, y: ny };
}
