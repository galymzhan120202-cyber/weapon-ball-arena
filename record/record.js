#!/usr/bin/env node
/* =====================================================================
   Weapon Ball Arena — headless recorder
   ---------------------------------------------------------------------
   Renders one director-mode match to an mp4, deterministically from its
   seed. Drives the game's own window.__WBA_TICK__() hook one output
   frame at a time (so the browser's requestAnimationFrame throttling
   cannot slow or desync the match), screenshots the canvas each frame,
   and pipes the frames straight into ffmpeg.

   Usage:
     node record.js [--seed=N] [--out=path.mp4] [--fps=60]
                    [--max-seconds=60] [--keep-json] [--verbose]

   Env overrides:
     FFMPEG_PATH                  path to ffmpeg (default: "ffmpeg" on PATH)
     PUPPETEER_EXECUTABLE_PATH    use an existing Chrome instead of the
                                  bundled Chromium

   Output:
     <out>.mp4   H.264 / yuv420p, 1080x1920, <fps> fps, +faststart
     <out>.json  match metadata (winner, matchup, theme, hp, hits) for
                 the uploader — unless you skip it; --keep-json forces it
   ===================================================================== */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

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
const JSON_OUT = OUT.replace(/\.mp4$/i, "") + ".json";
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

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
      const BATCH = args.batch || 15;
      const h264Path = OUT.replace(/\.mp4$/i, "") + ".h264";
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
        "-c:v", "copy", "-movflags", "+faststart", OUT,
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
        "-movflags", "+faststart", OUT,
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

    const meta = await page.evaluate(() => window.__WBA_META__());
    meta.seed = SEED; meta.fps = FPS; meta.frames = frame; meta.durationSec = +(frame / FPS).toFixed(2);
    meta.truncated = !done;
    meta.encoder = useWC ? "webcodecs" : "screenshot";
    if (args.keepJson) fs.writeFileSync(JSON_OUT, JSON.stringify(meta, null, 2));

    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const size = (fs.statSync(OUT).size / 1e6).toFixed(1);
    log(`✓ ${frame} frames / ${meta.durationSec}s video  ·  ${size} MB  ·  ${secs}s  (${(frame / secs).toFixed(1)} fps)`);
    log(`  ${meta.fighters.map((f) => f.name).join(" vs ")}  →  ${meta.winner || "—"}  (${meta.finishText || "truncated"})`);
    if (args.keepJson) log(`  meta: ${path.relative(process.cwd(), JSON_OUT)}`);
  } catch (err) {
    console.error("✗ record failed:", err && err.message || err);
    try { if (ff && !ff.killed) { ff.stdin.end(); ff.kill("SIGKILL"); } } catch {}
    await browser.close().catch(() => {});
    srv.close();
    process.exit(1);
  }

  await browser.close();
  srv.close();
})();
