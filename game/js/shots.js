// shots.js — deterministic screenshot staging for SHADOWLINE.
// The game reads ?shot=<name> from the URL and freezes a composed scene
// so screenshots are real renders of the game's own code, taken in a
// headless browser: the player mid-sneak behind cover, guards with live
// vision cones, shards glinting, the exit glowing. The simulation is
// frozen (no updates) so every screenshot is stable and repeatable.
// Normal play ignores this module entirely: no ?shot parameter, no staging.

import { TILE, tileCenter } from './utils.js';

/**
 * Shot presets: level, player tile, player facing, guard suspicion overrides
 * and a caption line for the HUD hint. Each preset is a real gameplay
 * moment, composed from live level data — never a mock scene.
 */
const SHOTS = {
  // Cover: a mid-game gallery, player sneaking behind a crate in shadow,
  // two guards with cones crossing the floor, shards and the exit visible.
  cover: {
    level: 3,
    playerTile: [7, 10],
    facing: 0.4,
    sneaking: true,
    shardsTaken: 1,
    guardSuspicion: [0.55, 0.1, 0.0],
    guardFacing: [2.6, 0.9, -0.6],
    hint: 'WASD move · SHIFT sneak · SPACE dash · CLICK throw coin · P pause',
  },
  // Early gallery: the player learning the dark, one guard patrolling.
  start: {
    level: 0,
    playerTile: [5, 5],
    facing: 1.2,
    sneaking: true,
    shardsTaken: 0,
    guardSuspicion: [0.0, 0.0],
    guardFacing: [1.6, -1.4],
    hint: 'Shadow floor hides you — guards can barely see you here.',
  },
  // Hunt: a guard has spotted the player and the alarm is up.
  hunt: {
    level: 4,
    playerTile: [10, 9],
    facing: -1.8,
    sneaking: false,
    shardsTaken: 2,
    guardSuspicion: [1.0, 0.62, 0.2, 0.0],
    guardFacing: [-2.2, 0.4, 1.1, -0.9],
    hint: 'RUN — break line of sight and hide in shadow!',
    alarm: 0.8,
  },
  // End: the final gallery, player at the glowing exit with all shards.
  end: {
    level: 7,
    playerTile: [20, 13],
    facing: 1.5,
    sneaking: false,
    shardsTaken: 99, // all shards
    guardSuspicion: [0.0, 0.0, 0.0],
    guardFacing: [2.4, -0.8, 1.9],
    hint: 'All shards taken — the exit is open. Run for the door!',
  },
};

/** Read the ?shot= parameter, or null for normal play. */
export function shotNameFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const name = params.get('shot');
    return name && SHOTS[name] ? name : null;
  } catch {
    return null;
  }
}

/** The preset for a shot name, or null. */
export function shotPreset(name) {
  return SHOTS[name] ?? null;
}

/**
 * Apply a shot preset to a freshly started world: place the player, set
 * guard suspicion and facing, mark some shards taken, and freeze the
 * simulation so the frame is stable. Returns the preset (for the HUD).
 */
export function applyShot(world, name) {
  const preset = SHOTS[name];
  if (!preset) return null;
  const player = world.player;
  const spawn = tileCenter(preset.playerTile[0], preset.playerTile[1]);
  player.x = spawn.x;
  player.y = spawn.y;
  player.angle = preset.facing;
  player.moveAngle = preset.facing;
  player.sneaking = preset.sneaking;
  player.updateShadow();
  // Mark the first N shards taken, or all of them.
  let taken = 0;
  const want = preset.shardsTaken >= 99 ? world.grid.shards.length : preset.shardsTaken;
  for (const shard of world.grid.shards) {
    if (taken >= want) break;
    shard.taken = true;
    taken += 1;
  }
  player.shardsCollected = taken;
  // Guard states.
  world.guards.forEach((guard, i) => {
    const s = preset.guardSuspicion[i] ?? 0;
    guard.suspicion = s;
    if (preset.guardFacing[i] !== undefined) guard.angle = preset.guardFacing[i];
    if (s >= 0.75) {
      guard.state = 'alerted';
      guard.alertedBefore = true;
      guard.lastSeen = { x: player.x, y: player.y };
    } else if (s >= 0.35) {
      guard.state = 'suspicious';
      guard.investigateTarget = { x: player.x, y: player.y };
    }
  });
  world.frozen = true;
  world.elapsed = name === 'end' ? 142 : name === 'hunt' ? 63 : 24;
  world.alarm = preset.alarm ?? 0;
  world.maxSuspicion = Math.max(0, ...world.guards.map((g) => g.suspicion));
  world.huntingCount = world.guards.filter((g) => g.state === 'alerted').length;
  world.projectedRank = name === 'hunt' ? 'SEEN' : name === 'end' ? 'GHOST' : 'GHOST';
  return preset;
}

/** Move the camera to a composed position for a shot (not the player). */
export function shotCamera(camera, world, name) {
  const levelW = world.grid.width * TILE;
  const levelH = world.grid.height * TILE;
  // Centre the camera on the middle of the action, not the level edge.
  const cx = Math.min(Math.max(world.player.x, 640), levelW - 640);
  const cy = Math.min(Math.max(world.player.y, 360), levelH - 360);
  camera.x = Math.max(0, Math.min(cx - 640, Math.max(0, levelW - 1280)));
  camera.y = Math.max(0, Math.min(cy - 360, Math.max(0, levelH - 720)));
  camera.targetX = camera.x;
  camera.targetY = camera.y;
}
