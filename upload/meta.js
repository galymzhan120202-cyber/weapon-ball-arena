"use strict";
/* =====================================================================
   Weapon Ball Arena — YouTube metadata templates
   ---------------------------------------------------------------------
   Turns a match's <seed>.json (written by record/record.js) into a
   title / description / tags block for youtube.videos.insert.
   Pure + deterministic from the seed so a re-run reproduces it.
   ===================================================================== */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

const TITLE_FORMS = [
  (a, b) => `${a} vs ${b} — who wins?`,
  (a, b) => `Can ${a} beat ${b}?`,
  (a, b) => `${a} vs ${b} in a shrinking arena`,
  (a, b) => `${a} or ${b}? Physics decides`,
  (a, b) => `${a} vs ${b} — weapon ball duel`,
];
const HOOKS = [
  "Two weapon-balls, one shrinking arena, last one alive wins.",
  "Fully simulated — no scripting, the physics picks the winner.",
  "Every hit, bounce and parry is deterministic from the seed.",
  "The arena keeps closing in. Nowhere to hide.",
];

const BASE_TAGS = [
  "weapon ball", "weapon ball arena", "physics battle", "who wins",
  "satisfying", "simulation", "1v1 fight", "arena battle", "marble battle",
  "physics simulation", "shorts", "weapon fight",
];

// YouTube hard limits: title <=100 chars, description <=5000, tags <=500 chars total.
function clampTitle(s) { return s.length <= 100 ? s : s.slice(0, 97) + "..."; }
function clampTags(tags) {
  const out = []; let total = 0;
  for (const t of tags) {
    const add = (out.length ? 1 : 0) + t.length;
    if (total + add > 480) break;
    out.push(t); total += add;
  }
  return out;
}

function buildMeta(match, opts = {}) {
  const seed = match.seed >>> 0;
  const rng = mulberry32(hashStr(seed + "meta"));
  const names = (match.fighters || []).map((f) => f.name);
  const a = names[0] || "Weapon A";
  const b = names[1] || "Weapon B";
  const winner = match.winner || "—";
  const theme = match.theme || "the arena";
  const n = match.n || names.length;

  const title = clampTitle(pick(rng, TITLE_FORMS)(a, b) + (n > 2 ? ` (+${n - 2} more)` : ""));

  const playUrl = opts.playUrl || "https://galymzhan120202-cyber.github.io/weapon-ball-arena/";
  const matchup = n > 2 ? names.join(", ") : `${a} vs ${b}`;
  const spoiler = opts.spoilerFree
    ? ""
    : `\n\nWinner: ${winner}${match.finishText ? ` — ${match.finishText}` : ""}`;

  const description = [
    pick(rng, HOOKS),
    "",
    `Matchup: ${matchup}`,
    `Arena: ${theme}`,
    `Seed: ${seed} (same seed → same fight)`,
    spoiler,
    "",
    `▶ Play it yourself: ${playUrl}`,
    "",
    "New fight every day. Subscribe so you don't miss the rematch.",
    "",
    "#shorts #weaponball #physics #simulation #whowins",
  ].join("\n").replace(/\n{3,}/g, "\n\n").trim();

  const tags = clampTags([
    ...BASE_TAGS,
    a.toLowerCase(), b.toLowerCase(),
    `${a} vs ${b}`.toLowerCase(),
    winner.toLowerCase() + " wins",
    theme.toLowerCase(),
  ]);

  return {
    title,
    description,
    tags,
    categoryId: "20",                       // Gaming
    privacyStatus: opts.privacyStatus || "public",
    madeForKids: false,
  };
}

module.exports = { buildMeta };

// quick CLI check:  node meta.js path/to/wba_42.json
if (require.main === module) {
  const fs = require("fs");
  const p = process.argv[2];
  if (!p) { console.log("usage: node meta.js <match.json>"); process.exit(1); }
  const m = buildMeta(JSON.parse(fs.readFileSync(p, "utf8")));
  console.log(JSON.stringify(m, null, 2));
}
