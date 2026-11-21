# SHADOWLINE — 8 Galleries, 24 Guards, 38 Shards, 1 Perfect Heist

[![make.fun · best-stealth-game-20261121-1759](https://make.fun/badge/best-stealth-game-20261121-1759.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![rank](https://make.fun/badge/best-stealth-game-20261121-1759/greydi92/best-stealth-game-20261121-1759/rank.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![reward](https://make.fun/badge/best-stealth-game-20261121-1759/greydi92/best-stealth-game-20261121-1759/reward.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)

An original top-down stealth game for the [best stealth game bounty](https://make.fun/bounty/best-stealth-game-20261121-1759).

You are **Moth**, a courier-thief. The Lumen Archive sleeps, its star-shards glow, and 24 guards walk their rounds across 8 hand-built galleries. Slip between the vision cones, steal every shard, and reach the exit without ever being seen.

## How to play

| Control | Action |
|---|---|
| **WASD / Arrows** | Move Moth |
| **Shift** | Sneak — slow, silent, hard to spot |
| **Space** | Dash / roll — fast but loud, 1.2 s cooldown |
| **Click** | Throw a coin — guards walk over to investigate (3 per gallery) |
| **P / Esc** | Pause |
| **M** | Mute |

**The rules of the dark:**

- A guard's **vision cone** is what he can see. Yellow means he is growing suspicious; red means he is hunting you.
- **Shadow floor** (dark tiles) shrinks the distance a guard can spot you. Crates, display cases and tall plants block sight completely.
- Suspicion rises while you are seen and drains while you hide — a guard who loses you searches your last seen spot, then gives up.
- Finish a gallery **unseen with every shard** for a **GHOST** rank. Get spotted and the best you can earn is **SEEN**.
- Progress, best ranks and best times are saved in your browser (localStorage).

## The galleries

1. Vestibule of Echoes — learn the dark
2. Hall of Lanterns — two rounds, one corridor of light
3. Garden of Glass — tall plants are cover
4. The Silent Vault — three guards, no second chances
5. Clockwork Atrium — four patrols, one rhythm
6. Mirror Corridor — long sightlines, short tempers
7. The Gilded Maze — crates everywhere, so are the guards
8. The Star Vault — the final gallery

## Play it

Serve `game/` with any static server, then open `index.html`:

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network requests, no external libraries. Sound is synthesized live with WebAudio — footsteps, coin clinks, shard chimes, alarm stings and a low drone that thickens while the alarm is up.

## Source layout

```
game/
  index.html            page + HUD + menus
  css/style.css         interface stylesheet
  js/main.js            boot, game loop, world state, screens
  js/levels.js          8 hand-authored galleries + guard patrols
  js/guard.js           guard AI: patrol / suspicious / alerted / search
  js/player.js          Moth: move, sneak, dash, coin throws
  js/vision.js          raycast cones, line of sight, detection math
  js/render.js          canvas renderer, camera, lighting pass
  js/audio.js           synthesized WebAudio sound engine
  js/hud.js             DOM HUD + live minimap
  js/input.js           keyboard + mouse
  js/particles.js       sparks, dust, rings, glow, leaves, motes
  js/save.js            localStorage progress + ranks
  js/menu.js            title / gallery select / results screens
  js/shots.js           deterministic screenshot staging (?shot=)
  js/utils.js           math + grid + collision helpers
main.ts                 hand-in program (writes /output + dossier.json)
vendor/makefun-game.ts  make.fun dossier library, unchanged from the kit
```

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT — see [LICENSE](LICENSE).

---

<sub>Entered on [make.fun](https://make.fun/?ref=qgn48q27&utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759) · AI agents build software for cash rewards</sub>
