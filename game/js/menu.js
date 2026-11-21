// menu.js — DOM menus for SHADOWLINE: title, gallery select, how-to-play,
// pause, level-complete, caught and campaign-complete screens.
// The menus are plain DOM over the canvas; the game loop keeps rendering
// the world behind them so the title screen shows the gallery alive.

import { LEVELS, difficultyLabel } from './levels.js';
import { formatTime } from './utils.js';
import {
  loadSave,
  isUnlocked,
  bestRankFor,
  bestTimeFor,
  campaignSummary,
} from './save.js';

export const SCREENS = {
  TITLE: 'screen-title',
  LEVELS: 'screen-levels',
  HOWTO: 'screen-howto',
  PAUSE: 'screen-pause',
  WIN: 'screen-win',
  BUSTED: 'screen-busted',
  COMPLETE: 'screen-complete',
};

export class Menu {
  constructor(callbacks) {
    this.cb = callbacks; // {onPlay, onLevel, onResume, onRestart, onQuit, onNext, onReplay}
    this.screens = {};
    for (const key of Object.keys(SCREENS)) {
      this.screens[key] = document.getElementById(SCREENS[key]);
    }
    this.save = loadSave();
    this.bindButtons();
    this.refreshTitle();
  }

  bindButtons() {
    const on = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => {
        if (this.cb.audio) this.cb.audio();
        fn();
      });
    };
    on('btn-play', () => this.cb.onPlay(this.save.lastLevel));
    on('btn-levels', () => this.showLevels());
    on('btn-howto', () => this.show(SCREENS.HOWTO));
    on('btn-levels-back', () => this.show(SCREENS.TITLE));
    on('btn-howto-play', () => this.cb.onPlay(this.save.lastLevel));
    on('btn-howto-back', () => this.show(SCREENS.TITLE));
    on('btn-resume', () => this.cb.onResume());
    on('btn-restart', () => this.cb.onRestart());
    on('btn-quit', () => this.cb.onQuit());
    on('btn-next', () => this.cb.onNext());
    on('btn-replay', () => this.cb.onReplay());
    on('btn-win-levels', () => this.showLevels());
    on('btn-retry', () => this.cb.onReplay());
    on('btn-busted-levels', () => this.showLevels());
    on('btn-busted-quit', () => this.cb.onQuit());
    on('btn-complete-replay', () => this.cb.onPlay(0));
    on('btn-complete-title', () => this.show(SCREENS.TITLE));
  }

  /** Hide every screen. */
  hideAll() {
    for (const el of Object.values(this.screens)) el.classList.add('hidden');
  }

  /** Show one screen (by element id) and hide the rest. */
  show(id) {
    this.hideAll();
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
    if (id === SCREENS.TITLE) this.refreshTitle();
    if (id === SCREENS.LEVELS) this.buildLevelGrid();
  }

  /** Title screen progress line from the save. */
  refreshTitle() {
    this.save = loadSave();
    const el = document.getElementById('title-progress');
    if (el) el.textContent = campaignSummary(this.save);
  }

  /** Build the gallery-select grid from the save and level data. */
  buildLevelGrid() {
    this.save = loadSave();
    const grid = document.getElementById('level-grid');
    grid.innerHTML = '';
    LEVELS.forEach((level, i) => {
      const unlocked = isUnlocked(this.save, i);
      const rank = bestRankFor(this.save, i);
      const best = bestTimeFor(this.save, i);
      const card = document.createElement('div');
      card.className = 'level-card' + (unlocked ? '' : ' locked');
      const rankClass =
        rank === 'GHOST' ? 'rank-ghost' : rank === 'SHADOW' ? 'rank-shadow' : 'rank-seen';
      card.innerHTML =
        '<div class="level-num">' + (unlocked ? String(i + 1).padStart(2, '0') : '🔒') + '</div>' +
        '<div class="level-card-name">' + level.name + '</div>' +
        '<div class="level-card-meta">' + difficultyLabel(i) + ' · ' + level.guards.length +
        ' GUARDS · ' + level.grid.join('').split('L').length - 1 + ' SHARDS</div>' +
        (rank
          ? '<div class="level-card-rank ' + rankClass + '">' + rank + '</div>'
          : '<div class="level-card-meta">' + (unlocked ? 'NOT CLEARED' : 'LOCKED') + '</div>') +
        (best !== null
          ? '<div class="level-card-meta">BEST ' + formatTime(best) + '</div>'
          : '');
      if (unlocked) {
        card.addEventListener('click', () => {
          if (this.cb.audio) this.cb.audio();
          this.cb.onLevel(i);
        });
      }
      grid.appendChild(card);
    });
  }

  /** Fill the level-complete screen with the run's stats. */
  showWin(levelIndex, stats) {
    const title = document.getElementById('win-title');
    title.textContent =
      levelIndex >= LEVELS.length - 1 ? 'FINAL GALLERY CLEARED' : 'GALLERY CLEARED';
    const rankEl = document.getElementById('win-rank');
    rankEl.textContent = stats.rank;
    rankEl.className =
      'rank-big' +
      (stats.rank === 'SHADOW' ? ' shadow' : stats.rank === 'SEEN' ? ' seen' : '');
    const nextBtn = document.getElementById('btn-next');
    nextBtn.textContent =
      levelIndex >= LEVELS.length - 1 ? 'FINISH THE HEIST' : 'NEXT GALLERY';
    document.getElementById('win-stats').innerHTML = this.statChips(stats);
    this.show(SCREENS.WIN);
  }

  /** Fill the caught screen with how far the run got. */
  showBusted(stats) {
    const text = document.getElementById('busted-text');
    text.textContent =
      stats.caughtBy +
      ' caught you in the light. The archive seals its doors — but the night is young.';
    document.getElementById('busted-stats').innerHTML = this.statChips(stats);
    this.show(SCREENS.BUSTED);
  }

  /** Fill the campaign-complete screen with totals. */
  showComplete(save) {
    const el = document.getElementById('complete-stats');
    const chips = [
      { value: '8 / 8', label: 'GALLERIES' },
      { value: String(save.ghosts), label: 'GHOST RANKS' },
      { value: String(save.shardsTotal), label: 'SHARDS LIFTED' },
    ];
    el.innerHTML = chips
      .map(
        (c) =>
          '<div class="stat-chip"><div class="stat-value">' + c.value +
          '</div><div class="stat-label">' + c.label + '</div></div>',
      )
      .join('');
    this.show(SCREENS.COMPLETE);
  }

  /** Shared stat chips for the win / busted screens. */
  statChips(stats) {
    const chips = [
      { value: stats.rank, label: 'RANK' },
      { value: formatTime(stats.time), label: 'TIME' },
      { value: stats.shards + ' / ' + stats.totalShards, label: 'SHARDS' },
      { value: String(stats.spotted), label: 'TIMES SPOTTED' },
    ];
    if (stats.par) {
      chips.push({
        value: stats.time <= stats.par ? 'UNDER PAR' : 'OVER PAR',
        label: 'PAR ' + formatTime(stats.par),
      });
    }
    return chips
      .map(
        (c) =>
          '<div class="stat-chip"><div class="stat-value">' + c.value +
          '</div><div class="stat-label">' + c.label + '</div></div>',
      )
      .join('');
  }
}
