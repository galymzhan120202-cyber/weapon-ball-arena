#!/usr/bin/env node
"use strict";
/* =====================================================================
   Weapon Ball Arena — YouTube uploader
   ---------------------------------------------------------------------
   Uploads one recorded director clip + its thumbnail, using the
   metadata templates in meta.js. Sends a Telegram note on success.

     node upload.js --video=../out/wba_42.mp4
                    [--json=../out/wba_42.json]   (default: <video>.json)
                    [--thumb=../out/wba_42.jpg]   (default: <video>.jpg)
                    [--privacy=public|unlisted|private]
                    [--spoiler-free]   (keep the winner out of the text)
                    [--dry-run]        (build metadata, upload nothing)

   Needs ../client_secrets.json + ../youtube_token.json (or the
   WBA_CLIENT_SECRETS_JSON / WBA_YOUTUBE_TOKEN_JSON env vars). Run
   login.js once first.
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const { buildMeta } = require("./meta");
const { makeOAuth, loadToken, saveToken, telegramNotify } = require("./lib");

function parseArgs(argv) {
  const a = { privacy: "public" };
  for (const arg of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (!m) continue;
    const [, k, v] = m;
    if (k === "video") a.video = v;
    else if (k === "json") a.json = v;
    else if (k === "thumb") a.thumb = v;
    else if (k === "privacy") a.privacy = v;
    else if (k === "spoiler-free") a.spoilerFree = true;
    else if (k === "dry-run") a.dryRun = true;
    else if (k === "play-url") a.playUrl = v;
    else if (k === "title") a.title = v;             // override (used by the ranking video)
    else if (k === "desc-file") a.descFile = v;      // override description from a file
    else if (k === "tags") a.tagsCsv = v;
    else if (k === "help") a.help = true;
  }
  return a;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.video) {
    console.log("usage: node upload.js --video=<path.mp4> [--json=] [--thumb=] [--privacy=public] [--spoiler-free] [--dry-run]");
    process.exit(args.help ? 0 : 1);
  }

  const video = path.resolve(args.video);
  if (!fs.existsSync(video)) throw new Error("video not found: " + video);
  const stem = video.replace(/\.mp4$/i, "");
  const jsonPath = path.resolve(args.json || stem + ".json");
  const thumbPath = path.resolve(args.thumb || stem + ".jpg");

  const hasJson = fs.existsSync(jsonPath);
  if (!hasJson && !args.title) throw new Error("match json not found: " + jsonPath + " (run record.js with --keep-json, or pass --title/--desc-file)");
  const match = hasJson ? JSON.parse(fs.readFileSync(jsonPath, "utf8")) : {};

  let meta;
  if (args.title) {
    // explicit override — the monthly ranking video, not a match
    meta = {
      title: args.title.slice(0, 100),
      description: (args.descFile && fs.existsSync(args.descFile)) ? fs.readFileSync(args.descFile, "utf8") : "",
      tags: (args.tagsCsv || "weapon ball,weapon ball arena,tier list,ranking,physics").split(",").map((s) => s.trim()).filter(Boolean),
      categoryId: "20",
      privacyStatus: args.privacy || "public",
      madeForKids: false,
    };
  } else {
    meta = buildMeta(match, {
      privacyStatus: args.privacy,
      spoilerFree: args.spoilerFree,
      playUrl: args.playUrl,
    });
  }

  console.log("● " + meta.title);
  console.log("  " + (match.fighters || []).map((f) => f.name).join(" vs ") + "  →  " + (match.winner || "—"));
  console.log("  tags: " + meta.tags.join(", "));
  console.log("  privacy: " + meta.privacyStatus + (fs.existsSync(thumbPath) ? "  ·  thumb: " + path.basename(thumbPath) : "  ·  no thumbnail"));

  if (args.dryRun) {
    console.log("\n--dry-run: nothing uploaded.\n" + meta.description + "\n");
    return;
  }

  // ---- auth ----
  const token = loadToken();
  if (!token) throw new Error("no youtube_token.json — run `node login.js` once, signed into the new channel");
  const oauth = makeOAuth(google);
  oauth.setCredentials(token);
  oauth.on("tokens", (t) => {                     // persist a refreshed access token
    const merged = Object.assign({}, token, t);
    try { saveToken(merged); } catch {}
  });
  const yt = google.youtube({ version: "v3", auth: oauth });

  // ---- insert ----
  const t0 = Date.now();
  const res = await yt.videos.insert({
    part: "snippet,status",
    notifySubscribers: true,
    requestBody: {
      snippet: {
        title: meta.title,
        description: meta.description,
        tags: meta.tags,
        categoryId: meta.categoryId,
      },
      status: {
        privacyStatus: meta.privacyStatus,
        selfDeclaredMadeForKids: meta.madeForKids,
      },
    },
    media: { body: fs.createReadStream(video) },
  }, {
    // resumable upload with basic progress
    onUploadProgress: (e) => {
      const mb = (e.bytesRead / 1e6).toFixed(1);
      process.stdout.write(`\r  uploading ${mb} MB`);
    },
  });
  process.stdout.write("\n");
  const id = res.data.id;
  const url = "https://youtu.be/" + id;

  // ---- thumbnail ----
  if (fs.existsSync(thumbPath)) {
    try {
      await yt.thumbnails.set({ videoId: id, media: { body: fs.createReadStream(thumbPath) } });
      console.log("  thumbnail set");
    } catch (e) {
      console.error("  thumbnail upload failed (non-fatal):", e && e.message || e);
    }
  }

  // stamp the URL back into the match json so record-result.js / the
  // workflow can pick it up without re-parsing stdout.
  if (hasJson) try {
    match.videoUrl = url; match.videoId = id;
    fs.writeFileSync(jsonPath, JSON.stringify(match, null, 2));
  } catch (e) { /* non-fatal */ }

  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`✓ ${url}  ·  ${meta.privacyStatus}  ·  ${secs}s`);

  await telegramNotify(
    `🗡️ Weapon Ball Arena — uploaded\n${meta.title}\n${(match.fighters || []).map((f) => f.name).join(" vs ")} → ${match.winner || "—"}\n${url}`
  );
})().catch((e) => { console.error("\n✗ upload failed:", e && e.message || e, "\n"); process.exit(1); });
