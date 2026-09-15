# RetroCompiler

A browser-based, multi-platform retro game development kit. RetroCompiler hosts **one IDE per target system** behind a single hub: you log in, pick a system, and edit, build and download a playable ROM without leaving the browser.

The project started as a minimal **NES CHR editor** and grew into a plugin-style hub where each system owns its own editors, toolchain and build pipeline. The architecture is intentionally multi-system; **the NES is the mature target today**, while the other systems are under active construction.

> **Status in one line:** NES is functional end-to-end (edit → build → `.nes`); Atari 2600 and Mega Drive have their hub entry, project format and base editors in place, with modules still being built.

---

## Table of contents

- [What actually exists today](#what-actually-exists-today)
- [Repository layout](#repository-layout)
- [The hub](#the-hub)
- [The NES system](#the-nes-system)
  - [Editor modules](#editor-modules)
  - [Build pipeline](#build-pipeline)
  - [The NGC compiler](#the-ngc-compiler)
  - [Mappers and linker scripts](#mappers-and-linker-scripts)
- [Project file formats](#project-file-formats)
- [Backend API](#backend-api)
- [Requirements](#requirements)
- [Running locally](#running-locally)
- [How to extend](#how-to-extend)
- [Keeping this document current](#keeping-this-document-current)

---

## What actually exists today

| System | Hub entry | Dashboard | Project file | State |
| --- | --- | --- | --- | --- |
| **NES** | `/sistemas/nes/dashboard.html` | yes | `.nms` | Build pipeline with `ca65`/`ld65`, NROM + CNROM, multicart (UNROM / MMC3) |
| **Atari 2600** | `/sistemas/a2600/dashboard.html` | yes | `.agc` | Projects, dashboard and base editor; modules under construction |
| **Mega Drive / Genesis** | `/sistemas/megadrive/dashboard.html` | yes | `.mdg` | System scaffold and project format |

The catalogue of systems is data, not code: `data/config/hub.json` drives what the hub displays.

---

## Repository layout

```
nes_maker_studio/
├── index.html                  # Hub entry: system picker
├── login.html                  # Auth pages
├── register.html
├── app-config.js               # Resolves APP_BASE (app sub-path) and exposes APP()
├── config_hub.php              # Hub configuration endpoint
├── commit.sh                   # Explicit per-file git add + push script
├── deploy.sh
├── data/
│   ├── config/hub.json         # System catalogue consumed by the hub
│   └── users/<id>/<system>/    # Per-user, per-system project storage
├── backend/                    # Shared backend: auth, projects, library
│   ├── auth/                   # login, logout, register, session, auth_check
│   ├── projects/               # create, load, save, list, delete, rom, …
│   └── library/                # Shared asset library: save, load, list, delete
└── sistemas/                   # One directory per target system
    ├── nes/
    │   ├── backend/            # NGC compiler + assembler endpoints
    │   │   ├── build.php       # NGC: project JSON → complete .asm
    │   │   ├── assemble.php    # .asm → ca65 → ld65 → .nes
    │   │   ├── cfg.php         # Serves the linker script for the chosen mapper
    │   │   ├── src/            # PHP compiler core
    │   │   └── templates/      # ASM-emitting templates, one file per subsystem
    │   ├── js/
    │   │   ├── core.js         # Global app state, event bus, tab manager
    │   │   ├── render-utils.js # Canvas rendering, CHR 2bpp decode, NES palette
    │   │   └── modules/        # One file per editor
    │   └── assets/             # Default CHR, logos, wallpapers
    ├── a2600/
    └── megadrive/
```

Everything system-specific lives under `sistemas/<system>/`. Code that is shared across systems (auth, project CRUD, asset library) lives in `backend/` and is reached through `app-config.js`.

---

## The hub

`data/config/hub.json` is the single source of truth for which systems appear:

```json
{
  "system": {
    "NES": {
      "label": "NES",
      "disponivel": true,
      "visivel": true,
      "sobre": "NGC — CHR, fases, programação, build com ca65 e multicart NROM.",
      "dashboard": "/sistemas/nes/dashboard.html",
      "projectExtension": ".nms"
    }
  }
}
```

Adding a system means adding a directory under `sistemas/`, registering it here, and pointing `dashboard` at its entry page. The hub reads this file rather than hardcoding a list.

`app-config.js` computes the application base path so the same code runs at a domain root or under a sub-path (e.g. `/retrocompiler`). It exposes `APP('/login.html')`, which every page uses to build absolute links.

---

## The NES system

The NES target is the only system whose pipeline is complete end-to-end today.

### Editor modules

Located in `sistemas/nes/js/modules/`. Each module owns one domain of the project.

| Module | Responsibility |
| --- | --- |
| `chr-editor.js` | Pixel-level CHR editing: pattern tables, 8×8 2bpp tiles, brush/eraser/flip/rotate tools, `.chr` import and export |
| `backgrounds.js` | Nametable editing (32×30 tiles), metatiles, attribute table palette assignment |
| `characters.js` | Metasprites assembled from 8×8 / 8×16 tiles, hitboxes, pivots and frame animations |
| `level-design.js` | World and level structure: interconnected screens, collision attributes, entity spawn points |
| `sound-editor.js` | APU tracker for Square 1/2, Triangle and Noise, with `Web Audio API` preview |
| `program.js` | 6502 assembly editor with interrupt vector management |
| `config.js` | Project metadata, mapper selection, memory map configuration |
| `build-rom.js` | Front-end build entry point |

**On `build-rom.js`:** since the NGC migration this module is a **thin shell**. It sends the raw project payload to the backend and receives the finished `.asm`. The legacy in-browser generator (`generateASM`) remains only as a fallback when the backend is unavailable or the NGC fails. Screen resolution — both game mode and single-screen — now happens entirely in `ProjectParser` on the PHP side.

The CHR data flow is worth noting because it constrains everything else: all graphical edits are held as a `Uint8Array` of 4096 or 8192 bytes, and conversion between Canvas RGBA and CHR 2bpp planar format is done by `render-utils.js`. Each 8×8 tile costs **16 bytes** in the PPU: bytes 0–7 are bitplane 0 (LSB) and bytes 8–15 are bitplane 1 (MSB).

### Build pipeline

```
[ editor modules ]  →  .nms JSON project
        │
        ▼
  backend/build.php  →  ProjectParser  →  NGC  →  templates/*.php
        │                                          (emits the full .asm)
        ▼
  backend/assemble.php  →  ca65  →  ld65  →  .nes  →  base64  →  browser
```

**`build.php`** is the NGC endpoint. It receives a JSON body, loads the template set from `templates/`, and delegates the composition to `NGC::build()`.

**`ProjectParser.php`** normalises the incoming project and resolves everything the templates need: screen layouts, tile data, sprite banks, mapper banks. It is the contract between the editor and the compiler — the "intermediate representation" of the toolchain.

**`NGC.php`** orchestrates template rendering and assembles the blocks in the exact order `ca65` requires. Its ordering is mapped label-by-label against the previously approved legacy generator, so the two produce byte-compatible output during the migration.

**`assemble.php`** runs the assembler and linker through `proc_open` with an argument array, a 120-second timeout, and a fallback chain (`proc_open` array form → string form → `exec`). It reads the exit code from `proc_get_status()` rather than `proc_close()` to avoid the well-known `-1` return bug. On success it writes `game.nes` into the project directory and returns the ROM as base64.

### The NGC compiler

`NGC` is the core of the NES backend and is versioned independently of the rest of the app (currently **0.26.0**). Its development is tracked in **stages**, each migrating one subsystem from the legacy JavaScript generator to a PHP template:

| Stage | Subsystem migrated |
| --- | --- |
| 4 | NMI routine, conditioned on whether music is selected |
| 8 | `player` block: `world_col_from`, `check_ground`, `is_solid`, `check_wall_at`, `update_player` |
| 12 | Background / screen loading: `load_screen`, `preload_screen_nt` |
| 15 | Sprite CHR packaging from `project.chr`, `project.metatiles`, `project.characters` |
| 20 | NGC assembles a complete, valid `.asm` on its own, in the order `ca65` needs: header → zeropage → code → vectors → chars |
| 21 | The payload contract is reduced to a single `.asm` response; the legacy generator is retained only as fallback |

Templates are grouped by subsystem rather than by stage: `system.php`, `background.php`, `background_data.php`, `sprites.php`, `sprite_data.php`, `chars_segments.php`, `palette_data.php`, `program.php`, `music.php`, `gameflow.php`.

Two implementation details that are easy to miss:

- **The music block is split.** A single `music` template emits both the engine and the data, separated by an internal marker, because in the final file the two parts sit in distant locations. `NGC::build()` splits them apart and places each in its correct position.
- **`chars_segments` emits one segment for NROM or up to four for CNROM**, matching the four CHR banks declared in `CnromCfg.php`, derived from `spriteChrBanks` and `bgChrBanks`.

Requesting `debug: true` in the build request returns the individual rendered blocks in a `blocks` dictionary — useful for isolating a single subsystem during migration work. Without it, the response is just the finished assembly, which keeps the normal payload small.

### Mappers and linker scripts

`cfg.php` serves the linker script for the selected mapper, and the mapping is explicit in the file name it returns:

| Mapper | Script | PRG | CHR | Banking |
| --- | --- | --- | --- | --- |
| **NROM** (0) | `nrom.cfg` | 32 KB fixed @ `$8000` | 8 KB fixed | none |
| **CNROM** (3) | `cnrom.cfg` | 32 KB fixed @ `$8000` | 32 KB as 4 banks of 8 KB | CHR only |

The CNROM script is worth understanding because it defines the shape of the whole cart:

```
ZP:   start = $0000, size = $0100, type = rw
RAM:  start = $0300, size = $0500, type = rw
HDR:  start = $0000, size = $0010, type = ro, file = %O, fill = yes
PRG:  start = $8000, size = $8000, type = ro, file = %O, fill = yes
CHR0: start = $0000, size = $2000, type = ro, file = %O, fill = yes
CHR1: start = $2000, size = $2000, type = ro, file = %O, fill = yes
CHR2: start = $4000, size = $2000, type = ro, file = %O, fill = yes
CHR3: start = $6000, size = $2000, type = ro, file = %O, fill = yes
```

CNROM does **not** bank-switch PRG, so the linker map still declares a single 32 KB PRG region. What changes is CHR: instead of one fixed 8 KB block, the cart exposes four 8 KB banks, and the running game selects which one is visible at `$0000–$1FFF` by writing to any address in `$8000–$FFFF`. The bank-resolution logic lives in `ProjectParser::resolveMapperBanks()`, and the generated switching code lives in `templates/gameflow.php`.

The script always emits all four banks (32 KB of CHR-ROM) even when a project uses fewer combinations. Unused banks are filled with `$00` and are never selected by the switching code, so they cost nothing but cartridge space — the same approach commercial games took.

Multicart builds live under `backend/multicart/` and target mappers beyond NROM and CNROM:

| Script | Target |
| --- | --- |
| `multicart/build.php` | Multicart orchestration |
| `multicart/build-unrom.php` | UNROM (UxROM, mapper 2) |
| `multicart/build-mmc3.php` | MMC3 (mapper 4) |

---

## Project file formats

Each system defines its own extension and its own JSON schema:

- **`.nms`** — NES project. Metadata (name, author, version, mapper, mirroring), CHR pattern-table bytes, palettes indexed into the official PPU palette (`$00–$3F`), nametables including attribute tables, sprites and metasprites with flip and palette attributes, levels as a grid of interconnected screens with collision data, APU tracks, and custom assembly.
- **`.agc`** — Atari 2600 project.
- **`.mdg`** — Mega Drive project.

The `.nms` file is the single input to the build. Since stage 21, the front end no longer pre-resolves screens: it sends the raw project and the backend does the work.

---

## Backend API

### Shared (`backend/`)

| Endpoint | Purpose |
| --- | --- |
| `auth/login.php`, `auth/register.php`, `auth/logout.php`, `auth/session.php`, `auth/auth_check.php` | Session and account handling |
| `projects/create.php`, `load.php`, `save.php`, `list.php`, `delete.php` | Project CRUD |
| `library/save.php`, `load.php`, `list.php`, `delete.php` | Cross-project asset library |

### NES (`sistemas/nes/backend/`)

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `build.php` | `POST` | Project JSON → complete `.asm`. Accepts `debug: true` to also return per-block output |
| `assemble.php` | `POST` | Assembly → `ca65` → `ld65` → `.nes` (base64) |
| `cfg.php` | `POST` | Returns the linker script for the chosen mapper, plus its file name |

Project files are stored on disk under `data/users/<userId>/<system>/projects/<projectId>/`, alongside the generated ROM.

---

## Requirements

- **PHP 8+** with `proc_open` enabled.
- **cc65 toolchain** — `ca65` and `ld65` must be reachable via `/usr/bin`, `/usr/local/bin`, `/bin` or `/opt/homebrew/bin`, or through `command -v`. `assemble.php` searches these paths explicitly.
- **A web server** serving the repository root, since `app-config.js` derives its base path from the request path.
- **A modern browser** for the front end (Chrome, Firefox, Edge, Safari).

---

## Running locally

1. Clone the repository into your web root:
   ```bash
   git clone git@github.com:talesCPV/nes_maker_studio.git
   ```
2. Ensure `ca65` and `ld65` are installed and discoverable by `assemble.php`.
3. Open `index.html` through a web server. Account registration and project persistence require PHP; the editors themselves are client-side.
4. If the app is served from a sub-path, set `window.APP_BASE = '/your-subpath'` before `app-config.js` loads, or let it auto-detect from the pathname.

---

## How to extend

**Adding an editor feature:** create or extend a module in `sistemas/<system>/js/modules/`, register its initialisation in that system's `js/core.js`, and extend the initial state object if new state is required.

**Adding a compiler subsystem:** add a template under `sistemas/nes/backend/templates/`, then register it in `build.php`'s template merge list and in `NGC::build()` — **both the rendering call and the ordered `$builder->add()` sequence**. The order matters: `ca65` requires the header, zeropage, code, vectors and chars in a specific sequence, and getting it wrong produces label errors rather than obvious failures.

**Adding a mapper:** add a `*Cfg.php` under `backend/src/` following `NromCfg` and `CnromCfg`, wire it into `cfg.php`, and extend `ProjectParser::resolveMapperBanks()`.

**Adding a system:** create `sistemas/<name>/` with its `backend/`, `js/` and `assets/`, then register it in `data/config/hub.json`.

Two habits that will save time on this codebase:

1. **Legacy and NGC must agree during migration.** `NGC` ordering was verified label-by-label against the legacy generator. When migrating a new block, compare the emitted `.asm` for both paths before removing the old code.
2. **`debug: true` is your friend.** It returns each block separately so you can diff one subsystem at a time instead of reading a full assembly listing.

---

## Keeping this document current

This README describes **architecture, contracts, file layout and build flow** — not implementation details that change daily. The maintenance rule is deliberately narrow:

**Update this document when a change alters any of the following:**

- a directory or file layout described in [Repository layout](#repository-layout)
- an endpoint in [Backend API](#backend-api)
- the build chain in [Build pipeline](#build-pipeline)
- a mapper or linker script in [Mappers and linker scripts](#mappers-and-linker-scripts)
- the project format described in [Project file formats](#project-file-formats)
- the NGC version or the highest completed migration stage in [The NGC compiler](#the-ngc-compiler)

**Do not update it for:** bug fixes, styling, refactors that preserve behaviour and interfaces, individual editor features, or project data under `data/`.

> **Note for contributors and tooling:** `commit.sh` adds files explicitly, one per line. Any new top-level file — including this one — must be added to that list, or it will never be pushed. Because the script ends with `git push -u -f origin main`, a missing entry is silent until someone notices the file is absent from the remote.

---

## License

No license file is present in this repository. Until one is added, all rights are reserved by the author.