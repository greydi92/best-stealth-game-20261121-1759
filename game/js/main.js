// main.js — SHADOWLINE boot, game loop and world state.
// The game is a small state machine: title -> playing -> paused / win /
// busted -> title, with a level-select and how-to-play on the side. The
// world object is the single source of truth the renderer, HUD and guards
// all read: grid, player, guards, particles, timers and event hooks.
// Screenshot mode (?shot=cover|start|hunt|end) starts a gallery, composes
// a frozen frame from live level data and renders it without updating.

import { TILE, clamp, makeRng, toTile } from './utils.js';
import { parseGrid } from './utils.js';
import { LEVELS, getLevel, TOTAL_GUARDS, TOTAL_SHARDS } from './levels.js';
import { buildGuards, maxSuspicion, huntingCount, alarmLevel } from './guard.js';
import { Player, COIN_NOISE_RADIUS, DASH_NOISE_RADIUS } from './player.js';
import { ParticleSystem } from './particles.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { Renderer, VIEW_W, VIEW_H } from './render.js';
import { Hud } from './hud.js';
import { Menu, SCREENS } from './menu.js';
import { shotNameFromUrl, applyShot } from './shots.js';
import {
  loadSave,
  storeSave,
  recordClear,
  recordAttempt,
  isUnlocked,
} from './save.js';

const GAME_STATES = {
  TITLE: 'title',
  PLAYING: 'playing',
  PAUSED: 'paused',
  WIN: 'win',
  BUSTED: 'busted',
  COMPLETE: 'complete',
};

class ShadowlineGame {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new Renderer(this.canvas);
    this.hud = new Hud();
    this.audio = new AudioEngine();
    this.input = new Input(this.canvas);
    this.particles = new ParticleSystem();
    this.save = loadSave();
    this.state = GAME_STATES.TITLE;
    this.levelIndex = 0;
    this.world = null;
    this.rng = makeRng(20261122);
    this.lastTime = performance.now();
    this.heartbeatTimer = 0;
    this.nearMissTimer = 0;
    this.shotMode = shotNameFromUrl();

    this.input.onFirstGesture = () => {
      this.audio.ensure();
      this.audio.setMuted(this.save.muted);
    };

    this.menu = new Menu({
      audio: () => this.audio.ensure(),
      onPlay: (level) => this.startLevel(level),
      onLevel: (level) => this.startLevel(level),
      onResume: () => this.resume(),
      onRestart: () => this.startLevel(this.levelIndex),
      onQuit: () => this.showTitle(),
      onNext: () => this.nextLevel(),
      onReplay: () => this.startLevel(this.levelIndex),
    });

    // A live gallery runs behind the title screen: guards patrol, motes drift.
    this.startLevel(0, { attract: true });
    if (this.shotMode) {
      this.startShot(this.shotMode);
    } else {
      this.showTitle();
    }

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') this.toggleMute();
    });
    requestAnimationFrame((t) => this.loop(t));
  }

  // ---------- level lifecycle ----------

  /** Build the world for a gallery. `attract` runs it behind the title. */
  startLevel(index, options = {}) {
    const level = getLevel(index);
    const grid = parseGrid(level.grid);
    const guards = buildGuards(level, grid);
    const player = new Player(grid);
    this.levelIndex = index;
    this.particles.clear();
    this.world = {
      grid,
      level,
      player,
      guards,
      particles: this.particles,
      elapsed: 0,
      alarm: 0,
      maxSuspicion: 0,
      huntingCount: 0,
      projectedRank: 'GHOST',
      allShardsTaken: false,
      frozen: false,
      attract: Boolean(options.attract),
      onPlayerDash: (p) => this.handlePlayerDash(p),
      onPlayerStep: (p) => this.handlePlayerStep(p),
      onCoinLanded: (coin) => this.handleCoinLanded(coin),
      onShardCollected: (shard) => this.handleShardCollected(shard),
      onReachExit: () => this.handleReachExit(),
      onGuardAlerted: (guard) => this.handleGuardAlerted(guard),
      onGuardStep: (guard) => this.handleGuardStep(guard),
      onPlayerCaught: (guard) => this.handlePlayerCaught(guard),
    };
    this.hud.setLevel(index, level);
    this.hud.setLoot(0, grid.shards.length);
    this.hud.setCoins(player.coins);
    if (!options.attract) {
      this.save = recordAttempt(this.save, index);
      this.state = GAME_STATES.PLAYING;
      this.menu.hideAll();
      this.hud.show();
      this.hud.toast('GALLERY ' + (index + 1) + ' — ' + level.name, 2400);
      this.hud.toast(level.tip, 3600);
      this.audio.ensure();
    }
  }

  /** Screenshot mode: start the shot's gallery and freeze a composed frame. */
  startShot(name) {
    const presets = { cover: 3, start: 0, hunt: 4, end: 7 };
    const levelIndex = presets[name] ?? 0;
    this.startLevel(levelIndex);
    applyShot(this.world, name);
    this.hud.hideToast(); // keep the exit and floor visible in the frame
    this.state = GAME_STATES.PLAYING;
    this.menu.hideAll();
    this.hud.show();
    this.hud.update(this.world, 0);
    // Render a few frames so particles and cones settle, then freeze.
    for (let i = 0; i < 3; i++) this.renderer.render(this.world, 0.016);
    this.world.frozen = true;
    document.title = 'SHADOWLINE — shot ' + name;
  }

  showTitle() {
    this.state = GAME_STATES.TITLE;
    this.menu.show(SCREENS.TITLE);
    this.hud.hide();
    if (!this.world || !this.world.attract) this.startLevel(0, { attract: true });
    this.world.attract = true;
  }

  resume() {
    this.state = GAME_STATES.PLAYING;
    this.menu.hideAll();
    this.hud.show();
    this.audio.ensure();
  }

  pause() {
    if (this.state !== GAME_STATES.PLAYING) return;
    this.state = GAME_STATES.PAUSED;
    this.menu.show(SCREENS.PAUSE);
  }

  nextLevel() {
    if (this.levelIndex >= LEVELS.length - 1) {
      this.menu.showComplete(this.save);
      this.state = GAME_STATES.COMPLETE;
      this.hud.hide();
      return;
    }
    this.startLevel(this.levelIndex + 1);
  }

  toggleMute() {
    this.save.muted = !this.save.muted;
    storeSave(this.save);
    this.audio.setMuted(this.save.muted);
    this.hud.toast(this.save.muted ? 'SOUND OFF (M to turn on)' : 'SOUND ON', 1400);
  }

  // ---------- rank ----------

  /** Rank for a finished run: GHOST / SHADOW / SEEN. */
  rankFor(spotted, shards, totalShards) {
    if (spotted === 0 && shards === totalShards) return 'GHOST';
    if (spotted === 0) return 'SHADOW';
    if (spotted === 1 && shards === totalShards) return 'SHADOW';
    return 'SEEN';
  }

  /** Live projected rank from the current run. */
  updateProjectedRank() {
    const w = this.world;
    w.projectedRank = this.rankFor(
      w.player.timesSpotted,
      w.player.shardsCollected,
      w.grid.shards.length,
    );
  }

  // ---------- world events ----------

  handlePlayerDash(player) {
    this.audio.dash();
    this.particles.burstDash(player.x, player.y, player.moveAngle);
    for (const guard of this.world.guards) {
      guard.hearNoise(player.x, player.y, DASH_NOISE_RADIUS);
    }
  }

  handlePlayerStep(player) {
    this.audio.footstep(player.sneaking, player.dashing);
    this.particles.puffStep(player.x, player.y + 8, player.sneaking);
    // Walking is faintly audible up close; sneaking is silent.
    if (!player.sneaking) {
      for (const guard of this.world.guards) {
        guard.hearNoise(player.x, player.y, 52);
      }
    }
    // Brushing a tall plant shakes a few leaves loose.
    const kind = this.world.grid.coverKind(toTile(player.x), toTile(player.y));
    if (kind === 'plant') this.particles.fleckLeaf(player.x, player.y);
  }

  handleCoinLanded(coin) {
    this.audio.coinClink();
    this.particles.ringCoin(coin.x, coin.y);
    for (const guard of this.world.guards) {
      guard.hearNoise(coin.x, coin.y, COIN_NOISE_RADIUS);
    }
  }

  handleShardCollected(shard) {
    const count = this.world.player.shardsCollected;
    this.audio.shardPickup(count);
    const cx = (shard.tx + 0.5) * TILE;
    const cy = (shard.ty + 0.5) * TILE;
    this.particles.burstShard(cx, cy);
    this.hud.toast(
      'STAR-SHARD ' + count + ' / ' + this.world.grid.shards.length + ' LIFTED',
      1500,
    );
    if (count === this.world.grid.shards.length) {
      this.world.allShardsTaken = true;
      this.audio.exitUnlock();
      this.hud.toast('ALL SHARDS TAKEN — THE EXIT IS OPEN', 2600);
    }
  }

  handleGuardAlerted(guard) {
    this.world.player.timesSpotted += 1;
    this.audio.alarmSting();
    this.renderer.camera.addShake(7, 0.4);
    this.particles.ringAlarm(guard.x, guard.y);
    this.hud.toast('SPOTTED! BREAK LINE OF SIGHT!', 2200);
    this.updateProjectedRank();
  }

  handleGuardStep(guard) {
    const d = guard.distanceToPlayer(this.world.player);
    if (d > 520) return;
    const pan = clamp((guard.x - this.world.player.x) / 520, -1, 1);
    this.audio.guardStep(d, pan);
  }

  handleReachExit() {
    if (this.state !== GAME_STATES.PLAYING || this.world.frozen) return;
    if (!this.world.allShardsTaken) {
      this.hud.toast('THE EXIT IS SEALED — TAKE EVERY SHARD FIRST', 2000);
      return;
    }
    const w = this.world;
    const rank = this.rankFor(
      w.player.timesSpotted,
      w.player.shardsCollected,
      w.grid.shards.length,
    );
    this.audio.levelWin();
    this.particles.burstExit(
      (w.grid.exit.tx + 0.5) * TILE,
      (w.grid.exit.ty + 0.5) * TILE,
    );
    this.save = recordClear(
      this.save,
      this.levelIndex,
      rank,
      w.elapsed,
      w.player.shardsCollected,
    );
    const stats = {
      rank,
      time: w.elapsed,
      shards: w.player.shardsCollected,
      totalShards: w.grid.shards.length,
      spotted: w.player.timesSpotted,
      par: w.level.par,
    };
    this.state = GAME_STATES.WIN;
    this.hud.hide();
    if (this.levelIndex >= LEVELS.length - 1) {
      this.menu.showComplete(this.save);
      this.state = GAME_STATES.COMPLETE;
    } else {
      this.menu.showWin(this.levelIndex, stats);
    }
  }

  handlePlayerCaught(guard) {
    if (this.state !== GAME_STATES.PLAYING || this.world.frozen) return;
    this.audio.caught();
    this.renderer.camera.addShake(10, 0.6);
    this.state = GAME_STATES.BUSTED;
    this.hud.hide();
    const w = this.world;
    this.menu.showBusted({
      caughtBy: 'Guard ' + (guard.index + 1),
      rank: 'SEEN',
      time: w.elapsed,
      shards: w.player.shardsCollected,
      totalShards: w.grid.shards.length,
      spotted: Math.max(1, w.player.timesSpotted),
      par: w.level.par,
    });
  }

  // ---------- per-frame update ----------

  update(dt) {
    const w = this.world;
    if (!w || w.frozen) return;

    // Pause / mute keys.
    if (this.input.takePausePress()) {
      if (this.state === GAME_STATES.PLAYING) this.pause();
      else if (this.state === GAME_STATES.PAUSED) this.resume();
    }
    if (this.input.takeMutePress()) this.toggleMute();

    // Attract mode: guards patrol, the player waits, nothing else updates.
    if (w.attract) {
      for (const guard of w.guards) guard.update(dt, w.player, w);
      this.particles.update(dt);
      this.particles.ambientMotes(dt, { x: 0, y: 0, w: VIEW_W, h: VIEW_H }, this.rng);
      return;
    }

    if (this.state !== GAME_STATES.PLAYING) return;

    w.elapsed += dt;

    // Coin throw on click.
    const click = this.input.takeClick();
    if (click) {
      const off = this.renderer.camera.offset();
      const worldPoint = this.input.canvasToWorld(click.x, click.y, {
        x: -off.x,
        y: -off.y,
      });
      const coin = w.player.throwCoin(worldPoint.x, worldPoint.y);
      if (coin) this.audio.coinThrow();
      else this.hud.toast('NO COINS LEFT', 1200);
    }

    w.player.update(dt, this.input, w);
    for (const guard of w.guards) guard.update(dt, w.player, w);

    w.maxSuspicion = maxSuspicion(w.guards);
    w.huntingCount = huntingCount(w.guards);
    w.alarm = alarmLevel(w.guards, w.alarm, dt);
    this.audio.setAlarmLevel(w.alarm);
    this.audio.updateMusic(dt, w.alarm);
    this.updateProjectedRank();

    // Near-miss heartbeat: a cone edge almost touching the player.
    this.heartbeatTimer -= dt;
    if (w.maxSuspicion > 0.2 && w.maxSuspicion < 0.75 && this.heartbeatTimer <= 0) {
      this.heartbeatTimer = 1.1;
      this.audio.heartbeat();
    }

    this.particles.update(dt);
    this.particles.ambientMotes(
      dt,
      { x: this.renderer.camera.x, y: this.renderer.camera.y, w: VIEW_W, h: VIEW_H },
      this.rng,
    );
  }

  loop(now) {
    const dt = clamp((now - this.lastTime) / 1000, 0, 0.05);
    this.lastTime = now;
    this.update(dt);
    if (this.world) {
      this.renderer.render(this.world, dt);
      if (this.state === GAME_STATES.PLAYING || this.state === GAME_STATES.PAUSED) {
        this.hud.update(this.world, dt);
      }
    }
    requestAnimationFrame((t) => this.loop(t));
  }
}

// Boot the game once the DOM is ready.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new ShadowlineGame());
} else {
  new ShadowlineGame();
}

// Keep the totals visible to the console for debugging and for the dossier.
console.log(
  'SHADOWLINE — ' + LEVELS.length + ' galleries, ' + TOTAL_GUARDS +
  ' guards, ' + TOTAL_SHARDS + ' shards. One perfect heist.',
);
