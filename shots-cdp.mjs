// shots-cdp.mjs — take SHADOWLINE screenshots via Chrome DevTools Protocol.
// Node 22 stdlib only (global WebSocket, fetch). Usage:
//   node shots-cdp.mjs [port]   (default CDP port 9222, server on 8080)
// Writes screenshots/1-cover.jpg, 2-start.jpg, 3-hunt.jpg, 4-end.jpg and
// prints any console errors / page exceptions seen while rendering.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const shotsDir = join(here, 'screenshots');
const cdpPort = Number(process.argv[2] ?? 9222);
const SHOTS = [
  { name: 'cover', file: '1-cover.jpg', url: 'http://localhost:8080/?shot=cover' },
  { name: 'start', file: '2-start.jpg', url: 'http://localhost:8080/?shot=start' },
  { name: 'hunt', file: '3-hunt.jpg', url: 'http://localhost:8080/?shot=hunt' },
  { name: 'end', file: '4-end.jpg', url: 'http://localhost:8080/?shot=end' },
];

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
  throw new Error('no CDP page target found on port ' + cdpPort);
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', (e) => reject(e));
  });
}

let msgId = 0;
const pending = new Map();
const errors = [];

function send(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  const target = await getTarget();
  const ws = await connect(target.webSocketDebuggerUrl);
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      errors.push('EXCEPTION: ' + JSON.stringify(msg.params.exceptionDetails).slice(0, 500));
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push('CONSOLE ERROR: ' + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 500));
    }
  });
  await send(ws, 'Runtime.enable');
  await send(ws, 'Page.enable');
  await send(ws, 'Emulation.setDeviceMetricsOverride', {
    width: 1280, height: 720, deviceScaleFactor: 1, mobile: false,
  });
  for (const shot of SHOTS) {
    await send(ws, 'Page.navigate', { url: shot.url });
    await sleep(2500);
    const { data } = await send(ws, 'Page.captureScreenshot', { format: 'jpeg', quality: 82 });
    writeFileSync(join(shotsDir, shot.file), Buffer.from(data, 'base64'));
    console.log('saved', shot.file);
  }
  ws.close();
  if (errors.length) {
    console.log('ERRORS SEEN:');
    for (const e of errors) console.log(' -', e);
    process.exitCode = 1;
  } else {
    console.log('no console errors');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
