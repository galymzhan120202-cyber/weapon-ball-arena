# Weapon Ball Arena

A hybrid browser game: **play it**, and the same code **auto-generates YouTube
Shorts**. Vanilla JavaScript + HTML5 Canvas, single `index.html`, zero
dependencies, no build step.

Weapon-balls fight in a shrinking arena. Last one standing wins. Every match is
fully deterministic from its seed.

This is a **standalone** project — it shares no code, repo, or channel with
`weapon-ball-bot` or any other bot. Mechanics (weapon stats, damage formula,
arena themes) are re-derived from `weapon-ball-bot/battle_sim.py`, not copied.

## Run locally

```sh
node serve.js
# open http://localhost:8778
```

Or just open `index.html` directly (works from `file://`).

## Modes / URL params

| URL | What it does |
|-----|--------------|
| `/` | Playable. Pointer aims, hold to thrust; WASD/arrows also work; `R` restarts. |
| `/?auto=1` | Director mode — all AI, no player. |
| `/?auto=1&seed=123` | Deterministic: same seed → same match. |
| `/?auto=1&record=1` | Also captures the canvas to a `.webm` you can download. |
| `/?drive=ext` | External driver owns the clock (used by the headless recorder). |
| `/?n=4` | Force fighter count (2–8). |
| `/?weapons=katana,warhammer,scythe` | Force the roster. |
| `/?sound=1` | Sound on in director mode (off by default there). |
| `/?debug=1` | Show the seed / dev overlay on recorded frames. |

`thumb.html?seed=N` renders a 1280×720 thumbnail; `branding.html?seed=N`
generates the channel banner + avatar with download buttons.

## Headless recorder

```sh
cd record && npm install
node record.js --seed=42 --max-seconds=45 --out=../out/wba_42.mp4
```

Produces `wba_42.mp4` (H.264 1080×1920 + AAC synth soundtrack), `wba_42.jpg`
(thumbnail) and `wba_42.json` (match metadata). Needs `ffmpeg` on `PATH` and a
Chrome — set `PUPPETEER_EXECUTABLE_PATH` to reuse a system install. Flags:
`--mode=screenshot`, `--no-audio`, `--no-music`, `--no-thumb`, `--verbose`.

## Upload

```sh
cd upload && npm install
node login.js                       # one-time OAuth for the new channel
node upload.js --video=../out/wba_42.mp4 --privacy=unlisted
node upload.js --video=../out/wba_42.mp4 --dry-run   # build metadata only
```

Credentials (`client_secrets.json`, `youtube_token.json`, `.env`) are
gitignored and belong to the new channel only. CI passes them as `WBA_*`
repo secrets.

## Automation

- `.github/workflows/pages.yml` — publishes the playable site to GitHub Pages.
- `.github/workflows/director.yml` — twice-daily cron: record a random fight,
  keep it as a run artifact, upload to YouTube (skips cleanly until the
  `WBA_*` secrets are set). `workflow_dispatch` takes `seed` / `max_seconds` /
  `dry_run` / `privacy`.

## Status

Full render → thumbnail → upload pipeline is built and tested end to end.
Remaining work is the manual channel + OAuth setup — see
[`PLAN.md` §9](PLAN.md).
