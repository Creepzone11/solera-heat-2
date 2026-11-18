[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Creepzone11/solera-heat-2/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Creepzone11/solera-heat-2/reward.svg)](https://make.fun/bounty/gta6-01)

# SOLERA HEAT 2 — Palm Crown

A sun-soaked open-world crime game in **Port Solera**, built for the
[make.fun "Make GTA 6" bounty](https://make.fun/bounty/gta6-01).

True 3D (WebGL) coastal city with **7 named districts** — Marina Bay, Palm Row,
Old Port, Crown Heights, Solera Center, Vista Verde, Sunset Keys. Explore on foot
and by car, with traffic and pedestrians, car theft and NOS boost, a **5-star
wanted level** with police cars, roadblocks and a **police helicopter with a
searchlight**, **9 story jobs** with Lena's crew, 3 weapons, shops, a safehouse,
a garage with upgrades, a HUD with a minimap, 4 synthesised radio stations, and
saves with autosave.

## Play

Serve `game/` and open it in a desktop browser:

```sh
node serve.ts
# open http://localhost:8080
```

- **W A S D** — drive & walk · **E** — steal a car / use a place · **SHIFT** — NOS / run
- **Mouse click** — shoot · **1 2 3** — weapons · **Q** — radio · **M** — mute · **P** — pause

## Screenshots

Four real renders of the game, staged by `game/src/shots.js`
(`?shot=chase|street|escalation|mission&seed=7`): a 3-star chase with the
helicopter overhead, on foot in Palm Row, a 5-star escalation with roadblocks
and the searchlight, and a job completion with its reward.

## Build

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/`
to `/output` and writes `/output/dossier.json`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Three.js is vendored under `game/vendor/three.min.js`. Everything else in
`game/src/` was written for this entry. No network requests at runtime.

## License

MIT — see [LICENSE](LICENSE).
