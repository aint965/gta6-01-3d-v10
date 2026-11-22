# Palkon Auto — Stage A build report

Stage A: renderer + Solmar city. Game: "Palkon Auto", an original sunlit
open-world crime game set in Solmar, a coastal city 3,840 x 3,456 units with
seven districts (Old Solmar, Canal Ward, South Market, Citrus Quarter, Pearl
Marina, Glasspoint, Sunstrand Beach). All game text is English; all names,
art and fonts are original. Palette: limestone #ead8b2, coral #d77f69,
teal #398e99, ink #142d38, leaf #56856b.

## What was built

- `game/src/gl.js` — handwritten WebGL 2 renderer, no vendored 3D library.
  World-space lighting (sun + ambient + specular), a 1024x1024 shadow map
  under the sun, a procedural sky dome (sun disc, moon, hash stars, sunset
  band), an animated sea plane, distance fog, and a procedural facade atlas
  (1024x512 diffuse + emissive, 8x4 tiles of 128 px) painted in code.
  Three lighting presets: scorching midday sun, sunset, night with moon,
  stars and street lights.
- `game/src/mesh.js` — MeshBuilder (box / ground-quad / sphere, 17-float
  vertices: position, normal, repeat uv, colour+gloss, emissive, atlas tile
  rect). The repeat uv wraps inside the face's atlas tile in the fragment
  shader, so one tile repeats across a long wall instead of the whole atlas.
- `game/src/city.js` — deterministic city from a seeded RNG: ~350 buildings
  across the seven districts plus 12 Glasspoint towers (58-140 high), a road
  grid, the canal with three bridges, the harbour basin with docks and boats,
  the beach and sea, a park with a pond, market stalls, trees, lamps,
  44 parked cars and 12 pedestrian loops. Brick buildings have real window
  grids; glass towers glare in daylight and show lit interiors at night.
  Roofs vary between warm grey and terracotta.
- `game/src/people.js` — 60 pedestrians on loops and 6 moving cars, with leg
  swing and bob; `game/src/hud.js` — district / preset / coordinates readout,
  minimap and title overlay; `game/src/shots.js` — the three cinematic
  screenshot scenes; `game/src/rng.js` — seeded mulberry32 RNG.
- `game/src/main.js` + `game/index.html` — boot/loop, WASD + mouse-drag
  movement, Shift to run, keys 1/2/3 switch lighting presets, collision
  against building boxes and the sea, `?shot=day|sunset|night&seed=N` staging.
- `main.ts` — written by hand in this session: copies `game/` and
  `screenshots/` to /output (MAKEFUN_OUTPUT_DIR outside the grader) and
  writes `dossier.json` with the vendored make.fun library.
- `shots.json` — 1-day.jpg, 2-sunset.jpg, 3-night.jpg.

## Verification (all in a real headless browser)

- Server: `node serve.ts --port 8081` (port 8080 was already in use by
  another session's server and was left alone).
- Headless shell (chromium_headless_shell-1255, SwiftShader WebGL) with
  `--virtual-time-budget=15000`, one run per shot:
  - day, sunset, night: `<title>READY</title>`, `#errors` empty,
    **0 console errors, 0 page errors**.
- Screenshots captured from the running game at 1280x720 and viewed:
  - `screenshots/1-day.jpg` (154,286 B) — Canal Ward at midday: brick
    buildings with real windows, roads with dashes, the canal, Glasspoint
    towers in the distance.
  - `screenshots/2-sunset.jpg` (74,337 B) — the beach at sunset: sun disc,
    sea glint, sand in the foreground.
  - `screenshots/3-night.jpg` (73,439 B) — the beach promenade at night:
    stars, moonlit sea, glowing street lamps, lit windows.
  All three JPEGs are under the 256 KiB limit.
- Packaging: `MAKEFUN_OUTPUT_DIR=/tmp/palkon-out node main.ts` (Node
  v24.22.1, exit 0) produced `game/` (9 source files), `screenshots/`
  (the 3 JPEGs) and `dossier.json` (schema `makefun/dossier/v1`).

## Bugs found and fixed during verification

1. Facade atlas painted mostly black: the tile painter accumulated
   `save()`/`clip()`/`translate()` without `restore()`. Fixed with an
   absolute per-tile transform.
2. Atlas tiles repeated across the whole texture instead of one tile:
   repeat uvs now stay raw and wrap inside the face's tile rect in the
   fragment shader (new per-vertex tile attribute).
3. Two screenshot cameras were inside buildings (interior walls filled the
   frame). Cameras moved to clear ground; backface culling enabled for the
   city/sea.
4. Sky dome vanished after culling was enabled: its front faces point
   inward, so culling is off for the sky pass (this also restored the sun
   disc, which the uniform clear colour had been hiding).

## Known limitations (Stage A scope)

- The city is a walkable diorama: no missions, no wanted system, no
  enterable interiors (Stages B-F). Ground plazas are intentionally broad
  and pale; beach and park foregrounds are sparse — props and gameplay
  come in later stages.
- The title screen is a simple overlay; the full title-screen art is a
  Stage F item.
