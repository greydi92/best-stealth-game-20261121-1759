// levels.js — the Lumen Archive: 8 hand-authored galleries.
// Legend: '#' wall, 'C' crate, 'D' display case, 'T' tall plant (all block sight
// and movement), ',' shadow floor (hides you), '.' open floor, 'L' star-shard,
// 'E' exit, 'P' player start, 'G' guard spawn marker (floor under it).
// Guard patrols are tile-coordinate waypoint loops; a guard pauses at each stop.
// Interiors are open rooms with pillar cover — no full-height wall ever seals
// a room, so every shard and the exit are always reachable on foot.

export const LEVELS = [
  {
    name: 'VESTIBULE OF ECHOES',
    subtitle: 'Learn the dark. Reach the exit unseen.',
    tip: 'Shadow floor (dark tiles) shrinks how far a guard can spot you.',
    par: 75,
    grid: [
      '############################',
      '#P.....,,,............L....#',
      '#......,,,,..C.............#',
      '#..C...,,,,.....C..........#',
      '#......,,,,...........C....#',
      '#..,,,,,,,,,,,,....C.......#',
      '#..,,,,,,,,,,,,........G...#',
      '#..,,,,,,,,,,,,............#',
      '#......,,,,...........C....#',
      '#..C...,,,,.....C..........#',
      '#......,,,,..C........L....#',
      '#......,,,,................#',
      '#..D...........C....G......#',
      '#......C...................#',
      '#..........L........E......#',
      '############################',
    ],
    guards: [
      { path: [[23, 6], [23, 12]], speed: 52, pause: 1.6, range: 250, fov: 72 },
      { path: [[20, 12], [25, 12]], speed: 48, pause: 2.0, range: 240, fov: 72 },
    ],
  },
  {
    name: 'HALL OF LANTERNS',
    subtitle: 'Two rounds, one long corridor of light.',
    tip: 'SNEAK (hold Shift) to cross lit floor without being heard.',
    par: 90,
    grid: [
      '############################',
      '#P...........,,,,....L.....#',
      '#....C........,,,,...C.....#',
      '#............,,,,..........#',
      '#..C....D.....C............#',
      '#..,,,,,,......,,,,,,......#',
      '#..,,,,,,...C...,,,,,,.....#',
      '#..,,,,,,......,,,,,,...G..#',
      '#..,,,,,,......,,,,,,......#',
      '#..D....C.....T............#',
      '#............,,,,..........#',
      '#..C.......L..,,,,,,..C....#',
      '#.....C..........L.........#',
      '#..G......C......T.........#',
      '#..........L......E........#',
      '############################',
    ],
    guards: [
      { path: [[24, 7], [24, 13], [18, 13]], speed: 56, pause: 1.4, range: 260, fov: 74 },
      { path: [[3, 14], [3, 8], [8, 8]], speed: 50, pause: 1.8, range: 250, fov: 74 },
    ],
  },
  {
    name: 'GARDEN OF GLASS',
    subtitle: 'Tall plants are cover. Display cases are not friends.',
    tip: 'Toss a COIN (click) to pull a guard away from the exit door.',
    par: 110,
    grid: [
      '############################',
      '#P.....,,,,....T....L......#',
      '#......,,,,,...T....L......#',
      '#..T...,,,,....C...........#',
      '#......,,,,..T....C........#',
      '#..,,,,,,,,....D...........#',
      '#..,,,,,,,,....T...G....L..#',
      '#..,,,,,,,,..T.............#',
      '#......,,,,....D...........#',
      '#..C...,,,,....T...........#',
      '#......,,,,....C...........#',
      '#..T...,,,,..C....G........#',
      '#......,,,,................#',
      '#......,,,,....T....L......#',
      '#..D...........C....E......#',
      '############################',
    ],
    guards: [
      { path: [[19, 6], [19, 11]], speed: 58, pause: 1.2, range: 270, fov: 76 },
      { path: [[17, 11], [22, 11], [22, 6]], speed: 54, pause: 1.5, range: 260, fov: 76 },
      { path: [[8, 10], [8, 4], [12, 4]], speed: 50, pause: 2.2, range: 250, fov: 72 },
    ],
  },
  {
    name: 'THE SILENT VAULT',
    subtitle: 'Three guards, one vault, no second chances.',
    tip: 'DASH (Space) crosses open floor fast — but guards hear the roll.',
    par: 120,
    grid: [
      '############################',
      '#P....C......T......L......#',
      '#.....C....D....C....C.....#',
      '#..C......T......D.....L...#',
      '#.....T..,,,,....,,,,..G...#',
      '#.....D..,,,,....,,,,......#',
      '#..,,,,....,,,,....,,,,....#',
      '#..,,,,....,,,,....,,,,..L.#',
      '#..,,,,....C......T........#',
      '#.....T....D....C.....L....#',
      '#..D......,......,.........#',
      '#.....C..,,,,....,,,,..L...#',
      '#.....T..,,,,....,,,,..G...#',
      '#..C....,,,,....,,,,.......#',
      '#.....D......,......E......#',
      '############################',
    ],
    guards: [
      { path: [[23, 4], [23, 12]], speed: 60, pause: 1.2, range: 275, fov: 78 },
      { path: [[11, 11], [18, 11], [18, 5], [11, 5]], speed: 56, pause: 1.0, range: 265, fov: 76 },
      { path: [[5, 13], [5, 6], [9, 6]], speed: 52, pause: 1.8, range: 255, fov: 74 },
    ],
  },
  {
    name: 'CLOCKWORK ATRIUM',
    subtitle: 'Four patrols cross the same floor. Learn the rhythm.',
    tip: 'Watch a full patrol loop before you move. Patience beats speed.',
    par: 140,
    grid: [
      '############################',
      '#P.....,,,.....T....L......#',
      '#......,,,,....C...........#',
      '#..C...,,,,....D...........#',
      '#......,,,,....T..G....D...#',
      '#..,,,,,,,,....C...........#',
      '#..,,,,,,,,..C....T.....L..#',
      '#..,,,,,,,,....D...........#',
      '#......,,,,....C....G......#',
      '#..D...,,,,....T....C......#',
      '#......,,,,..T....D........#',
      '#..T...,,,,....C..G....L...#',
      '#......,,,,................#',
      '#......,,,,....D....L......#',
      '#..C.......L...T.....E.....#',
      '############################',
    ],
    guards: [
      { path: [[18, 4], [18, 8], [25, 8]], speed: 62, pause: 1.0, range: 280, fov: 78 },
      { path: [[20, 8], [20, 11], [25, 11]], speed: 58, pause: 1.2, range: 270, fov: 78 },
      { path: [[8, 11], [8, 5], [13, 5]], speed: 54, pause: 1.6, range: 260, fov: 76 },
      { path: [[13, 13], [5, 13], [5, 9]], speed: 56, pause: 1.4, range: 265, fov: 76 },
    ],
  },
  {
    name: 'MIRROR CORRIDOR',
    subtitle: 'Long sightlines. Short tempers.',
    tip: 'A guard who loses you searches your last seen spot — then gives up.',
    par: 130,
    grid: [
      '############################',
      '#P.........T......L........#',
      '#....C......D..C....C...L..#',
      '#...........T......D....G..#',
      '#..,,,,,,,,,....,,,,.......#',
      '#..,,,,,,,,,....,,,,..C....#',
      '#..,,,,,,,,,....,,,,.......#',
      '#...........D......T....L..#',
      '#....D......T..D....D......#',
      '#...........T......D.......#',
      '#..,,,,,,,,,....,,,,..G....#',
      '#..,,,,,,,,,....,,,,.......#',
      '#..,,,,,,,,,....,,,,....C..#',
      '#...........T......D.......#',
      '#..L....C...T..L.....E.....#',
      '############################',
    ],
    guards: [
      { path: [[24, 3], [24, 10]], speed: 64, pause: 1.0, range: 290, fov: 80 },
      { path: [[22, 10], [19, 10], [20, 3]], speed: 60, pause: 1.2, range: 280, fov: 78 },
      { path: [[8, 12], [8, 4], [13, 4]], speed: 56, pause: 1.5, range: 270, fov: 76 },
    ],
  },
  {
    name: 'THE GILDED MAZE',
    subtitle: 'Crates everywhere. So are the guards.',
    tip: 'Coins are precious here — 3 per gallery, and every pull counts.',
    par: 150,
    grid: [
      '############################',
      '#P....C..T....D....L.......#',
      '#.....T.......C..C....C..L.#',
      '#..C.....,,,,....D.........#',
      '#.....T..,,,,....C....G....#',
      '#..,,,,....,,,,....D.......#',
      '#..,,,,....,,,,....C....L..#',
      '#.....C..T..D....C.........#',
      '#..D.......C.......T.......#',
      '#.....T..,,,,....C....G....#',
      '#..C....,,,,....D..........#',
      '#.....T..,,,,....C.........#',
      '#..D....,,,,....T....L.....#',
      '#.....C..,,,,....D....L....#',
      '#..L....T.......C....E.....#',
      '############################',
    ],
    guards: [
      { path: [[22, 4], [22, 9]], speed: 64, pause: 1.0, range: 285, fov: 80 },
      { path: [[22, 9], [20, 9], [20, 4]], speed: 62, pause: 1.1, range: 280, fov: 78 },
      { path: [[8, 12], [8, 5], [12, 5]], speed: 58, pause: 1.4, range: 270, fov: 78 },
      { path: [[4, 13], [4, 8], [9, 8]], speed: 56, pause: 1.6, range: 265, fov: 76 },
    ],
  },
  {
    name: 'THE STAR VAULT',
    subtitle: 'The final gallery. Five shards. Three guards. One exit.',
    tip: 'Ghost rank: never raise an alarm, take every shard, beat the par.',
    par: 170,
    grid: [
      '############################',
      '#P.....,,,,....T.....L.....#',
      '#......,,,,,...T....L......#',
      '#..T...,,,,....C...........#',
      '#......,,,,..T....C...G....#',
      '#..,,,,,,,,....D...........#',
      '#..,,,,,,,,....T...D....L..#',
      '#..,,,,,,,,..C.............#',
      '#......,,,,....T....G......#',
      '#..C...,,,,....D....T......#',
      '#......,,,,..T....C........#',
      '#..T...,,,,..D....G....L...#',
      '#......,,,,................#',
      '#......,,,,....C....L......#',
      '#..D.......L...T.....E.....#',
      '############################',
    ],
    guards: [
      { path: [[22, 4], [22, 8], [20, 8]], speed: 66, pause: 0.9, range: 295, fov: 82 },
      { path: [[20, 8], [20, 13], [25, 13]], speed: 64, pause: 1.0, range: 290, fov: 80 },
      { path: [[8, 11], [8, 5], [13, 5]], speed: 58, pause: 1.4, range: 275, fov: 78 },
    ],
  },
];

/** Total guards across all galleries (used by the title line). */
export const TOTAL_GUARDS = LEVELS.reduce((n, l) => n + l.guards.length, 0);

/** Total star-shards across all galleries. */
export const TOTAL_SHARDS = LEVELS.reduce(
  (n, l) => n + l.grid.join('').split('L').length - 1,
  0,
);

/** Look a level up by index (0-based), with bounds clamping. */
export function getLevel(index) {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, index))];
}

/** Short difficulty label for a level index. */
export function difficultyLabel(index) {
  if (index <= 1) return 'EASY';
  if (index <= 3) return 'STEADY';
  if (index <= 5) return 'HARD';
  return 'MASTER';
}
