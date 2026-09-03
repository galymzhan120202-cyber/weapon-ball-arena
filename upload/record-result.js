#!/usr/bin/env node
"use strict";
/* =====================================================================
   Weapon Ball Arena — persist a finished match into state/
   ---------------------------------------------------------------------
   Run by .github/workflows/director.yml AFTER a real upload. Updates:
     state/champion.json   { winner, kind, streak, lastSeed, updated }
     state/ranking.json    { weapons: {kind: {w,l}}, matches, updated }
   The workflow then commits state/ back to the repo.

   Usage:  node record-result.js <match.json> [videoUrl]
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const { nextChampion } = require("./streak");

const ROOT = path.resolve(__dirname, "..");
const STATE = path.join(ROOT, "state");

const p = process.argv[2];
if (!p) { console.error("usage: node record-result.js <match.json> [videoUrl]"); process.exit(1); }
const match = JSON.parse(fs.readFileSync(p, "utf8"));
const videoUrl = process.argv[3] || match.videoUrl || null;
fs.mkdirSync(STATE, { recursive: true });

// ---- champion streak ----
const champFile = path.join(STATE, "champion.json");
let prev = null;
try { prev = JSON.parse(fs.readFileSync(champFile, "utf8")); } catch (e) {}
const champ = nextChampion(prev, match);
if (champ) {
  if (videoUrl) champ.lastVideo = videoUrl;
  fs.writeFileSync(champFile, JSON.stringify(champ, null, 2) + "\n");
}

// ---- weapon win/loss ledger ----
const rankFile = path.join(STATE, "ranking.json");
let rank = { weapons: {}, matches: 0, updated: null };
try { rank = JSON.parse(fs.readFileSync(rankFile, "utf8")); } catch (e) {}
rank.weapons = rank.weapons || {};
for (const f of match.fighters || []) {
  const k = f.kind;
  if (!k) continue;
  rank.weapons[k] = rank.weapons[k] || { w: 0, l: 0 };
  if (f.isWinner) rank.weapons[k].w++;
  else rank.weapons[k].l++;
}
rank.matches = (rank.matches || 0) + 1;
rank.updated = new Date().toISOString();
fs.writeFileSync(rankFile, JSON.stringify(rank, null, 2) + "\n");

console.log(`champion: ${champ ? champ.winner + " x" + champ.streak : "—"}  ·  total matches: ${rank.matches}`);
