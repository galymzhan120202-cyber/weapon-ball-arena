#!/usr/bin/env node
/* =====================================================================
   Weapon Ball Arena — headless audio mixer
   ---------------------------------------------------------------------
   Turns the game's synth-audio event log (window.__WBA_AUDIO_LOG__)
   into a stereo WAV that lines up frame-for-frame with the recorded
   video. Pure Node, zero dependencies — every sound is synthesized
   here the same way index.html's WebAudio `sfx` object does it, plus a
   seeded procedural music bed so the clip is never dead air between
   hits.

   Use as a CLI:
     node audio.js --log=out/wba_42.audio.json --out=out/wba_42.wav
                   [--seed=42] [--no-music] [--music-gain=0.13]
                   [--sfx-gain=0.9] [--duration=SEC] [--sr=48000]

   Or in-process:
     const { renderWav } = require("./audio");
     fs.writeFileSync(out, renderWav({ log, seed, music: true }));
   ===================================================================== */
"use strict";

const fs = require("fs");

// ------------------------------------------------------------- helpers
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// one enveloped oscillator voice mixed into L/R at time `t0` (seconds)
function voice(L, R, sr, t0, opt) {
  const {
    freq = 440, dur = 0.1, type = "sine", gain = 0.15,
    sweep = 1,            // multiply freq by this over the note (exp)
    attack = 0.004,       // seconds
    pan = 0,             // -1 L .. +1 R
    noise = 0,           // 0..1 blend of white noise instead of tone
  } = opt;
  const start = Math.max(0, Math.floor(t0 * sr));
  const N = Math.floor(dur * sr);
  const end = Math.min(L.length, start + N);
  const atkN = Math.max(1, Math.floor(attack * sr));
  const gL = gain * Math.cos((pan + 1) * Math.PI / 4);
  const gR = gain * Math.sin((pan + 1) * Math.PI / 4);
  let phase = 0;
  for (let i = start; i < end; i++) {
    const k = (i - start) / N;                       // 0..1 through the note
    const f = freq * Math.pow(sweep, k);
    phase += (2 * Math.PI * f) / sr;
    let s;
    switch (type) {
      case "square":   s = Math.sin(phase) >= 0 ? 1 : -1; break;
      case "sawtooth": s = 2 * (((phase / (2 * Math.PI)) % 1)) - 1; break;
      case "triangle": s = 2 * Math.abs(2 * (((phase / (2 * Math.PI)) % 1)) - 1) - 1; break;
      default:         s = Math.sin(phase);
    }
    if (noise) s = s * (1 - noise) + (Math.random() * 2 - 1) * noise;
    // attack ramp + exponential-ish decay to zero by note end
    const env = Math.min(1, (i - start) / atkN) * Math.pow(1 - k, 1.6);
    L[i] += s * env * gL;
    R[i] += s * env * gR;
  }
}

// ------------------------------------------------------------- sfx map
// mirrors index.html's `sfx` object (freqs/types/durations kept in step)
function renderEvent(L, R, sr, ev, sfxGain) {
  const t = ev.t;
  switch (ev.type) {
    case "count":
      voice(L, R, sr, t, ev.big
        ? { freq: 700, dur: 0.25, type: "square", gain: 0.18 * sfxGain }
        : { freq: 420, dur: 0.10, type: "square", gain: 0.18 * sfxGain });
      break;
    case "hit": {
      const m = [ev.m1, ev.m2];
      let o;
      if (m.includes("blunt"))           o = { freq: 150, dur: 0.13, type: "sine",     gain: 0.20, sweep: 0.4 };
      else if (m.includes("wood"))       o = { freq: 320, dur: 0.08, type: "triangle", gain: 0.16, sweep: 0.6 };
      else if (m.includes("whip"))       o = { freq: 900, dur: 0.06, type: "sawtooth", gain: 0.13, sweep: 0.3 };
      else if (m.includes("mechanical")) o = { freq: 90,  dur: 0.15, type: "sawtooth", gain: 0.15 };
      else                               o = { freq: ev.active ? 1400 : 800, dur: 0.06, type: "square", gain: ev.active ? 0.18 : 0.12, sweep: 0.35 };
      o.gain *= sfxGain;
      // a touch of noise transient on every impact for body
      voice(L, R, sr, t, o);
      voice(L, R, sr, t, { freq: 200, dur: 0.03, type: "square", gain: 0.10 * sfxGain, noise: 0.85 });
      if (ev.crit) {
        voice(L, R, sr, t, { freq: 2000, dur: 0.14, type: "square", gain: 0.14 * sfxGain, sweep: 1.5 });
        voice(L, R, sr, t + 0.03, { freq: 2600, dur: 0.10, type: "square", gain: 0.10 * sfxGain, sweep: 1.4 });
      }
      break;
    }
    case "parry":
      voice(L, R, sr, t,        { freq: 1800, dur: 0.05, type: "square", gain: 0.18 * sfxGain, sweep: 0.5 });
      voice(L, R, sr, t + 0.03, { freq: 2400, dur: 0.05, type: "square", gain: 0.14 * sfxGain, sweep: 0.6 });
      break;
    case "ko":
      voice(L, R, sr, t, { freq: 70, dur: 0.38, type: "sawtooth", gain: 0.26 * sfxGain, sweep: 0.4 });
      voice(L, R, sr, t, { freq: 120, dur: 0.10, type: "square", gain: 0.14 * sfxGain, noise: 0.7 });
      break;
    case "callout":
      voice(L, R, sr, t, { freq: 520, dur: 0.18, type: "triangle", gain: 0.13 * sfxGain, sweep: 1.35 });
      break;
    case "win":
      [523, 659, 784, 1047].forEach((f, i) =>
        voice(L, R, sr, t + i * 0.11, { freq: f, dur: 0.20, type: "square", gain: 0.16 * sfxGain }));
      break;
  }
}

// ------------------------------------------------------------- music bed
// seeded minor-pentatonic arpeggio + root drone, low in the mix.
function renderMusic(L, R, sr, duration, seed, gain) {
  const rng = mulberry32(hashStr(seed + "music"));
  const roots = [146.83, 155.56, 164.81, 174.61, 196.00];   // D3..G3-ish
  const root = roots[Math.floor(rng() * roots.length)];
  const scale = [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5, 2];          // minor pentatonic ratios
  const step = 0.5;                                          // seconds per arp note
  let deg = 0;
  for (let t = 0; t < duration; t += step) {
    // random walk along the scale, occasional octave lift
    deg = clamp(deg + (rng() < 0.5 ? -1 : 1), 0, scale.length - 1);
    const oct = rng() < 0.18 ? 2 : 1;
    const f = root * scale[deg] * oct;
    const pan = (rng() * 2 - 1) * 0.5;
    voice(L, R, sr, t, { freq: f, dur: step * 1.7, type: "triangle", gain: gain, attack: 0.06, pan });
    if (rng() < 0.30)   // sparse harmony a fifth up
      voice(L, R, sr, t + step * 0.5, { freq: f * 1.5, dur: step, type: "sine", gain: gain * 0.6, attack: 0.05, pan: -pan });
  }
  // slow root drone in two octaves, whole-clip
  voice(L, R, sr, 0, { freq: root / 2, dur: duration, type: "sine", gain: gain * 0.9, attack: 0.8 });
  voice(L, R, sr, 0, { freq: root,     dur: duration, type: "sine", gain: gain * 0.5, attack: 1.2 });
}

// ------------------------------------------------------------- WAV out
function encodeWav(L, R, sr) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4);          // 16-bit stereo
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 4, 28);
  buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 4, 40);
  let p = 44;
  for (let i = 0; i < n; i++) {
    // soft clip so a dense hit cluster doesn't crackle
    const l = Math.tanh(L[i]) * 32767;
    const r = Math.tanh(R[i]) * 32767;
    buf.writeInt16LE(clamp(l | 0, -32768, 32767), p); p += 2;
    buf.writeInt16LE(clamp(r | 0, -32768, 32767), p); p += 2;
  }
  return buf;
}

// ------------------------------------------------------------- public
function renderWav(opt) {
  const {
    log, seed = 0, music = true, sr = 48000,
    musicGain = 0.13, sfxGain = 0.9, duration,
    tailSeconds = 0.6,
  } = opt;
  const events = (log && log.events) || [];
  const dur = (duration != null ? duration : (log && log.clock) || 0) + tailSeconds;
  const N = Math.max(1, Math.ceil(dur * sr));
  const L = new Float32Array(N), R = new Float32Array(N);

  if (music) renderMusic(L, R, sr, dur, seed, musicGain);
  for (const ev of events) renderEvent(L, R, sr, ev, sfxGain);

  return encodeWav(L, R, sr);
}

module.exports = { renderWav };

// ------------------------------------------------------------- CLI
if (require.main === module) {
  const a = {};
  for (const arg of process.argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (m) a[m[1]] = m[2] === undefined ? true : m[2];
  }
  if (a.help || !a.log || !a.out) {
    console.log("usage: node audio.js --log=<audio.json> --out=<file.wav> [--seed=N] [--no-music] [--music-gain=0.13] [--sfx-gain=0.9] [--duration=SEC] [--sr=48000]");
    process.exit(a.help ? 0 : 1);
  }
  const log = JSON.parse(fs.readFileSync(a.log, "utf8"));
  const wav = renderWav({
    log,
    seed: a.seed != null ? (a.seed >>> 0) : 0,
    music: !a["no-music"],
    sr: a.sr ? parseInt(a.sr, 10) : 48000,
    musicGain: a["music-gain"] ? parseFloat(a["music-gain"]) : 0.13,
    sfxGain: a["sfx-gain"] ? parseFloat(a["sfx-gain"]) : 0.9,
    duration: a.duration ? parseFloat(a.duration) : undefined,
  });
  fs.writeFileSync(a.out, wav);
  console.log(`✓ ${a.out}  ·  ${(wav.length / 1e6).toFixed(1)} MB  ·  ${log.events.length} events`);
}
