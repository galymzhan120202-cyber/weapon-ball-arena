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

## Modes

| URL | What it does |
|-----|--------------|
| `/` | Playable. Pointer aims, hold to thrust; WASD/arrows also work; `R` restarts. |
| `/?auto=1` | Director mode — all AI, no player. |
| `/?auto=1&seed=123` | Deterministic: same seed → same match. |
| `/?auto=1&record=1` | Also captures the canvas to a `.webm` you can download. |
| `/?n=4` | Force fighter count (2–8). |
| `/?weapons=katana,warhammer,scythe` | Force the roster. |
| `/?sound=1` | Sound on in director mode (off by default there). |

## Status

v0.1 prototype — see [`PLAN.md`](PLAN.md) for the full roadmap.
