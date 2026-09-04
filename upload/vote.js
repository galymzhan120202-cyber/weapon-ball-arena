#!/usr/bin/env node
"use strict";
/* =====================================================================
   Weapon Ball Arena — community matchup vote (fully automatic, read-only)
   ---------------------------------------------------------------------
   Reads comments on the channel's recent uploads and tallies weapon-name
   mentions. If a clear top-2 emerges it prints `a=`/`b=` (GITHUB_OUTPUT
   style) so the director can run that matchup instead of the bracket.
   Needs only the youtube.readonly scope the upload token already has —
   nothing is posted. No clear result => prints nothing, caller falls back.

   Usage:  node vote.js tally [--videos=5] [--min=4]
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const { makeOAuth, loadToken } = require("./lib");

// weapon kinds + display names + a few forgiving aliases
const WEAPONS = {
  sword: ["sword"], katana: ["katana"], axe: ["axe"], hammer: ["hammer"],
  warhammer: ["warhammer", "war hammer"], spear: ["spear"], trident: ["trident"],
  dagger: ["dagger"], kunai: ["kunai"], mace: ["mace"], flail: ["flail"],
  nunchaku: ["nunchaku", "nunchucks", "nunchuck"], whip: ["whip"], claws: ["claws", "claw"],
  scythe: ["scythe"], chainsaw: ["chainsaw", "chain saw"], staff: ["staff"],
  shuriken: ["shuriken", "throwing star", "ninja star"], rapier: ["rapier"],
  halberd: ["halberd"], cleaver: ["cleaver"], boomerang: ["boomerang"],
  war_axe: ["war axe", "waraxe"], tomahawk: ["tomahawk"],
  dual_daggers: ["dual daggers", "twin daggers", "dual dagger"], pistol: ["pistol", "gun", "revolver"],
};
const PRETTY = { war_axe: "War Axe", dual_daggers: "Dual Daggers" };
const pretty = (k) => PRETTY[k] || k.replace(/(^|_)(\w)/g, (_, s, c) => (s ? " " : "") + c.toUpperCase());

const ALIASES = [];
for (const [kind, list] of Object.entries(WEAPONS)) for (const a of list) ALIASES.push([a, kind]);
ALIASES.sort((x, y) => y[0].length - x[0].length);      // match longer phrases first

function weaponsIn(text) {
  const t = " " + text.toLowerCase().replace(/[^a-z ]+/g, " ") + " ";
  const found = [];
  for (const [alias, kind] of ALIASES) {
    if (found.includes(kind)) continue;
    if (t.includes(" " + alias + " ")) found.push(kind);
    if (found.length >= 2) break;
  }
  return found;
}

function argN(name, def) {
  const m = process.argv.find((a) => a.startsWith(`--${name}=`));
  return m ? parseInt(m.slice(name.length + 3), 10) : def;
}

(async () => {
  if (process.argv[2] !== "tally") { console.error("usage: node vote.js tally [--videos=5] [--min=4]"); process.exit(1); }
  const nVideos = argN("videos", 5);
  const minVotes = argN("min", 4);

  const token = loadToken();
  if (!token) { console.error("no youtube_token.json — skipping vote"); return; }
  const oauth = makeOAuth(google);
  oauth.setCredentials(token);
  const yt = google.youtube({ version: "v3", auth: oauth });

  // recent uploads
  const ch = await yt.channels.list({ part: "contentDetails", mine: true });
  const uploads = ch.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) { console.error("no uploads playlist"); return; }
  const pl = await yt.playlistItems.list({ part: "contentDetails", playlistId: uploads, maxResults: nVideos });
  const videoIds = (pl.data.items || []).map((i) => i.contentDetails.videoId);
  if (!videoIds.length) { console.error("no videos yet"); return; }

  const tally = {};
  let comments = 0;
  for (const vid of videoIds) {
    let pageToken;
    do {
      let res;
      try {
        res = await yt.commentThreads.list({
          part: "snippet,replies", videoId: vid, maxResults: 100, order: "time", pageToken,
        });
      } catch (e) { break; }   // comments disabled / not found
      for (const th of res.data.items || []) {
        const texts = [th.snippet.topLevelComment.snippet.textOriginal];
        for (const r of th.replies?.comments || []) texts.push(r.snippet.textOriginal);
        for (const tx of texts) {
          comments++;
          for (const k of weaponsIn(tx)) tally[k] = (tally[k] || 0) + 1;
        }
      }
      pageToken = res.data.nextPageToken;
    } while (pageToken);
  }

  const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((s, [, v]) => s + v, 0);
  console.error(`scanned ${comments} comments across ${videoIds.length} videos · ${total} weapon votes · ${JSON.stringify(tally)}`);

  if (ranked.length >= 2 && total >= minVotes && ranked[0][1] >= 2 && ranked[1][1] >= 2) {
    const [a, b] = [ranked[0][0], ranked[1][0]];
    const out = `a=${pretty(a)}\nb=${pretty(b)}\nvote=1`;
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, out + "\n");
    process.stdout.write(out + "\n");
    console.error(`community pick: ${pretty(a)} vs ${pretty(b)}`);
  } else {
    console.error("no clear community pick — director will use the bracket");
  }
})().catch((e) => { console.error("vote tally failed (non-fatal):", e && e.message || e); });
