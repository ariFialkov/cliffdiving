import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPETITIONS, TARGET_RTP, oddsFor, drawPosition, placeBotScores, rankScores, MAX_SCORE, MIN_SCORE } from '../src/odds.js';
import { mulberry32 } from '../src/rng.js';

test('every competition returns exactly the target RTP', () => {
  for (const c of COMPETITIONS) {
    const o = oddsFor(c);
    const rtp = o.probabilities.reduce((acc, p, i) => acc + p * o.multipliers[i], 0);
    assert.ok(Math.abs(rtp - TARGET_RTP) < 1e-9, `${c.id} rtp=${rtp}`);
    const sum = o.probabilities.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9);
    for (const p of o.probabilities) assert.ok(p > 0 && p < 1);
  }
});

test('higher multipliers are less likely within a competition', () => {
  for (const c of COMPETITIONS) {
    const o = oddsFor(c);
    for (let i = 1; i < o.probabilities.length; i++) {
      assert.ok(o.probabilities[i] >= o.probabilities[i - 1]);
    }
  }
});

test('top prize probability decreases with competition tier', () => {
  const p1 = COMPETITIONS.map((c) => oddsFor(c).probabilities[0]);
  for (let i = 1; i < p1.length; i++) assert.ok(p1[i] < p1[i - 1]);
});

test('drawPosition empirically matches the odds (seeded)', () => {
  const rand = mulberry32(12345);
  for (const c of COMPETITIONS) {
    const counts = [0, 0, 0, 0];
    const N = 200000;
    for (let i = 0; i < N; i++) counts[drawPosition(c, rand()) - 1] += 1;
    const o = oddsFor(c);
    for (let i = 0; i < 4; i++) {
      assert.ok(Math.abs(counts[i] / N - o.probabilities[i]) < 0.006, `${c.id} pos ${i + 1}`);
    }
  }
});

test('placeBotScores always puts the player at the predetermined position', () => {
  const rand = mulberry32(777);
  for (let trial = 0; trial < 20000; trial++) {
    const position = 1 + Math.floor(rand() * 4);
    const playerScore = Number((MIN_SCORE + 0.05 + rand() * (MAX_SCORE - MIN_SCORE - 0.1)).toFixed(2));
    const bots = placeBotScores(playerScore, position, rand);
    assert.equal(bots.length, 3);
    for (const b of bots) {
      assert.ok(b >= MIN_SCORE && b <= MAX_SCORE, `bot score ${b} out of range`);
      assert.notEqual(b, playerScore);
    }
    assert.equal(new Set(bots).size, 3, 'bot scores must be distinct');
    const ranked = rankScores([{ id: 'p', score: playerScore }, ...bots.map((s, i) => ({ id: `b${i}`, score: s }))]);
    assert.equal(ranked.find((e) => e.id === 'p').rank, position, `score ${playerScore} pos ${position} bots ${bots}`);
  }
});

test('placeBotScores handles extreme player scores', () => {
  const rand = mulberry32(3);
  for (const score of [0.4, 29.85, 29.9, 0.35]) {
    for (const position of [1, 2, 3, 4]) {
      const bots = placeBotScores(score, position, rand);
      const ranked = rankScores([{ id: 'p', score }, ...bots.map((s, i) => ({ id: `b${i}`, score: s }))]);
      assert.equal(ranked.find((e) => e.id === 'p').rank, position);
    }
  }
});
