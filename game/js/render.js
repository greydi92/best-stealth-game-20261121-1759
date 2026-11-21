// render.js — canvas rendering for SHADOWLINE.
// One 1280x720 canvas, a camera that follows the player, and a painter's
// order: floor tiles (with shadow zones and light pools), cover props, loot
// and the exit, vision cones (raycast-clipped, colour-coded by guard state),
// guards, the player, coins, particles, then a lighting pass that darkens
// everything outside the lamp light so shadow reads as safety.
// All art is drawn in code — no image assets, no network.

import { TILE, clamp, lerp, dist, TAU } from './utils.js';
import { conePolygon } from './vision.js';
import { GUARD_STATE } from './guard.js';

export const VIEW_W = 1280;
export const VIEW_H = 720;

/** Camera: follows the player, clamped to the level bounds. */
export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.shake = 0; // remaining shake time
    this.shakeMag = 0;
    this.targetX = 0;
    this.targetY = 0;
  }

  /** Ease the camera toward the player each frame. */
  follow(px, py, levelW, levelH, dt) {
    this.targetX = clamp(px - VIEW_W / 2, 0, Math.max(0, levelW - VIEW_W));
    this.targetY = clamp(py - VIEW_H / 2, 0, Math.max(0, levelH - VIEW_H));
    const k = 1 - Math.pow(0.001, dt); // frame-rate independent ease
    this.x = lerp(this.x, this.targetX, k);
    this.y = lerp(this.y, this.targetY, k);
  }

  /** A short shake, e.g. when a guard spots you. */
  addShake(magnitude, duration) {
    this.shakeMag = Math.max(this.shakeMag, magnitude);
    this.shake = Math.max(this.shake, duration);
  }

  update(dt) {
    if (this.shake > 0) this.shake -= dt;
    else this.shakeMag = 0;
  }

  /** Offset to apply before drawing, including the shake jitter. */
  offset() {
    let ox = -this.x;
    let oy = -this.y;
    if (this.shake > 0) {
      const m = this.shakeMag * (this.shake / 0.4);
      ox += (Math.random() - 0.5) * 2 * m;
      oy += (Math.random() - 0.5) * 2 * m;
    }
    return { x: ox, y: oy };
  }
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = new Camera();
    this.time = 0;
    this.floorPattern = null;
    this.floorSeed = 0;
    // Reused offscreen canvas for the lighting pass: allocating one per
    // frame would garbage-collect the game to a stutter.
    this.lightCanvas = document.createElement('canvas');
    this.lightCanvas.width = VIEW_W;
    this.lightCanvas.height = VIEW_H;
    this.lightCtx = this.lightCanvas.getContext('2d');
  }

  /** Deterministic per-tile floor variation, so the floor never looks flat. */
  floorShade(tx, ty) {
    const h = (tx * 73856093) ^ (ty * 19349663) ^ (this.floorSeed * 83492791);
    const v = ((h >>> 0) % 1000) / 1000;
    return v;
  }

  /** Draw the floor: checker marble, shadow zones, and warm light pools. */
  drawFloor(ctx, grid, view) {
    const startTx = Math.max(0, Math.floor(view.x / TILE) - 1);
    const endTx = Math.min(grid.width - 1, Math.floor((view.x + VIEW_W) / TILE) + 1);
    const startTy = Math.max(0, Math.floor(view.y / TILE) - 1);
    const endTy = Math.min(grid.height - 1, Math.floor((view.y + VIEW_H) / TILE) + 1);
    for (let ty = startTy; ty <= endTy; ty++) {
      for (let tx = startTx; tx <= endTx; tx++) {
        const x = tx * TILE;
        const y = ty * TILE;
        const shade = this.floorShade(tx, ty);
        if (grid.isShadow(tx, ty)) {
          // Shadow floor: deep indigo, barely lit.
          ctx.fillStyle = shade > 0.5 ? '#101024' : '#0d0d1f';
          ctx.fillRect(x, y, TILE, TILE);
          // Faint star-specks in the dark.
          if (shade > 0.82) {
            ctx.fillStyle = 'rgba(140, 140, 220, 0.25)';
            ctx.fillRect(x + 12 + shade * 14, y + 10 + shade * 10, 2, 2);
          }
        } else {
          const base = (tx + ty) % 2 === 0 ? '#23233f' : '#1f1f38';
          ctx.fillStyle = base;
          ctx.fillRect(x, y, TILE, TILE);
          // Marble vein.
          if (shade > 0.86) {
            ctx.strokeStyle = 'rgba(160, 155, 220, 0.08)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, y + shade * TILE);
            ctx.lineTo(x + TILE, y + shade * TILE * 0.4);
            ctx.stroke();
          }
        }
        // Tile grout.
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      }
    }
    // Warm lamp pools: soft radial glows on the open floor.
    for (let ty = startTy; ty <= endTy; ty++) {
      for (let tx = startTx; tx <= endTx; tx++) {
        if (grid.isShadow(tx, ty) || grid.solid(tx, ty)) continue;
        const shade = this.floorShade(tx, ty);
        if (shade > 0.93) {
          const cx = tx * TILE + TILE / 2;
          const cy = ty * TILE + TILE / 2;
          const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 90);
          g.addColorStop(0, 'rgba(242, 193, 78, 0.10)');
          g.addColorStop(1, 'rgba(242, 193, 78, 0)');
          ctx.fillStyle = g;
          ctx.fillRect(cx - 90, cy - 90, 180, 180);
        }
      }
    }
  }

  /** Walls: dark stone blocks with a lit top edge so they read as solid. */
  drawWalls(ctx, grid, view) {
    const startTx = Math.max(0, Math.floor(view.x / TILE) - 1);
    const endTx = Math.min(grid.width - 1, Math.floor((view.x + VIEW_W) / TILE) + 1);
    const startTy = Math.max(0, Math.floor(view.y / TILE) - 1);
    const endTy = Math.min(grid.height - 1, Math.floor((view.y + VIEW_H) / TILE) + 1);
    for (let ty = startTy; ty <= endTy; ty++) {
      for (let tx = startTx; tx <= endTx; tx++) {
        if (!grid.isWall(tx, ty)) continue;
        const x = tx * TILE;
        const y = ty * TILE;
        ctx.fillStyle = '#2e2e4a';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = '#3d3d60';
        ctx.fillRect(x, y, TILE, 6); // lit top edge
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(x, y + TILE - 5, TILE, 5);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        // Crenellation ticks on long wall runs.
        if (this.floorShade(tx, ty) > 0.7) {
          ctx.fillStyle = 'rgba(200, 195, 255, 0.12)';
          ctx.fillRect(x + 8, y + 10, 4, 4);
          ctx.fillRect(x + 28, y + 22, 4, 4);
        }
      }
    }
  }

  /** Cover props: crates, display cases and tall plants. */
  drawCover(ctx, grid, view) {
    const startTx = Math.max(0, Math.floor(view.x / TILE) - 1);
    const endTx = Math.min(grid.width - 1, Math.floor((view.x + VIEW_W) / TILE) + 1);
    const startTy = Math.max(0, Math.floor(view.y / TILE) - 1);
    const endTy = Math.min(grid.height - 1, Math.floor((view.y + VIEW_H) / TILE) + 1);
    for (let ty = startTy; ty <= endTy; ty++) {
      for (let tx = startTx; tx <= endTx; tx++) {
        const kind = grid.coverKind(tx, ty);
        if (!kind) continue;
        const x = tx * TILE;
        const y = ty * TILE;
        if (kind === 'crate') this.drawCrate(ctx, x, y, tx, ty);
        else if (kind === 'case') this.drawDisplayCase(ctx, x, y, tx, ty);
        else if (kind === 'plant') this.drawPlant(ctx, x, y, tx, ty);
      }
    }
  }

  drawCrate(ctx, x, y, tx, ty) {
    ctx.fillStyle = '#5a4630';
    ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
    ctx.fillStyle = '#6b563c';
    ctx.fillRect(x + 3, y + 3, TILE - 6, 6);
    ctx.strokeStyle = '#3a2d1e';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 3.5, y + 3.5, TILE - 7, TILE - 7);
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 3);
    ctx.lineTo(x + TILE - 3, y + TILE - 3);
    ctx.moveTo(x + TILE - 3, y + 3);
    ctx.lineTo(x + 3, y + TILE - 3);
    ctx.stroke();
    ctx.fillStyle = 'rgba(242, 193, 78, 0.35)';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FRAGILE', x + TILE / 2, y + TILE / 2 + 3);
  }

  drawDisplayCase(ctx, x, y, tx, ty) {
    // Glass case on a plinth, with a tiny relic glinting inside.
    ctx.fillStyle = '#3a2f22';
    ctx.fillRect(x + 2, y + TILE - 10, TILE - 4, 8);
    ctx.fillStyle = 'rgba(120, 190, 220, 0.28)';
    ctx.fillRect(x + 6, y + 6, TILE - 12, TILE - 18);
    ctx.strokeStyle = 'rgba(200, 225, 255, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 6.5, y + 6.5, TILE - 13, TILE - 19);
    const glint = (this.time * 1.4 + tx * 0.7 + ty * 0.3) % 2;
    ctx.fillStyle = 'rgba(255, 255, 255,' + (glint < 1 ? 0.85 : 0.25) + ')';
    ctx.beginPath();
    ctx.arc(x + TILE / 2, y + TILE / 2 - 2, 3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(242, 193, 78, 0.5)';
    ctx.beginPath();
    ctx.arc(x + TILE / 2, y + TILE / 2 + 4, 2, 0, TAU);
    ctx.fill();
  }

  drawPlant(ctx, x, y, tx, ty) {
    // Tall potted plant: a dark pot and a fan of leaves that sways.
    const sway = Math.sin(this.time * 1.2 + tx * 1.7 + ty * 0.9) * 3;
    ctx.fillStyle = '#4a2f22';
    ctx.beginPath();
    ctx.ellipse(x + TILE / 2, y + TILE - 8, 12, 7, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#5da87a';
    for (let i = -2; i <= 2; i++) {
      const lx = x + TILE / 2 + i * 7 + sway * (i / 2);
      const ly = y + 10 + Math.abs(i) * 5;
      ctx.beginPath();
      ctx.ellipse(lx, ly, 4.5, 14 - Math.abs(i) * 2, i * 0.28, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#7cc495';
    ctx.beginPath();
    ctx.ellipse(x + TILE / 2 + sway, y + 12, 3.5, 10, 0, 0, TAU);
    ctx.fill();
  }

  /** Star-shards: pulsing cyan diamonds that bob above the floor. */
  drawShards(ctx, grid, view) {
    for (const shard of grid.shards) {
      if (shard.taken) continue;
      const cx = (shard.tx + 0.5) * TILE;
      const cy = (shard.ty + 0.5) * TILE;
      if (cx < view.x - 60 || cx > view.x + VIEW_W + 60) continue;
      if (cy < view.y - 60 || cy > view.y + VIEW_H + 60) continue;
      const bob = Math.sin(this.time * 2.4 + shard.tx) * 3;
      const pulse = 0.75 + Math.sin(this.time * 3 + shard.ty) * 0.25;
      const g = ctx.createRadialGradient(cx, cy + bob, 2, cx, cy + bob, 30);
      g.addColorStop(0, 'rgba(95, 227, 224,' + (0.5 * pulse) + ')');
      g.addColorStop(1, 'rgba(95, 227, 224, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - 30, cy + bob - 30, 60, 60);
      ctx.save();
      ctx.translate(cx, cy + bob);
      ctx.rotate(Math.PI / 4 + Math.sin(this.time * 1.1 + shard.tx) * 0.2);
      ctx.fillStyle = '#5fe3e0';
      ctx.fillRect(-7, -7, 14, 14);
      ctx.fillStyle = '#d9fffb';
      ctx.fillRect(-3.5, -3.5, 7, 7);
      ctx.restore();
    }
  }

  /** The exit: a glowing doorway, green when all shards are taken. */
  drawExit(ctx, grid, view, allShardsTaken) {
    const exit = grid.exit;
    if (!exit) return;
    const x = exit.tx * TILE;
    const y = exit.ty * TILE;
    const cx = x + TILE / 2;
    const cy = y + TILE / 2;
    const open = allShardsTaken;
    const glowColor = open ? '95, 227, 150' : '242, 193, 78';
    const pulse = 0.55 + Math.sin(this.time * 2.2) * 0.25;
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 70);
    g.addColorStop(0, 'rgba(' + glowColor + ',' + (0.55 * pulse) + ')');
    g.addColorStop(1, 'rgba(' + glowColor + ', 0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 70, cy - 70, 140, 140);
    ctx.fillStyle = open ? '#12351f' : '#2e2410';
    ctx.fillRect(x + 4, y + 2, TILE - 8, TILE - 4);
    ctx.strokeStyle = open ? '#5fe396' : '#f2c14e';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x + 4.5, y + 2.5, TILE - 9, TILE - 5);
    // Door chevrons pointing out.
    ctx.fillStyle = open ? '#5fe396' : '#f2c14e';
    for (let i = 0; i < 3; i++) {
      const yy = y + 12 + i * 9;
      ctx.beginPath();
      ctx.moveTo(cx - 7, yy);
      ctx.lineTo(cx + 2, yy + 5);
      ctx.lineTo(cx - 7, yy + 10);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = open ? '#b8ffcf' : '#ffe9a8';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(open ? 'EXIT — OPEN' : 'EXIT', cx, y + TILE - 6);
  }

  /** Vision cones: translucent wedges clipped by walls, coloured by state. */
  drawCones(ctx, grid, guards, view) {
    for (const guard of guards) {
      const poly = conePolygon(
        grid,
        guard.x,
        guard.y,
        guard.angle,
        guard.range,
        guard.fov,
        24,
      );
      const c = guard.coneColor();
      const alpha = guard.state === GUARD_STATE.ALERTED ? 0.34 : 0.22;
      ctx.beginPath();
      ctx.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')';
      ctx.fill();
      // Cone edge line, brighter at the rim.
      ctx.beginPath();
      ctx.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ', 0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Suspicion arc above the guard's head.
      if (guard.suspicion > 0.03) {
        const sx = guard.x;
        const sy = guard.y - 26;
        ctx.beginPath();
        ctx.arc(sx, sy, 9, -Math.PI / 2, -Math.PI / 2 + TAU * guard.suspicion);
        ctx.strokeStyle = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ', 0.95)';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(sx, sy, 9, 0, TAU);
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
  }

  /** Guards: round-shouldered wardens with a lamp, a cap and a facing. */
  drawGuards(ctx, guards, view) {
    for (const guard of guards) {
      const x = guard.x;
      const y = guard.y;
      if (x < view.x - 80 || x > view.x + VIEW_W + 80) continue;
      if (y < view.y - 80 || y > view.y + VIEW_H + 80) continue;
      const c = guard.coneColor();
      // Soft shadow under the guard.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.ellipse(x, y + 12, 14, 6, 0, 0, TAU);
      ctx.fill();
      // Body: dark uniform with a coloured trim by state.
      ctx.fillStyle = '#23233c';
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      // Shoulder lamp that glows with the cone colour.
      const lampX = x + Math.cos(guard.angle) * 10;
      const lampY = y + Math.sin(guard.angle) * 10;
      const g = ctx.createRadialGradient(lampX, lampY, 1, lampX, lampY, 12);
      g.addColorStop(0, 'rgba(255, 240, 180, 0.9)');
      g.addColorStop(1, 'rgba(255, 240, 180, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(lampX - 12, lampY - 12, 24, 24);
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.arc(lampX, lampY, 3.5, 0, TAU);
      ctx.fill();
      // Eyes: two dots looking along the facing.
      const ex = Math.cos(guard.angle);
      const ey = Math.sin(guard.angle);
      const px = -ey;
      const py = ex;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x + ex * 4 + px * 5, y + ey * 4 + py * 5, 2.2, 0, TAU);
      ctx.arc(x + ex * 4 - px * 5, y + ey * 4 - py * 5, 2.2, 0, TAU);
      ctx.fill();
      // Cap brim.
      ctx.strokeStyle = '#101024';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - px * 9 - ex * 2, y - py * 9 - ey * 2);
      ctx.lineTo(x + px * 9 - ex * 2, y + py * 9 - ey * 2);
      ctx.stroke();
      // "!" when alerted, "?" when suspicious.
      if (guard.state === GUARD_STATE.ALERTED) {
        ctx.fillStyle = '#ff5a6e';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('!', x, y - 32);
      } else if (
        guard.state === GUARD_STATE.SUSPICIOUS ||
        guard.state === GUARD_STATE.SEARCH
      ) {
        ctx.fillStyle = '#ffb347';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('?', x, y - 32);
      }
    }
  }

  /** Moth: a small hooded figure with a cyan scarf, drawn facing `angle`. */
  drawPlayer(ctx, player, view) {
    // Dash afterimages first.
    for (const t of player.dashTrail) {
      ctx.fillStyle = 'rgba(95, 227, 224,' + (t.life * 1.4) + ')';
      ctx.beginPath();
      ctx.arc(t.x, t.y, 11, 0, TAU);
      ctx.fill();
    }
    const x = player.x;
    const y = player.y;
    // Shadow underfoot.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(x, y + 11, 12, 5, 0, 0, TAU);
    ctx.fill();
    // Shadow-aura ring while hidden in shadow floor.
    if (player.inShadow) {
      ctx.strokeStyle = 'rgba(95, 227, 224, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(x, y, 19, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Body: dark hood.
    ctx.fillStyle = player.sneaking ? '#1c1c30' : '#262640';
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#5fe3e0';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Scarf fluttering behind, opposite the facing.
    const sx = Math.cos(player.angle + Math.PI);
    const sy = Math.sin(player.angle + Math.PI);
    const flutter = Math.sin(this.time * 8) * 2;
    ctx.strokeStyle = '#5fe3e0';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + sx * 8, y + sy * 8);
    ctx.quadraticCurveTo(
      x + sx * 18,
      y + sy * 18 + flutter,
      x + sx * 24,
      y + sy * 24 - flutter,
    );
    ctx.stroke();
    // Eyes.
    const ex = Math.cos(player.angle);
    const ey = Math.sin(player.angle);
    const px = -ey;
    const py = ex;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x + ex * 5 + px * 4.5, y + ey * 5 + py * 4.5, 2.4, 0, TAU);
    ctx.arc(x + ex * 5 - px * 4.5, y + ey * 5 - py * 4.5, 2.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#0a0a1e';
    ctx.beginPath();
    ctx.arc(x + ex * 6 + px * 4.5, y + ey * 6 + py * 4.5, 1.1, 0, TAU);
    ctx.arc(x + ex * 6 - px * 4.5, y + ey * 6 - py * 4.5, 1.1, 0, TAU);
    ctx.fill();
    // Dash cooldown ring under the player.
    if (player.dashCooldown > 0) {
      const frac = player.dashReadyFraction();
      ctx.beginPath();
      ctx.arc(x, y, 17, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
      ctx.strokeStyle = 'rgba(242, 193, 78, 0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  /** Coins in flight and ringing on the floor. */
  drawCoins(ctx, player, view) {
    for (const coin of player.thrownCoins) {
      const h = coin.arcHeight();
      const x = coin.x;
      const y = coin.y - h;
      if (x < view.x - 40 || x > view.x + VIEW_W + 40) continue;
      if (y < view.y - 40 || y > view.y + VIEW_H + 40) continue;
      // Ringing pulse on the floor.
      if (coin.landed && coin.ringTimer > 0) {
        const t = 1 - coin.ringTimer / coin.ringDuration;
        ctx.strokeStyle = 'rgba(242, 193, 78,' + (0.8 * (1 - t)) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(coin.x, coin.y, 8 + t * 60, 0, TAU);
        ctx.stroke();
      }
      // Coin shadow and the coin itself.
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(coin.x, coin.y + 2, 6, 2.5, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#f2c14e';
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#8a6a1e';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#8a6a1e';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('M', x, y + 3);
    }
  }

  /** Particles: sparks, dust, rings, glow, leaves and motes. */
  drawParticles(ctx, particles, view) {
    for (const p of particles) {
      if (p.x < view.x - 30 || p.x > view.x + VIEW_W + 30) continue;
      if (p.y < view.y - 30 || p.y > view.y + VIEW_H + 30) continue;
      const a = p.alpha;
      if (p.kind === 'ring') {
        const t = 1 - p.life / p.maxLife;
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = a;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size + t * 70, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (p.kind === 'spark' || p.kind === 'glow' || p.kind === 'motes') {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (p.kind === 'dust') {
        ctx.globalAlpha = a * 0.7;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 + (1 - a) * 1.5), 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (p.kind === 'leaf') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size, -p.size / 2, p.size * 2, p.size);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }
  }

  /** Lighting pass: darken the world, then cut light holes around lamps,
   * the player, shards and the exit, so darkness reads as safety. */
  drawLighting(ctx, world, view) {
    const light = this.lightCanvas;
    const lctx = this.lightCtx;
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, VIEW_W, VIEW_H);
    lctx.fillStyle = 'rgba(4, 4, 16, 0.62)';
    lctx.fillRect(0, 0, VIEW_W, VIEW_H);
    lctx.globalCompositeOperation = 'destination-out';
    const holes = [];
    // Player lamp.
    holes.push({ x: world.player.x - view.x, y: world.player.y - view.y, r: 150 });
    // Guard lamps.
    for (const g of world.guards) {
      holes.push({ x: g.x - view.x, y: g.y - view.y, r: 110 });
    }
    // Shard glints and exit glow.
    for (const s of world.grid.shards) {
      if (s.taken) continue;
      holes.push({ x: (s.tx + 0.5) * TILE - view.x, y: (s.ty + 0.5) * TILE - view.y, r: 60 });
    }
    if (world.grid.exit) {
      holes.push({
        x: (world.grid.exit.tx + 0.5) * TILE - view.x,
        y: (world.grid.exit.ty + 0.5) * TILE - view.y,
        r: 90,
      });
    }
    for (const h of holes) {
      const g = lctx.createRadialGradient(h.x, h.y, 10, h.x, h.y, h.r);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = g;
      lctx.beginPath();
      lctx.arc(h.x, h.y, h.r, 0, TAU);
      lctx.fill();
    }
    ctx.drawImage(light, 0, 0);
  }

  /** Full frame: camera, world, lighting, and the "near miss" edge glow. */
  render(world, dt) {
    this.time += dt;
    const ctx = this.ctx;
    const grid = world.grid;
    const levelW = grid.width * TILE;
    const levelH = grid.height * TILE;
    this.camera.follow(world.player.x, world.player.y, levelW, levelH, dt);
    this.camera.update(dt);
    const off = this.camera.offset();
    const view = { x: -off.x, y: -off.y };

    ctx.fillStyle = '#070714';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.save();
    ctx.translate(off.x, off.y);

    this.drawFloor(ctx, grid, view);
    this.drawExit(ctx, grid, view, world.allShardsTaken);
    this.drawShards(ctx, grid, view);
    this.drawCover(ctx, grid, view);
    this.drawWalls(ctx, grid, view);
    this.drawCones(ctx, grid, world.guards, view);
    this.drawCoins(ctx, world.player, view);
    this.drawGuards(ctx, world.guards, view);
    this.drawPlayer(ctx, world.player, view);
    this.drawParticles(ctx, world.particles.particles, view);
    ctx.restore();

    this.drawLighting(ctx, world, view);

    // Alarm vignette pulse while hunted.
    if (world.huntingCount > 0) {
      const pulse = 0.16 + Math.sin(this.time * 6) * 0.08;
      const g = ctx.createRadialGradient(
        VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35,
        VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.75,
      );
      g.addColorStop(0, 'rgba(255, 60, 80, 0)');
      g.addColorStop(1, 'rgba(255, 60, 80,' + pulse + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    return view;
  }
}
