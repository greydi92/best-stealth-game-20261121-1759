// input.js — keyboard and mouse input for SHADOWLINE.
// One object holds the whole input state: held keys, edge-triggered presses
// (dash, pause), and the mouse position in world coordinates so a click can
// throw a coin at the floor tile under the cursor. Pointer lock is not used:
// the game is played with a normal cursor, and the coin target is clamped
// to the visible play area.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.up = false;
    this.down = false;
    this.left = false;
    this.right = false;
    this.sneak = false;
    this.dashPressed = false;
    this.pausePressed = false;
    this.mutePressed = false;
    this.anyKeyPressed = false;
    this.mouseX = 0; // canvas CSS pixels
    this.mouseY = 0;
    this.mouseDown = false;
    this.clickQueued = null; // {x, y} in canvas pixels, consumed by main
    this.keysDown = new Set();
    this.onFirstGesture = null; // called once, to unlock audio
    this.gestureFired = false;

    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    window.addEventListener('keyup', (e) => this.handleKeyUp(e));
    window.addEventListener('blur', () => this.clearHeldKeys());
    canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    canvas.addEventListener('mouseup', () => {
      this.mouseDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  fireGesture() {
    if (!this.gestureFired && this.onFirstGesture) {
      this.gestureFired = true;
      this.onFirstGesture();
    }
  }

  handleKeyDown(e) {
    this.fireGesture();
    const code = e.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) {
      e.preventDefault();
    }
    if (e.repeat) return;
    this.keysDown.add(code);
    this.anyKeyPressed = true;
    switch (code) {
      case 'KeyW':
      case 'ArrowUp':
        this.up = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.down = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.left = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.right = true;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.sneak = true;
        break;
      case 'Space':
        this.dashPressed = true;
        break;
      case 'KeyP':
      case 'Escape':
        this.pausePressed = true;
        break;
      case 'KeyM':
        this.mutePressed = true;
        break;
      default:
        break;
    }
  }

  handleKeyUp(e) {
    const code = e.code;
    this.keysDown.delete(code);
    switch (code) {
      case 'KeyW':
      case 'ArrowUp':
        this.up = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.down = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.left = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.right = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.sneak = false;
        break;
      default:
        break;
    }
  }

  clearHeldKeys() {
    this.up = false;
    this.down = false;
    this.left = false;
    this.right = false;
    this.sneak = false;
    this.keysDown.clear();
  }

  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseX = e.clientX - rect.left;
    this.mouseY = e.clientY - rect.top;
  }

  handleMouseDown(e) {
    this.fireGesture();
    if (e.button !== 0) return;
    this.mouseDown = true;
    const rect = this.canvas.getBoundingClientRect();
    this.clickQueued = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  /** Consume the queued click, if any, and return it (or null). */
  takeClick() {
    const click = this.clickQueued;
    this.clickQueued = null;
    return click;
  }

  takePausePress() {
    const pressed = this.pausePressed;
    this.pausePressed = false;
    return pressed;
  }

  takeMutePress() {
    const pressed = this.mutePressed;
    this.mutePressed = false;
    return pressed;
  }

  /** Convert canvas CSS pixels to game-world pixels via the camera. */
  canvasToWorld(cx, cy, camera) {
    const scaleX = 1280 / this.canvas.getBoundingClientRect().width;
    const scaleY = 720 / this.canvas.getBoundingClientRect().height;
    return {
      x: cx * scaleX + camera.x,
      y: cy * scaleY + camera.y,
    };
  }
}
