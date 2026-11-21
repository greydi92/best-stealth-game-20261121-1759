// save.js — progress persistence for SHADOWLINE.
// Everything lives in one localStorage key so the whole save is a single
// small JSON object: which galleries are unlocked, the best rank earned per
// gallery, total shards collected, best times, and the mute setting.
// All reads are guarded: a corrupt or missing save simply starts fresh.

const SAVE_KEY = 'shadowline-save-v1';

export const RANK = {
  GHOST: 'GHOST',
  SHADOW: 'SHADOW',
  SEEN: 'SEEN',
  NONE: null,
};

/** Rank order, best first, for comparing two results. */
const RANK_ORDER = { GHOST: 0, SHADOW: 1, SEEN: 2 };

function freshSave() {
  return {
    version: 1,
    unlocked: 1, // galleries unlocked (1-based count)
    bestRank: {}, // level index -> 'GHOST' | 'SHADOW' | 'SEEN'
    bestTime: {}, // level index -> seconds
    shardsTotal: 0,
    gamesPlayed: 0,
    levelsCleared: 0,
    ghosts: 0,
    muted: false,
    lastLevel: 0,
  };
}

/** Load the save, or a fresh one when nothing is stored yet. */
export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return freshSave();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return freshSave();
    const save = freshSave();
    for (const key of Object.keys(save)) {
      if (parsed[key] !== undefined) save[key] = parsed[key];
    }
    return save;
  } catch {
    return freshSave();
  }
}

/** Write the save back to localStorage. Never throws. */
export function storeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage full or blocked (private mode): progress is session-only.
  }
}

/** The better of two ranks (null counts as no rank at all). */
export function betterRank(a, b) {
  if (!a) return b;
  if (!b) return a;
  return RANK_ORDER[a] <= RANK_ORDER[b] ? a : b;
}

/**
 * Record a cleared gallery: unlock the next one, keep the best rank and
 * the best time, and count the run toward the campaign totals.
 * Returns the updated save.
 */
export function recordClear(save, levelIndex, rank, timeSeconds, shards) {
  save.levelsCleared = Math.max(save.levelsCleared, levelIndex + 1);
  save.unlocked = Math.max(save.unlocked, Math.min(8, levelIndex + 2));
  save.bestRank[levelIndex] = betterRank(save.bestRank[levelIndex], rank);
  if (save.bestTime[levelIndex] === undefined || timeSeconds < save.bestTime[levelIndex]) {
    save.bestTime[levelIndex] = timeSeconds;
  }
  save.shardsTotal += shards;
  if (rank === RANK.GHOST) save.ghosts += 1;
  save.lastLevel = levelIndex;
  storeSave(save);
  return save;
}

/** Record a started run (a gallery attempt), for the title-screen stats. */
export function recordAttempt(save, levelIndex) {
  save.gamesPlayed += 1;
  save.lastLevel = levelIndex;
  storeSave(save);
  return save;
}

/** Is a gallery (0-based index) unlocked? */
export function isUnlocked(save, levelIndex) {
  return levelIndex < save.unlocked;
}

/** Best rank earned on a gallery, or null. */
export function bestRankFor(save, levelIndex) {
  return save.bestRank[levelIndex] ?? null;
}

/** Best time on a gallery in seconds, or null. */
export function bestTimeFor(save, levelIndex) {
  const t = save.bestTime[levelIndex];
  return t === undefined ? null : t;
}

/** How many galleries have any rank at all. */
export function clearedCount(save) {
  return Object.keys(save.bestRank).length;
}

/** Campaign summary line for the title screen. */
export function campaignSummary(save) {
  const cleared = clearedCount(save);
  if (cleared === 0 && save.gamesPlayed === 0) return 'No heists yet — the archive awaits.';
  const parts = [];
  parts.push(cleared + ' / 8 galleries cleared');
  if (save.ghosts > 0) parts.push(save.ghosts + ' ghost' + (save.ghosts > 1 ? 's' : ''));
  if (save.shardsTotal > 0) parts.push(save.shardsTotal + ' shards lifted');
  return parts.join('  ·  ');
}

/** Wipe the save entirely (used by the title screen's reset, if wired). */
export function resetSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
  return freshSave();
}
