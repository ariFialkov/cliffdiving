// Judging model and bot-dive synthesis.
//
// Each of three judges scores a dive out of 10. A judge's raw mark is
//   3.0 + 3.6·(1 − e^(−D/1.6)) + 3.2·q
// where D is the sequence difficulty and q ∈ [0,1] is entry quality
// (how vertical the body was, and how well the entry was "locked in").
// Small per-judge noise is added so the three marks differ slightly.

import { TRICK_LIST, TRICKS, sequenceDifficulty, sequenceDuration } from './tricks.js';
import { MAX_SCORE, MIN_SCORE } from './odds.js';

export const JUDGES = ['Anya', 'Bjorn', 'Chikako'];

export const JUDGE_BASE = 3.0;
export const JUDGE_DIFF_WEIGHT = 3.6;
export const JUDGE_DIFF_SCALE = 1.6;
export const JUDGE_ENTRY_WEIGHT = 3.2;
export const JUDGE_NOISE = 0.12;
export const JUDGE_MIN = 0.3;
export const JUDGE_MAX = 9.95;

export function difficultyTerm(D) {
  return JUDGE_DIFF_WEIGHT * (1 - Math.exp(-D / JUDGE_DIFF_SCALE));
}

export function rawJudgeMark(D, q) {
  return JUDGE_BASE + difficultyTerm(D) + JUDGE_ENTRY_WEIGHT * q;
}

function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Entry quality from the entry geometry.
 * angleErrDeg: degrees away from vertical at the moment of impact (0 = perfect).
 * lockDelta: seconds before impact when the player locked in, or null.
 * lockedEarly: true when the lock happened before the lock window opened.
 * headFirst: the head (and arms) entered first.
 */
export const LOCK_WINDOW = 0.5; // seconds before impact in which a lock counts
export const LOCK_SWEET = 0.17; // ideal lock time before impact
export const LOCK_TOLERANCE = 0.33;

// Entry quality weights: straightness, streamline timing, and a bonus for a
// head-first (hands-first) entry, which splashes less than feet-first.
export const ANGLE_WEIGHT = 0.5;
export const TIMING_WEIGHT = 0.38;
export const HEAD_FIRST_BONUS = 0.12;

export function entryQuality({ angleErrDeg, lockDelta, lockedEarly = false, headFirst = false }) {
  const angleQ = clamp(1 - angleErrDeg / 60, 0, 1);
  let timingQ;
  if (lockDelta == null) timingQ = lockedEarly ? 0.35 : 0.25;
  else timingQ = clamp(1 - Math.abs(lockDelta - LOCK_SWEET) / LOCK_TOLERANCE, 0, 1);
  // The head-first bonus scales with straightness: a crooked head-first entry is no rip.
  const hf = headFirst ? HEAD_FIRST_BONUS * angleQ : 0;
  return clamp(ANGLE_WEIGHT * angleQ + TIMING_WEIGHT * timingQ + hf, 0, 1);
}

/**
 * Judge a dive. Returns { marks: [j1, j2, j3], total, D, q }.
 * rand: seeded uniform generator for judge noise.
 */
export function judgeDive({ trickIds, q, rand }) {
  const D = sequenceDifficulty(trickIds);
  const raw = rawJudgeMark(D, q);
  const marks = JUDGES.map(() => {
    const noise = (rand() * 2 - 1) * JUDGE_NOISE;
    return Number(clamp(raw + noise, JUDGE_MIN, JUDGE_MAX).toFixed(2));
  });
  const total = Number(marks.reduce((a, b) => a + b, 0).toFixed(2));
  return { marks, total, D, q };
}

/**
 * Split a target total into three judge marks that sum to it exactly.
 */
export function splitMarks(total, rand) {
  // Work in hundredths to avoid floating-point drift.
  const cents = Math.round(total * 100);
  const per = Math.floor(cents / 3);
  const spread = Math.max(0, Math.min(Math.round(JUDGE_NOISE * 100), per - Math.round(JUDGE_MIN * 100), Math.round(JUDGE_MAX * 100) - per - 2));
  const n1 = Math.round((rand() * 2 - 1) * spread);
  const n2 = Math.round((rand() * 2 - 1) * spread);
  const m1 = per + n1;
  const m2 = per + n2;
  const m3 = cents - m1 - m2;
  return [m1, m2, m3].map((c) => c / 100);
}

/**
 * Build a bot's dive (tricks + entry quality) that is consistent with the
 * score it is destined to post. The score itself is the predetermined
 * value; the tricks and splash are chosen to make it look earned.
 */
export function synthesizeBotDive({ targetTotal, airTime, rand }) {
  const target = clamp(targetTotal, MIN_SCORE, MAX_SCORE);
  const perJudge = target / 3;
  const maxTricks = Math.max(0, Math.floor((airTime - 0.9) / 0.66));

  // Pick a trick count that keeps q inside [0,1], preferring sequences that
  // look proportionate to the score (higher scores → more tricks).
  const candidates = [];
  for (let n = 0; n <= maxTricks; n++) {
    const tries = n === 0 ? 1 : 4;
    for (let t = 0; t < tries; t++) {
      const ids = [];
      for (let i = 0; i < n; i++) ids.push(rand.pick(TRICK_LIST).id);
      if (sequenceDuration(ids) > airTime - 0.9) continue; // leave time to start, settle the spin and streamline
      const D = sequenceDifficulty(ids);
      const q = (perJudge - JUDGE_BASE - difficultyTerm(D)) / JUDGE_ENTRY_WEIGHT;
      candidates.push({ ids, D, q });
    }
  }
  // Prefer candidates whose q is in range; among them pick randomly with a
  // bias toward middling entries so bots do not always nail or flop.
  const inRange = candidates.filter((c) => c.q >= 0 && c.q <= 1);
  let chosen;
  if (inRange.length > 0) {
    chosen = rand.pick(inRange);
  } else {
    // Nothing fits exactly (e.g. an extremely low or high score): take the
    // nearest and clamp q; the visuals will be "belly flop" or "flawless".
    chosen = candidates.reduce((best, c) => {
      const dist = c.q < 0 ? -c.q : c.q - 1;
      const bestDist = best.q < 0 ? -best.q : best.q - 1;
      return dist < bestDist ? c : best;
    }, candidates[0]);
  }
  const q = clamp(chosen.q, 0, 1);
  const marks = splitMarks(target, rand);
  return { trickIds: chosen.ids, q, marks, total: target };
}

export { TRICKS };
