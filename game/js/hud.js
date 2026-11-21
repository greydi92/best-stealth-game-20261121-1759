// hud.js — the DOM heads-up display and the minimap for SHADOWLINE.
// The HUD is plain DOM (crisp text, cheap updates) while the world itself
// is canvas. It shows the level name, the detection eye, the alarm bar,
// shards, coins, the timer, the dash cooldown and a live minimap with
// guards, cones, shards, the exit and the player.

import { TILE, formatTime, clamp } from './utils.js';
import { GUARD_STATE } from './guard.js';

export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    this.levelName = document.getElementById('level-name');
    this.levelSub = document.getElementById('level-sub');
    this.eyeWrap = document.getElementById('eye-wrap');
    this.eyeFill = document.getElementById('eye-fill');
    this.eyeLabel = document.getElementById('eye-label');
    this.eyeIcon = document.getElementById('eye-icon');
    this.alarmFill = document.getElementById('alarm-fill');
    this.lootCount = document.getElementById('loot-count');
    this.coinCount = document.getElementById('coin-count');
    this.timerEl = document.getElementById('timer');
    this.hintLine = document.getElementById('hint-line');
    this.rankLine = document.getElementById('rank-line');
    this.minimap = document.getElementById('minimap');
    this.minimapCtx = this.minimap.getContext('2d');
    this.flashEl = document.getElementById('flash');
    this.toastEl = document.getElementById('toast');
    this.toastTimer = null;
    this.lastEyeLabel = '';
    this.lastHint = '';
  }

  show() {
    this.root.classList.remove('hidden');
  }

  hide() {
    this.root.classList.add('hidden');
  }

  /** Set the level title and subtitle when a gallery starts. */
  setLevel(index, level) {
    this.levelName.textContent =
      'GALLERY ' + (index + 1) + ' — ' + level.name;
    this.levelSub.textContent = level.subtitle;
  }

  /** The detection eye: fill, label and colour from the top suspicion. */
  setDetection(suspicion, hunting) {
    const pct = Math.round(clamp(suspicion, 0, 1) * 100);
    this.eyeFill.style.width = pct + '%';
    let label = 'UNSEEN';
    let cls = '';
    if (hunting) {
      label = 'HUNTED';
      cls = 'hunted';
    } else if (suspicion >= 0.75) {
      label = 'SPOTTED';
      cls = 'hunted';
    } else if (suspicion >= 0.35) {
      label = 'SUSPICIOUS';
      cls = 'suspicious';
    } else if (suspicion > 0.04) {
      label = 'WARY';
      cls = 'suspicious';
    }
    if (label !== this.lastEyeLabel) {
      this.eyeLabel.textContent = label;
      this.lastEyeLabel = label;
    }
    this.eyeWrap.className = cls;
    this.eyeIcon.textContent = hunting ? '◉' : suspicion > 0.04 ? '◐' : '○';
  }

  setAlarm(level) {
    this.alarmFill.style.width = Math.round(clamp(level, 0, 1) * 100) + '%';
  }

  setLoot(collected, total) {
    this.lootCount.textContent = collected + ' / ' + total;
  }

  setCoins(coins) {
    this.coinCount.textContent = String(coins);
  }

  setTimer(seconds) {
    this.timerEl.textContent = formatTime(seconds);
  }

  /** Context hint line: changes with what the player is doing. */
  setHint(text) {
    if (text === this.lastHint) return;
    this.lastHint = text;
    this.hintLine.textContent = text;
  }

  /** Live rank projection while playing (Ghost / Shadow / Seen). */
  setRankLine(rank) {
    this.rankLine.textContent = rank ? 'RANK SO FAR: ' + rank : '';
  }

  /** Red edge flash while a guard is hunting you. */
  setFlash(on) {
    this.flashEl.classList.toggle('on', on);
  }

  /** Hide the toast immediately (used by screenshot mode). */
  hideToast() {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastEl.classList.remove('show');
  }

  /** A short centred toast message ("SHARD 3/5", "EXIT OPEN", ...). */
  toast(text, ms = 1800) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastEl.classList.remove('show');
    }, ms);
  }

  /**
   * Draw the minimap: walls, shadow, cover, shards, exit, guard cones
   * (as small wedges), guards (dots) and the player (bright dot).
   * `world` is the live game state; `camera` is unused — the map shows
   * the whole gallery at once.
   */
  drawMinimap(world) {
    const ctx = this.minimapCtx;
    const w = this.minimap.width;
    const h = this.minimap.height;
    const grid = world.grid;
    const scale = Math.min(w / (grid.width * TILE), h / (grid.height * TILE));
    const ox = (w - grid.width * TILE * scale) / 2;
    const oy = (h - grid.height * TILE * scale) / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0a0a1e';
    ctx.fillRect(0, 0, w, h);

    for (let ty = 0; ty < grid.height; ty++) {
      for (let tx = 0; tx < grid.width; tx++) {
        const x = ox + tx * TILE * scale;
        const y = oy + ty * TILE * scale;
        const s = TILE * scale;
        if (grid.isWall(tx, ty)) {
          ctx.fillStyle = '#3a3a5e';
          ctx.fillRect(x, y, s + 0.5, s + 0.5);
        } else if (grid.isCover(tx, ty)) {
          ctx.fillStyle = '#6b5a2e';
          ctx.fillRect(x, y, s + 0.5, s + 0.5);
        } else if (grid.isShadow(tx, ty)) {
          ctx.fillStyle = '#14142e';
          ctx.fillRect(x, y, s + 0.5, s + 0.5);
        }
      }
    }

    // Shards.
    for (const shard of grid.shards) {
      if (shard.taken) continue;
      ctx.fillStyle = '#5fe3e0';
      ctx.beginPath();
      ctx.arc(
        ox + (shard.tx + 0.5) * TILE * scale,
        oy + (shard.ty + 0.5) * TILE * scale,
        Math.max(2, TILE * scale * 0.3),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    // Exit.
    if (grid.exit) {
      ctx.fillStyle = '#f2c14e';
      ctx.fillRect(
        ox + grid.exit.tx * TILE * scale,
        oy + grid.exit.ty * TILE * scale,
        TILE * scale,
        TILE * scale,
      );
    }

    // Guard cones as small wedges, then guard dots.
    for (const guard of world.guards) {
      const gx = ox + guard.x * scale;
      const gy = oy + guard.y * scale;
      const range = guard.range * scale;
      const color =
        guard.state === GUARD_STATE.ALERTED
          ? 'rgba(255, 90, 110, 0.4)'
          : guard.state === GUARD_STATE.SUSPICIOUS || guard.state === GUARD_STATE.SEARCH
            ? 'rgba(255, 176, 66, 0.35)'
            : 'rgba(95, 227, 224, 0.28)';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.arc(gx, gy, range, guard.angle - guard.fov / 2, guard.angle + guard.fov / 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle =
        guard.state === GUARD_STATE.ALERTED ? '#ff5a6e' : '#ffb347';
      ctx.beginPath();
      ctx.arc(gx, gy, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ox + world.player.x * scale, oy + world.player.y * scale, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5fe3e0';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  /** Update every HUD field from the live world state. Call each frame. */
  update(world, dt) {
    const player = world.player;
    this.setDetection(world.maxSuspicion, world.huntingCount > 0);
    this.setAlarm(world.alarm);
    this.setLoot(player.shardsCollected, world.grid.shards.length);
    this.setCoins(player.coins);
    this.setTimer(world.elapsed);
    this.setRankLine(world.projectedRank);
    this.setFlash(world.huntingCount > 0);
    const hint = this.hintFor(world);
    this.setHint(hint);
    this.drawMinimap(world);
  }

  /** Pick the most useful one-line hint for the current situation. */
  hintFor(world) {
    const player = world.player;
    if (world.huntingCount > 0) return 'RUN — break line of sight and hide in shadow!';
    if (world.maxSuspicion >= 0.35) return 'A guard is suspicious — freeze or slip behind cover.';
    if (player.dashCooldown > 0.2) return 'Dash recharging…';
    if (player.inShadow) return 'Hidden in shadow — guards can barely see you.';
    if (player.sneaking) return 'Sneaking — slow, quiet, hard to spot.';
    return 'WASD move · SHIFT sneak · SPACE dash · CLICK throw coin · P pause';
  }
}
