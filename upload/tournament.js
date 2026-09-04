#!/usr/bin/env node
"use strict";
/* =====================================================================
   Weapon Ball Arena — running tournament bracket (fully automatic)
   ---------------------------------------------------------------------
   state/tournament.json holds one single-elimination bracket. Every
   director run plays the next unplayed match; when a round fills, the
   next round is seeded; when the final resolves, a fresh tournament
   auto-starts. No human input, ever.

   CLI:
     node tournament.js next            -> prints  SEED / A / B / LABEL  (GITHUB_OUTPUT style)
     node tournament.js record <match.json>
   ===================================================================== */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const STATE = path.join(ROOT, "state");
const FILE = path.join(STATE, "tournament.json");

// weapon KINDS that exist in index.html's ROSTER (kept in sync by hand)
const ROSTER = [
  "sword", "katana", "axe", "hammer", "warhammer", "spear", "trident", "dagger",
  "kunai", "mace", "flail", "nunchaku", "whip", "claws", "scythe", "chainsaw",
  "staff", "shuriken", "rapier", "halberd", "cleaver", "boomerang", "war_axe",
  "tomahawk", "dual_daggers", "pistol",
];
const PRETTY = {
  war_axe: "War Axe", dual_daggers: "Dual Daggers",
};
const pretty = (k) => PRETTY[k] || k.replace(/(^|_)(\w)/g, (_, s, c) => (s ? " " : "") + c.toUpperCase());

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < String(s).length; i++) { h ^= String(s).charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

const SIZE = 8;                      // bracket size (4 QF -> 2 SF -> 1 F)
const ROUND_NAME = { 8: "Quarterfinal", 4: "Semifinal", 2: "FINAL" };

function readState() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch (e) { return null; }
}
function writeState(s) {
  fs.mkdirSync(STATE, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(s, null, 2) + "\n");
}

function newTournament(prevId) {
  const n = (prevId || 0) + 1;
  const rng = mulberry32(hashStr("wba-tourney-" + n));
  const pool = ROSTER.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const entrants = pool.slice(0, SIZE);
  return {
    n, id: n, size: SIZE,
    entrants,
    round: SIZE,                       // matches in this round = round/2; label from ROUND_NAME[round]
    matchIndex: 0,
    bracket: pairsFrom(entrants),
    history: [],
    champion: null,
    started: new Date().toISOString(),
  };
}
function pairsFrom(list) {
  const out = [];
  for (let i = 0; i < list.length; i += 2) out.push({ a: list[i], b: list[i + 1], winner: null, seed: null, video: null });
  return out;
}

function seedFor(s) {
  return hashStr(`t${s.id}-r${s.round}-m${s.matchIndex}`) >>> 0;
}

function ensureState() {
  let s = readState();
  if (!s || !s.bracket) s = newTournament(s && s.id);
  return s;
}

function cmdNext() {
  const s = ensureState();
  writeState(s);                       // persist so the bracket is stable + meta.js can read it
  const m = s.bracket[s.matchIndex];
  const seed = seedFor(s);
  const label = `${ROUND_NAME[s.round] || "Round"}${s.round > 2 ? " " + (s.matchIndex + 1) + "/" + (s.round / 2) : ""} · Tournament #${s.id}`;
  const out = [
    `seed=${seed}`,
    `a=${pretty(m.a)}`,
    `b=${pretty(m.b)}`,
    `label=${label}`,
  ].join("\n");
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, out + "\n");
  process.stdout.write(out + "\n");
}

function cmdRecord(jsonPath) {
  const match = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const s = ensureState();
  const m = s.bracket[s.matchIndex];

  // map the winner NAME back to a roster kind
  const wk = (match.winnerKind || "").toLowerCase();
  let winner = wk === m.a ? m.a : wk === m.b ? m.b : null;
  if (!winner) {
    // fall back: first fighter that is a bracket entrant
    winner = (match.fighters || []).map((f) => (f.kind || "").toLowerCase()).find((k) => k === m.a || k === m.b) || m.a;
  }
  m.winner = winner;
  m.seed = match.seed >>> 0;
  m.video = match.videoUrl || null;

  s.matchIndex++;
  if (s.matchIndex >= s.bracket.length) {
    // round complete
    const winners = s.bracket.map((x) => x.winner);
    s.history.push({ round: s.round, matches: s.bracket });
    if (winners.length === 1) {
      s.champion = winners[0];
      s.finished = new Date().toISOString();
      writeState(s);
      // start the next tournament so `next` always has a match ready
      const nx = newTournament(s.id);
      nx.previousChampion = s.champion;
      writeState(nx);
      console.log(`🏆 Tournament #${s.id} won by ${pretty(s.champion)}. Tournament #${nx.id} seeded.`);
      return;
    }
    s.round = winners.length;
    s.matchIndex = 0;
    s.bracket = pairsFrom(winners);
  }
  writeState(s);
  console.log(`recorded ${pretty(m.a)} vs ${pretty(m.b)} -> ${pretty(m.winner)}  ·  next: match ${s.matchIndex + 1}/${s.bracket.length} of ${ROUND_NAME[s.round] || "round"}`);
}

// -------- read helper for meta.js --------
function currentContext() {
  const s = readState();
  if (!s || !s.bracket) return null;
  const m = s.bracket[s.matchIndex];
  return {
    id: s.id,
    roundName: ROUND_NAME[s.round] || "Round",
    isFinal: s.round === 2,
    matchOf: s.round > 2 ? `${s.matchIndex + 1} of ${s.round / 2}` : null,
    a: pretty(m.a), b: pretty(m.b),
    previousChampion: s.previousChampion ? pretty(s.previousChampion) : null,
  };
}

module.exports = { currentContext, pretty };

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === "next") cmdNext();
  else if (cmd === "record") {
    if (!process.argv[3]) { console.error("usage: node tournament.js record <match.json>"); process.exit(1); }
    cmdRecord(process.argv[3]);
  } else {
    console.error("usage: node tournament.js next | record <match.json>");
    process.exit(1);
  }
}
