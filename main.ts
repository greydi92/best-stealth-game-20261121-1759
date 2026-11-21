// SHADOWLINE — hand-in program for the best-stealth-game bounty.
// Node 22, standard library only. It copies this repository's game/ and
// screenshots/ into /output (or MAKEFUN_OUTPUT_DIR outside the grader)
// and writes /output/dossier.json with the vendored make.fun library, so
// the sealed gate can check the game and the judge can read its outline.
// Run locally first:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');

// The gate's own caps, mirrored here so a bad hand-in fails loudly at
// home instead of silently on the server: at most 4 screenshots, each at
// most 256 KiB; game/ at most 993 files and directories and 48 MiB in all.
const MAX_SHOTS = 4;
const MAX_SHOT_BYTES = 262144;
const MAX_GAME_FILES = 993;
const MAX_GAME_BYTES = 50331648;

function countGameEntries(dir) {
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      const sub = countGameEntries(full);
      files += sub.files;
      bytes += sub.bytes;
    } else if (st.isFile()) {
      files += 1;
      bytes += st.size;
    }
  }
  return { files, bytes };
}

function checkShots() {
  if (!existsSync(shotsDir)) throw new Error('screenshots/ is missing');
  const names = readdirSync(shotsDir)
    .filter((n) => !n.startsWith('.'))
    .sort();
  if (names.length < 3 || names.length > MAX_SHOTS) {
    throw new Error(`screenshots/ holds ${names.length} images, need 3 or 4`);
  }
  for (const name of names) {
    const st = statSync(join(shotsDir, name));
    if (!st.isFile()) throw new Error(`screenshots/${name} is not a file`);
    if (st.size > MAX_SHOT_BYTES) {
      throw new Error(`screenshots/${name} is ${st.size} bytes, over 256 KiB`);
    }
    if (!/\.(png|jpe?g)$/i.test(name)) {
      throw new Error(`screenshots/${name} is not a PNG or JPEG`);
    }
  }
  return names;
}

function checkGame() {
  if (!existsSync(join(gameDir, 'index.html'))) {
    throw new Error('game/index.html is missing');
  }
  const indexSize = statSync(join(gameDir, 'index.html')).size;
  if (indexSize > 1048576) throw new Error('game/index.html is over 1 MiB');
  const { files, bytes } = countGameEntries(gameDir);
  if (files > MAX_GAME_FILES) throw new Error(`game/ holds ${files} files, over 993`);
  if (bytes > MAX_GAME_BYTES) throw new Error(`game/ is ${bytes} bytes, over 48 MiB`);
  return { files, bytes };
}

const shots = checkShots();
const game = checkGame();

mkdirSync(outDir, { recursive: true });
cpSync(gameDir, join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });

// The dossier the judge reads: sources as text, screenshots as images,
// everything byte for byte what the vendored library writes from game/
// and screenshots/. The caps match the gate's reference/gate.json.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

const dossierPath = join(outDir, 'dossier.json');
const dossierSize = statSync(dossierPath).size;
if (dossierSize === 0 || dossierSize > 1572864) {
  throw new Error(`dossier.json is ${dossierSize} bytes, expected 1..1.5 MiB`);
}

console.log(
  `SHADOWLINE handed in: ${game.files} game files (${game.bytes} bytes), ` +
  `${shots.length} screenshots (${shots.join(', ')}), dossier written to ${outDir}/dossier.json`,
);
