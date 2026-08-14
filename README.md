# AI Mastering Studio

Production-ready mastering platform with:

- Node.js backend (Express) organized into routes, services, and config layers.
- Next.js 14 + React + Tailwind frontend with scalable domain/network/store architecture.
- React Bits Threads visual component integrated using OGL.
- Editable professional mixing presets in a single JSON file.

## Architecture

### Backend (Node.js)

```text
backend-node/
  src/
    config/
      constants.js
      settings.js
    routes/
      masteringRoutes.js
    services/
      masteringService.js
      presetsService.js
    server.js
  uploads/
  outputs/
```

Design:

- Routes only orchestrate request/response behavior.
- Services contain mastering flow, validation, and preset resolution.
- DSP rendering is handled via FFmpeg orchestration from Node services.

### Frontend

```text
frontend/
  src/
    app/
      page.js
      layout.js
      globals.css
      ui/MasteringConsole.jsx
    domain/mastering/
      masteringDomain.js
    network/http/
      client.js
    store/
      masteringStore.js
    components/reactbits/
      Threads.jsx
      Threads.css
```

Design:

- UI calls store actions.
- Store calls domain logic.
- Domain calls network client wrappers.
- External API calls are isolated in the network layer.

## Professional Mixing Presets (Editable)

Edit this file:

- `backend/mixing_presets.json` (shared preset source used by Node backend)

Each preset can define:

- `description`
- `genre`
- `style`
- `tags`
- `tweaks` (`low_end`, `punch`, `presence`, `brightness`, `warmth`, `width`, `loudness`)
- `use_stem_separation`
- `output_format`

API endpoint to inspect presets:

- `GET /mix-presets`

Apply preset during mastering:

- Send form field `mix_preset=<preset_name>` to `POST /master`.

## Mastering Templates Reference

This section documents the template-inspired mastering setup that was added to make output more professional and consistent.

### Template Style: `stock_mastering_strip`

Defined in `backend/params.py` under `MASTERING_STYLE_PROFILES`.

Parameters:

- `target_lufs_delta: -1.4`
- `target_dynamic_range_delta: 1.4`
- `max_stereo_width_delta: 0.0`
- `saturation_delta: -0.03`
- `hf_boost_cap_db: 0.72`
- `max_lufs_raise_db: 0.9`
- `max_lufs_reduce_db: -1.6`

What this style does:

- Targets a safer loudness rise and avoids over-pushing already loud mixes.
- Preserves more dynamics than aggressive modern loudness styles.
- Keeps top-end boosts capped, reducing brittle highs.
- Keeps stereo width conservative for better translation and mono safety.

### Stock Template Presets

Defined in `backend/mixing_presets.json` and available via `GET /mix-presets`.

#### 1) Stock Mastering Radio Glue

- `name`: `stock_mastering_radio_glue`
- `display_name`: `Stock Mastering Radio Glue`
- `genre`: `rock`
- `style`: `stock_mastering_strip`
- `tags`: `clearer`, `warmer`, `punchier_drums`
- `tweaks`:
  - `low_end: 0.08`
  - `punch: 0.12`
  - `presence: 0.06`
  - `brightness: 0.02`
  - `warmth: 0.12`
  - `width: 0.02`
  - `loudness: 0.02`
- `use_stem_separation`: `false`
- `output_format`: `wav`

Behavior summary:

- Adds light glue and punch while keeping tone warm and controlled.
- Designed for balanced translation rather than extreme loudness.

#### 2) Stock Mastering Stream Safe

- `name`: `stock_mastering_stream_safe`
- `display_name`: `Stock Mastering Stream Safe`
- `genre`: `pop`
- `style`: `stock_mastering_strip`
- `tags`: `better_vocals`, `clearer`, `softer`
- `tweaks`:
  - `low_end: 0.04`
  - `punch: 0.06`
  - `presence: 0.14`
  - `brightness: 0.06`
  - `warmth: 0.1`
  - `width: 0.03`
  - `loudness: -0.04`
- `use_stem_separation`: `false`
- `output_format`: `wav`

Behavior summary:

- Prioritizes vocal clarity and streaming-safe loudness.
- Uses softer loudness intent to reduce fatigue and limiter stress.

#### 3) Stock Mastering Low-End Control

- `name`: `stock_mastering_lowend_control`
- `display_name`: `Stock Mastering Low-End Control`
- `genre`: `hiphop`
- `style`: `stock_mastering_strip`
- `tags`: `deeper`, `clearer`, `louder`
- `tweaks`:
  - `low_end: 0.14`
  - `punch: 0.1`
  - `presence: 0.08`
  - `brightness: 0.02`
  - `warmth: 0.08`
  - `width: 0.0`
  - `loudness: 0.06`
- `use_stem_separation`: `false`
- `output_format`: `wav`

Behavior summary:

- Reinforces sub/bass while keeping low-mid build-up under control.
- Aims for punchy but stable low-end with moderate loudness lift.

### Parameter Glossary (How Parameters Affect Mastering)

Style-level parameters (`backend/params.py`):

- `target_lufs_delta`: shifts integrated loudness target relative to genre baseline.
- `target_dynamic_range_delta`: pushes result toward more/less dynamic range.
- `max_stereo_width_delta`: limits or expands target stereo width.
- `saturation_delta`: changes base harmonic saturation amount.
- `hf_boost_cap_db`: limits high-frequency boost to avoid harshness.
- `max_lufs_raise_db`: ceiling for how much gain-up loudness increase is allowed.
- `max_lufs_reduce_db`: floor for how much loudness reduction is allowed.

Preset tweak sliders (`tweaks` object):

- `low_end`: moves sub and bass EQ correction strength.
- `punch`: adjusts low/low-mid compression behavior for transient impact.
- `presence`: raises vocal/intelligibility region (mostly 2 kHz to 6 kHz).
- `brightness`: controls upper-mid and high shelf energy.
- `warmth`: tilts toward low-mid body and slightly away from brittle top-end.
- `width`: adjusts side gain and perceived stereo spread.
- `loudness`: offsets final LUFS target up/down within safety guards.

Tag influences (`tags` array):

- Tags apply preset biases before tweaks, including band biases, vocal presence, width, and compression behavior.
- Examples:
  - `better_vocals` increases vocal target/presence handling.
  - `deeper` biases sub/bass bands upward.
  - `louder` requests louder target and stronger compression drive.
  - `softer` reduces loudness/compression and narrows width slightly.

### How the Templates Do Mastering (Processing Flow)

The templates are not static plugin presets. They drive an adaptive pipeline:

1. Analyze input audio:
  - Measures LUFS, loudness range, true peak, crest factor, stereo width/correlation, and 7-band spectral balance.
2. Build target profile:
  - Starts from genre baseline, applies tag biases, then applies style deltas (`stock_mastering_strip` here).
3. Compute adaptive corrections:
  - Calculates per-band EQ gain changes and multiband compression settings from measured-vs-target deltas.
  - Applies loudness safety clamps (`max_lufs_raise_db`, `max_lufs_reduce_db`).
4. Apply preset `tweaks`:
  - Refines low-end/punch/presence/brightness/warmth/width/loudness around the computed adaptive settings.
5. Process in M/S multiband:
  - Splits into low, low-mid, high-mid, high bands.
  - Applies compression + tone shaping per band, then recombines.
6. Add controlled color and width automation:
  - Applies measured saturation, section-aware width and air automation, and mono-compatibility protection.
7. Final bus/loudness stage:
  - Optional glue compression, LUFS gain to target, limiter at about -1 dBTP, loudness guard iterations.
8. Output and reporting:
  - Writes final audio and returns before/after analysis + processing summary.

## Run Backend

```bash
cd backend-node
npm install
cp .env.example .env
npm run dev
```

Optional env vars:

- `PORT`
- `CORS_ORIGINS` (comma separated)
- `UPLOAD_DIR`
- `OUTPUT_DIR`
- `MAX_UPLOAD_MB`

## Run Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Frontend default API target:

- `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`

## Core API

- `GET /health`
- `GET /genres`
- `GET /tags`
- `GET /styles`
- `GET /mix-presets`
- `POST /master`
- `GET /download/{job_id}.{ext}`
- `GET /original/{job_id}`

## Notes

- FFmpeg must be installed and available on `PATH`.
- Legacy Python backend is still present in `backend/` for reference, but the primary runtime stack is now Node.js + React + Tailwind.
