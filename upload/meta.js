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

const path = require("path");
const { nextChampion } = require("./streak");
let tournament = null;
try { tournament = require("./tournament"); } catch (e) { /* optional */ }

function readJson(p) { try { return JSON.parse(require("fs").readFileSync(p, "utf8")); } catch (e) { return null; } }

const TITLE_FORMS = [
  (a, b) => `${a} vs ${b} — who wins?`,
  (a, b) => `Can ${a} beat ${b}?`,
  (a, b) => `${a} vs ${b} in a shrinking arena`,
  (a, b) => `${a} or ${b}? Physics decides`,
  (a, b) => `${a} vs ${b} — weapon ball duel`,
];
// used only when the winner is on a hot streak (spoiler-y but punchy)
const STREAK_TITLES = [
  (w, n) => `${w} wins again — ${n} in a row 🔥`,
  (w, n) => `Can anything stop ${w}? (${n} straight)`,
  (w, n) => `${w} is on a ${n}-win streak`,
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

  // --- champion streak (read the PRE-match state, compute where this puts us) ---
  const stateDir = opts.stateDir || path.join(__dirname, "..", "state");
  const prevChamp = readJson(path.join(stateDir, "champion.json"));
  const champ = nextChampion(prevChamp, match);
  const onStreak = champ && champ.streak >= 3 && champ.winner === winner;

  // --- tournament context (this video IS the current bracket match) ---
  const tctx = (opts.tournament !== false && tournament && tournament.currentContext)
    ? tournament.currentContext() : null;
  const inTourney = tctx && (tctx.a === a || tctx.b === b || tctx.a === b || tctx.b === a);

  // --- title ---
  let title;
  if (inTourney) {
    const rn = tctx.isFinal ? "🏆 TOURNAMENT FINAL" : `🏆 ${tctx.roundName}${tctx.matchOf ? " " + tctx.matchOf.replace(" of ", "/") : ""}`;
    title = `${rn}: ${a} vs ${b}`;
  } else if (onStreak && rng() < 0.7) {
    title = pick(rng, STREAK_TITLES)(winner, champ.streak);
  } else {
    title = pick(rng, TITLE_FORMS)(a, b) + (n > 2 ? ` (+${n - 2} more)` : "");
  }
  if (match.mutator) title += ` [${match.mutator}]`;
  title = clampTitle(title);

  // --- ranking leader (once we have enough data) ---
  const rank = readJson(path.join(stateDir, "ranking.json"));
  let leaderLine = "";
  if (rank && (rank.matches || 0) >= 12 && rank.weapons) {
    let bestK = null, bestPct = -1, bestG = 0;
    for (const [k, v] of Object.entries(rank.weapons)) {
      const g = (v.w || 0) + (v.l || 0);
      if (g < 4) continue;
      const pct = (v.w || 0) / g;
      if (pct > bestPct) { bestPct = pct; bestK = k; bestG = g; }
    }
    if (bestK) leaderLine = `Win-rate leader: ${bestK} (${Math.round(bestPct * 100)}% of ${bestG})`;
  }

  const playUrl = opts.playUrl || "https://galymzhan120202-cyber.github.io/weapon-ball-arena/";
  const matchup = n > 2 ? names.join(", ") : `${a} vs ${b}`;
  const modifiers = [
    match.mutator ? `Mutator: ${match.mutator}` : "",
    match.hazard ? `Hazard: ${match.hazard}` : "",
    (match.pickups && match.pickups.length)
      ? `Pickups: ${match.pickups.map((p) => `${p.by} → ${p.buff}`).join(", ")}` : "",
  ].filter(Boolean);
  const spoiler = opts.spoilerFree
    ? ""
    : `\n\nWinner: ${winner}${match.finishText ? ` — ${match.finishText}` : ""}` +
      (match.winnerKills ? `  ·  ${match.winnerKills} KO${match.winnerKills > 1 ? "s" : ""}` : "") +
      (match.winnerHp != null ? `  ·  ${match.winnerHp} HP left` : "") +
      (onStreak ? `\n${winner} is now on a ${champ.streak}-win streak.` : "");

  const tourneyLine = inTourney
    ? `🏆 Tournament #${tctx.id} — ${tctx.isFinal ? "the FINAL" : tctx.roundName + (tctx.matchOf ? " (" + tctx.matchOf + ")" : "")}`
      + (tctx.previousChampion ? `. Defending champ: ${tctx.previousChampion}.` : "")
    : "";

  const description = [
    pick(rng, HOOKS),
    "",
    ...(tourneyLine ? [tourneyLine] : []),
    `Matchup: ${matchup}`,
    `Arena: ${theme}`,
    ...modifiers,
    `Seed: ${seed} (same seed → same fight)`,
    ...(leaderLine ? [leaderLine] : []),
    spoiler,
    "",
    `▶ Play it yourself: ${playUrl}`,
    "",
    inTourney ? "" : "🗳️ Want a specific matchup? Comment two weapon names — top votes fight next.",
    "New fight every day. Subscribe so you don't miss the rematch.",
    "",
    "#shorts #weaponball #physics #simulation #whowins",
  ].join("\n").replace(/\n{3,}/g, "\n\n").trim();

  const tags = clampTags([
    ...BASE_TAGS,
    a.toLowerCase(), b.toLowerCase(),
    `${a} vs ${b}`.toLowerCase(),
    winner !== "—" ? winner.toLowerCase() + " wins" : "",
    theme.toLowerCase(),
    match.mutator ? match.mutator.toLowerCase() : "",
    match.hazard ? match.hazard.toLowerCase() : "",
  ].filter(Boolean));

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
