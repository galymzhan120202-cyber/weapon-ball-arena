#!/usr/bin/env node
/* =====================================================================
   Weapon Ball Arena — headless recorder
   ---------------------------------------------------------------------
   Renders one director-mode match to an mp4, deterministically from its
   seed. Drives the game's own window.__WBA_TICK__() hook one output
   frame at a time (so the browser's requestAnimationFrame throttling
   cannot slow or desync the match). Two video encoders:
     - default: the page runs its own WebCodecs H.264 encoder; we pull
       the Annex-B stream and ffmpeg stream-copies it to mp4 (fast).
     - --mode=screenshot: screenshot every frame, pipe JPEGs to ffmpeg
       (fallback; also used automatically when WebCodecs is missing).
   Then record/audio.js synthesizes a matching soundtrack from the
   game's audio-event log and ffmpeg muxes it in.

   Usage:
     node record.js [--seed=N] [--out=path.mp4] [--fps=60]
                    [--max-seconds=60] [--mode=screenshot] [--batch=15]
                    [--no-audio] [--no-music] [--keep-wav]
                    [--no-thumb] [--thumb-reveal]
                    [--keep-frames] [--keep-json] [--no-json] [--verbose]

   Env overrides:
     FFMPEG_PATH                  path to ffmpeg (default: "ffmpeg" on PATH)
     PUPPETEER_EXECUTABLE_PATH    use an existing Chrome instead of the
                                  bundled Chromium

   Output:
     <out>.mp4   H.264 / yuv420p, 1080x1920, <fps> fps, +faststart,
                 AAC soundtrack unless --no-audio
     <out>.jpg   1280x720 thumbnail (thumb.html) unless --no-thumb
     <out>.json  match metadata (winner, matchup, theme, hp, hits) for
                 the uploader — unless you skip it; --keep-json forces it
   ===================================================================== */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const { renderWav } = require("./audio");

const GAME_DIR = path.resolve(__dirname, "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

// ---------------------------------------------------------------- args
function parseArgs(argv) {
  const a = { fps: 60, maxSeconds: 60, keepJson: true, verbose: false };
  for (const arg of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (!m) continue;
    const [, k, v] = m;
    if (k === "seed") a.seed = v >>> 0;
    else if (k === "out") a.out = v;
    else if (k === "fps") a.fps = parseInt(v, 10) || 60;
    else if (k === "max-seconds") a.maxSeconds = parseFloat(v) || 60;
    else if (k === "keep-json") a.keepJson = true;
    else if (k === "no-json") a.keepJson = false;
    else if (k === "mode") a.mode = v;                 // "webcodecs" (default) | "screenshot"
    else if (k === "batch") a.batch = Math.max(1, parseInt(v, 10) || 15);
    else if (k === "keep-frames") a.keepFrames = true; // keep the intermediate .h264
    else if (k === "no-audio") a.noAudio = true;       // render a silent mp4
    else if (k === "no-music") a.noMusic = true;       // sfx only, no music bed
    else if (k === "keep-wav") a.keepWav = true;       // keep the intermediate .wav
    else if (k === "no-thumb") a.noThumb = true;       // skip the .jpg thumbnail
    else if (k === "thumb-reveal") a.thumbReveal = true; // headline names the winner
    else if (k === "verbose") a.verbose = true;
    else if (k === "help") a.help = true;
  }
  return a;
}
const args = parseArgs(process.argv.slice(2));
if (args.help) { console.log(fs.readFileSync(__filename, "utf8").split("*/")[0].replace("/* ", "")); process.exit(0); }

const SEED = args.seed != null ? args.seed : (Math.random() * 2 ** 31) >>> 0;
const FPS = args.fps;
const MAX_FRAMES = Math.round(args.maxSeconds * FPS);
const OUT = path.resolve(args.out || path.join(GAME_DIR, "out", `wba_${SEED}.mp4`));
const STEM = OUT.replace(/\.mp4$/i, "");
const JSON_OUT = STEM + ".json";
const WAV_OUT = STEM + ".wav";
const JPG_OUT = STEM + ".jpg";
const SILENT_OUT = STEM + ".silent.mp4";
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const WITH_AUDIO = !args.noAudio;
// while a soundtrack is wanted, ffmpeg renders video to a temp file and a
// second pass muxes in the WAV; the finished mp4 still lands exactly at OUT.
const VID_OUT = WITH_AUDIO ? SILENT_OUT : OUT;

const log = (...m) => console.log(...m);
const vlog = (...m) => { if (args.verbose) console.log(...m); };

// ---------------------------------------------------------------- helpers
function startServer() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split("?")[0]);
      if (rel === "/" || rel === "") rel = "/index.html";
      const fp = path.join(GAME_DIR, rel);
      if (!fp.startsWith(GAME_DIR)) { res.writeHead(403); return res.end("forbidden"); }
      fs.readFile(fp, (err, data) => {
        if (err) { res.writeHead(404); return res.end("not found: " + rel); }
        res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
        res.end(data);
      });
    });
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}

function writeFrame(stream, buf) {
  return new Promise((resolve, reject) => {
    stream.write(buf, (err) => (err ? reject(err) : resolve()));
  });
}

function ffmpegExit(proc) {
  return new Promise((resolve, reject) => {
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg exited " + code))));
  });
}

function checkFfmpeg() {
  return new Promise((resolve) => {
    const p = spawn(FFMPEG, ["-version"], { stdio: "ignore" });
    p.on("error", () => resolve(false));
    p.on("close", (c) => resolve(c === 0));
  });
}

// ---------------------------------------------------------------- main
(async () => {
  let puppeteer;
  try { puppeteer = require("puppeteer"); }
  catch { console.error("✗ puppeteer not installed. Run:  cd record && npm install"); process.exit(1); }

  if (!(await checkFfmpeg())) {
    console.error(`✗ ffmpeg not found ("${FFMPEG}"). Install it or set FFMPEG_PATH.`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  const srv = await startServer();
  const port = srv.address().port;
  const forceShot = args.mode === "screenshot";
  const url = `http://127.0.0.1:${port}/index.html?auto=1&drive=ext&seed=${SEED}` + (forceShot ? "" : "&encode=wc");
  log(`● seed ${SEED}  →  ${path.relative(process.cwd(), OUT)}`);
  vlog(`  serving ${GAME_DIR} on :${port}`);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      "--no-sandbox", "--disable-setuid-sandbox",
      "--hide-scrollbars", "--force-color-profile=srgb",
      "--disable-gpu-vsync", "--disable-background-timer-throttling",
    ],
  });

  let frame = 0;
  let ff;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => console.error("  [page error]", e.message));
    if (args.verbose) page.on("console", (m) => console.log("  [page]", m.text()));

    await page.goto(url, { waitUntil: "load", timeout: 20000 });
    await page.waitForFunction("window.__WBA_READY__ === true", { timeout: 15000 });

    const wcState = forceShot ? { ok: false } : await page.evaluate(() => window.__WBA_WC__ && window.__WBA_WC_STATE__());
    const useWC = !!(wcState && wcState.ok);
    log(useWC ? "  encoder: WebCodecs H.264 (in-page)" : "  encoder: canvas screenshot → ffmpeg" + (wcState && wcState.error ? " (WebCodecs: " + wcState.error + ")" : ""));

    const t0 = Date.now();
    let done = false, lastLog = Date.now();
    const progress = (st) => {
      if (frame % 60 === 0 && Date.now() - lastLog > 1500) {
        process.stdout.write(`\r  ${frame} frames · sim ${st.t.toFixed(1)}s · ${((Date.now() - t0) / 1000).toFixed(0)}s   `);
        lastLog = Date.now();
      }
    };

    if (useWC) {
      // ---- fast path: browser encodes H.264, we pull the Annex-B stream ----
      // Batch many ticks per page.evaluate call: the per-call CDP round-trip
      // (~80ms) dwarfs a tick (sim+render+VideoFrame ~3ms), so 1 call/frame
      // was the real bottleneck. The encoder still captures every frame.
      const BATCH = args.batch || 30;
      const h264Path = STEM + ".h264";
      const h264 = fs.createWriteStream(h264Path);
      const drain = async () => {
        for (;;) {
          const batch = await page.evaluate((n) => window.__WBA_WC_PULL__(n), 200);
          if (!batch.length) break;
          for (const b64 of batch) await writeFrame(h264, Buffer.from(b64, "base64"));
        }
      };
      while (!done && frame < MAX_FRAMES) {
        const st = await page.evaluate((n) => {
          let s; for (let i = 0; i < n; i++) { s = window.__WBA_TICK__(); if (s.done) break; }
          return s;
        }, Math.min(BATCH, MAX_FRAMES - frame));
        frame = st.frame; done = st.done;
        await drain();
        progress(st);
      }
      await page.evaluate(() => window.__WBA_WC_FLUSH__());
      await drain();
      await new Promise((res) => h264.end(res));
      process.stdout.write("\n");

      ff = spawn(FFMPEG, [
        "-y", "-loglevel", args.verbose ? "info" : "error",
        "-fflags", "+genpts", "-r", String(FPS), "-f", "h264", "-i", h264Path,
        "-c:v", "copy", "-movflags", "+faststart", VID_OUT,
      ], { stdio: ["ignore", "inherit", "inherit"] });
      await ffmpegExit(ff);
      if (!args.keepFrames) fs.unlinkSync(h264Path);
    } else {
      // ---- fallback: screenshot every frame, pipe JPEGs to ffmpeg ----
      const canvas = await page.$("#c");
      if (!canvas) throw new Error("canvas #c not found");
      ff = spawn(FFMPEG, [
        "-y", "-loglevel", args.verbose ? "info" : "error",
        "-f", "image2pipe", "-framerate", String(FPS), "-i", "pipe:0",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20",
        "-movflags", "+faststart", VID_OUT,
      ], { stdio: ["pipe", "inherit", "inherit"] });
      ff.on("error", (e) => { throw e; });
      while (!done && frame < MAX_FRAMES) {
        const st = await page.evaluate(() => window.__WBA_TICK__());
        const buf = await canvas.screenshot({ type: "jpeg", quality: 92, optimizeForSpeed: true });
        await writeFrame(ff.stdin, buf);
        done = st.done; frame++;
        progress(st);
      }
      process.stdout.write("\n");
      ff.stdin.end();
      await ffmpegExit(ff);
    }

    // ---- soundtrack: synth sfx + music bed from the game's audio log ----
    let hasAudio = false;
    if (WITH_AUDIO) {
      try {
        const alog = await page.evaluate(() => window.__WBA_AUDIO_LOG__ && window.__WBA_AUDIO_LOG__());
        const wav = renderWav({ log: alog, seed: SEED, music: !args.noMusic, duration: frame / FPS });
        fs.writeFileSync(WAV_OUT, wav);
        const mux = spawn(FFMPEG, [
          "-y", "-loglevel", args.verbose ? "info" : "error",
          "-i", VID_OUT, "-i", WAV_OUT,
          "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
          "-map", "0:v:0", "-map", "1:a:0", "-shortest",
          "-movflags", "+faststart", OUT,
        ], { stdio: ["ignore", "inherit", "inherit"] });
        await ffmpegExit(mux);
        hasAudio = true;
        fs.unlinkSync(VID_OUT);
        if (!args.keepWav) fs.unlinkSync(WAV_OUT);
        log(`  audio: ${alog ? alog.events.length : 0} events${args.noMusic ? "" : " + music bed"} → AAC`);
      } catch (e) {
        console.error("  audio mix failed, keeping silent video:", e && e.message || e);
        if (fs.existsSync(SILENT_OUT) && !fs.existsSync(OUT)) fs.renameSync(SILENT_OUT, OUT);
      }
    }

    const meta = await page.evaluate(() => window.__WBA_META__());
    meta.seed = SEED; meta.fps = FPS; meta.frames = frame; meta.durationSec = +(frame / FPS).toFixed(2);
    meta.truncated = !done;
    meta.encoder = useWC ? "webcodecs" : "screenshot";
    meta.hasAudio = hasAudio;

    // ---- thumbnail: open thumb.html with the real result, screenshot #c ----
    if (!args.noThumb) {
      try {
        const f0 = meta.fighters[0], f1 = meta.fighters[1];
        const win = meta.winner === (f0 && f0.name) ? "a" : meta.winner === (f1 && f1.name) ? "b" : "";
        const tq = new URLSearchParams({ seed: String(SEED), a: f0.name, b: f1.name, theme: meta.theme });
        if (win) tq.set("win", win);
        if (win && args.thumbReveal) tq.set("reveal", "1");
        const tp = await browser.newPage();
        await tp.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
        await tp.goto(`http://127.0.0.1:${port}/thumb.html?` + tq.toString(), { waitUntil: "load", timeout: 15000 });
        await tp.waitForFunction("window.__WBA_THUMB_READY__ === true", { timeout: 8000 });
        const el = await tp.$("#c");
        await el.screenshot({ path: JPG_OUT, type: "jpeg", quality: 92 });
        await tp.close();
        meta.thumb = path.basename(JPG_OUT);
        log(`  thumb: ${path.relative(process.cwd(), JPG_OUT)}`);
      } catch (e) {
        console.error("  thumbnail failed:", e && e.message || e);
      }
    }

    if (args.keepJson) fs.writeFileSync(JSON_OUT, JSON.stringify(meta, null, 2));

    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const size = (fs.statSync(OUT).size / 1e6).toFixed(1);
    log(`✓ ${frame} frames / ${meta.durationSec}s video  ·  ${size} MB  ·  ${secs}s  (${(frame / secs).toFixed(1)} fps)`);
    log(`  ${meta.fighters.map((f) => f.name).join(" vs ")}  →  ${meta.winner || "—"}  (${meta.finishText || "truncated"})`);
    if (args.keepJson) log(`  meta: ${path.relative(process.cwd(), JSON_OUT)}`);
  } catch (err) {
    console.error("✗ record failed:", err && err.message || err);
    try { if (ff && !ff.killed) { ff.stdin.end(); ff.kill("SIGKILL"); } } catch {}
    for (const f of [SILENT_OUT, WAV_OUT, STEM + ".h264"]) { try { fs.unlinkSync(f); } catch {} }
    await browser.close().catch(() => {});
    srv.close();
    process.exit(1);
  }

  await browser.close();
  srv.close();
})();
