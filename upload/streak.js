"use strict";
/* =====================================================================
   Champion-streak logic, shared by meta.js (framing the video) and
   record-result.js (persisting state/champion.json). A win by the same
   weapon KIND extends the streak; anything else resets it to 1.
   ===================================================================== */

function nextChampion(prev, match) {
  const kind = match.winnerKind || null;
  const name = match.winner || null;
  if (!kind || !name) return prev || null;
  const streak = (prev && prev.kind === kind) ? (prev.streak || 1) + 1 : 1;
  return {
    winner: name,
    kind,
    streak,
    lastSeed: (match.seed >>> 0) || null,
    updated: new Date().toISOString(),
  };
}

module.exports = { nextChampion };
