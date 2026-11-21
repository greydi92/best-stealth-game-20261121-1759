// playtest-cdp.mjs — live playtest of SHADOWLINE via CDP.
// Opens the title screen, clicks BEGIN THE HEIST, holds movement keys,
// throws a coin, and reports HUD state + any console errors.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const cdpPort = Number(process.argv[2] ?? 9222);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTarget() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === 'page');
      if (page) return page;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('no CDP page target');
}

let msgId = 0;
const pending = new Map();
const errors = [];

function main() {
  return getTarget().then((target) => new Promise((resolve, reject) => {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    ws.addEventListener('open', async () => {
      try {
        const send = (method, params = {}) => new Promise((res, rej) => {
          const id = ++msgId;
          pending.set(id, { resolve: res, reject: rej });
          ws.send(JSON.stringify({ id, method, params }));
        });
        ws.addEventListener('message', (event) => {
          const msg = JSON.parse(event.data);
          if (msg.id && pending.has(msg.id)) {
            const { resolve: r, reject: j } = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) j(new Error(msg.error.message));
            else r(msg.result);
          } else if (msg.method === 'Runtime.exceptionThrown') {
            errors.push('EXCEPTION: ' + JSON.stringify(msg.params.exceptionDetails).slice(0, 400));
          } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
            errors.push('CONSOLE ERROR: ' + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 400));
          }
        });
        const evalJs = async (expr) => {
          const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
          return r.result?.value;
        };
        await send('Runtime.enable');
        await send('Page.enable');
        await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
        await send('Page.navigate', { url: 'http://localhost:8080/' });
        await sleep(2000);
        console.log('title visible:', await evalJs(`!document.getElementById('screen-title').classList.contains('hidden')`));
        console.log('title text:', await evalJs(`document.querySelector('.title-big').textContent`));
        const shot1 = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
        writeFileSync(join(here, 'playtest-title.jpg'), Buffer.from(shot1.data, 'base64'));
        // Begin the heist.
        await evalJs(`document.getElementById('btn-play').click()`);
        await sleep(500);
        console.log('hud visible after play:', await evalJs(`!document.getElementById('hud').classList.contains('hidden')`));
        // Hold D (right) for 1.2s, then S (down) for 1.2s.
        const key = async (type, code, keyName) => send('Input.dispatchKeyEvent', { type, code, key: keyName, windowsVirtualKeyCode: keyName === 'd' ? 68 : 83 });
        await key('keyDown', 'KeyD', 'd');
        await sleep(1200);
        await key('keyUp', 'KeyD', 'd');
        await key('keyDown', 'KeyS', 's');
        await sleep(1200);
        await key('keyUp', 'KeyS', 's');
        // Sneak + dash.
        await key('keyDown', 'ShiftLeft', 'Shift');
        await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ' });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ' });
        await sleep(600);
        await key('keyUp', 'ShiftLeft', 'Shift');
        // Click to throw a coin at screen centre-right.
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 800, y: 360, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 800, y: 360, button: 'left', clickCount: 1 });
        await sleep(1500);
        console.log('timer:', await evalJs(`document.getElementById('timer').textContent`));
        console.log('loot:', await evalJs(`document.getElementById('loot-count').textContent`));
        console.log('coins:', await evalJs(`document.getElementById('coin-count').textContent`));
        console.log('eye label:', await evalJs(`document.getElementById('eye-label').textContent`));
        console.log('level name:', await evalJs(`document.getElementById('level-name').textContent`));
        const shot2 = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
        writeFileSync(join(here, 'playtest-play.jpg'), Buffer.from(shot2.data, 'base64'));
        // Pause menu.
        await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyP', key: 'p' });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyP', key: 'p' });
        await sleep(400);
        console.log('pause visible:', await evalJs(`!document.getElementById('screen-pause').classList.contains('hidden')`));
        ws.close();
        resolve();
      } catch (e) { reject(e); }
    });
    ws.addEventListener('error', reject);
  }));
}

main().then(() => {
  if (errors.length) {
    console.log('ERRORS SEEN:');
    for (const e of errors) console.log(' -', e);
    process.exitCode = 1;
  } else console.log('no console errors during playtest');
}).catch((e) => { console.error(e); process.exit(1); });
