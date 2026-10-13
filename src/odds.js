// Odds spectrum: competitions, payout tables and the RTP solver.
//
// Every competition pays a multiplier per finishing position (1st..4th).
// The probability of each position is derived so that the expected return
// of a round is exactly TARGET_RTP, regardless of which competition is played.
//
// Derivation: p_i ∝ exp(-λ · m_i). λ is found by bisection so that
// Σ p_i · m_i = RTP. Higher multipliers are tilted down proportionally,
// so the whole spectrum balances out to the same RTP.

export const TARGET_RTP = 0.96;

export const COMPETITIONS = [
  {
    id: 'tykes',
    name: 'Little Tykes Diving Tourney',
    short: 'Little Tykes',
    height: 10,
    multipliers: [2.0, 1.5, 0.75, 0],
    airTime: 2.4,
    stakes: [1, 2, 5, 10, 20],
    blurb: 'Where every champion took their first plunge.',
  },
  {
    id: 'bluffs',
    name: 'The Bluffs Amateur Diving Comp.',
    short: 'The Bluffs',
    height: 15,
    multipliers: [3.0, 1.5, 0.5, 0],
    airTime: 2.9,
    stakes: [2, 5, 10, 25, 50],
    blurb: 'Local legends and a slightly scary drop.',
  },
  {
    id: 'olympic',
    name: 'Olympic Superdive Classic',
    short: 'Superdive Classic',
    height: 21,
    multipliers: [5.0, 1.5, 0.5, 0],
    airTime: 3.4,
    stakes: [5, 10, 25, 50, 100],
    blurb: 'The big stage. Crowds, cameras, and serious air.',
  },
  {
    id: 'bluehorse',
    name: 'Blue Horse Cliffdiving World Series',
    short: 'World Series',
    height: 27,
    multipliers: [10.0, 1.5, 0.25, 0],
    airTime: 3.9,
    stakes: [10, 25, 50, 100, 250],
    blurb: 'Twenty-seven metres. Only the brave come back twice.',
  },
];

/**
 * Solve for position probabilities such that Σ p_i·m_i === rtp.
 * p_i ∝ exp(-λ·m_i); λ found by bisection (RTP is monotone decreasing in λ).
 */
export function solveOdds(multipliers, rtp = TARGET_RTP) {
  const probsFor = (lambda) => {
    const w = multipliers.map((m) => Math.exp(-lambda * m));
    const sum = w.reduce((a, b) => a + b, 0);
    return w.map((x) => x / sum);
  };
  const rtpFor = (lambda) =>
    probsFor(lambda).reduce((acc, p, i) => acc + p * multipliers[i], 0);

  const maxM = Math.max(...multipliers);
  const minM = Math.min(...multipliers);
  if (rtp >= maxM || rtp <= minM) {
    throw new Error(`RTP ${rtp} not reachable with multipliers ${multipliers}`);
  }
  // Bracket λ: RTP(λ→-∞) = maxM, RTP(λ→+∞) = minM.
  let lo = -50;
  let hi = 50;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (rtpFor(mid) > rtp) lo = mid;
    else hi = mid;
  }
  const lambda = (lo + hi) / 2;
  return { probabilities: probsFor(lambda), lambda, rtp: rtpFor(lambda) };
}

const oddsCache = new Map();

/** Returns { multipliers, probabilities, rtp } for a competition. */
export function oddsFor(competition) {
  if (!oddsCache.has(competition.id)) {
    const solved = solveOdds(competition.multipliers);
    oddsCache.set(competition.id, {
      multipliers: competition.multipliers,
      probabilities: solved.probabilities,
      rtp: solved.rtp,
    });
  }
  return oddsCache.get(competition.id);
}

/**
 * Draw the player's finishing position (1-based) for a round.
 * `u` is a uniform random number in [0,1).
 */
export function drawPosition(competition, u) {
  const { probabilities } = oddsFor(competition);
  let acc = 0;
  for (let i = 0; i < probabilities.length; i++) {
    acc += probabilities[i];
    if (u < acc) return i + 1;
  }
  return probabilities.length;
}

export const MAX_SCORE = 29.99;
export const MIN_SCORE = 0.3;
export const SCORE_STEP = 0.01;

function roundScore(x) {
  return Math.round(x / SCORE_STEP) * SCORE_STEP;
}

/**
 * Given the player's actual score and the predetermined position, produce
 * the three bot scores that place the player exactly at `position`.
 * `rand()` is a uniform [0,1) generator (seeded so the round is reproducible).
 *
 * Bots whose scores must beat the player get spaced out between the player's
 * score and MAX_SCORE; bots that must lose are spaced between MIN_SCORE and
 * the player's score. Scores are distinct at SCORE_STEP granularity.
 */
export function placeBotScores(playerScore, position, rand, botCount = 3) {
  // Finishing `position`-th means (position - 1) bots beat the player.
  const above = position - 1;
  const below = botCount - above;
  const scores = [];

  const spread = (count, lo, hi) => {
    // Random, strictly increasing cut points inside (lo, hi) with a
    // natural-looking bias: gaps near the player are small, far gaps larger.
    const room = hi - lo;
    const gaps = [];
    let total = 0;
    for (let i = 0; i < count; i++) {
      const g = 0.4 + rand() * (0.5 + i * 0.9);
      gaps.push(g);
      total += g;
    }
    // Scale gaps so they fit comfortably in the room (use at most ~70% of it
    // when there is plenty of space, or everything when space is tight).
    const budget = Math.min(room * 0.98, Math.max(total, room * 0.35));
    const scale = budget / total;
    const out = [];
    let acc = 0;
    for (let i = 0; i < count; i++) {
      acc += gaps[i] * scale;
      out.push(acc);
    }
    return out;
  };

  // Bots above the player.
  if (above > 0) {
    const hi = MAX_SCORE;
    const lo = playerScore;
    const minRoom = above * SCORE_STEP;
    if (hi - lo < minRoom) {
      throw new Error('Player score too high to place bots above it');
    }
    const offs = spread(above, lo, hi);
    let prev = lo;
    for (let i = 0; i < above; i++) {
      let s = roundScore(lo + offs[i]);
      // Enforce strict ordering and the cap.
      const remaining = above - i - 1;
      s = Math.min(s, roundScore(hi - remaining * SCORE_STEP));
      s = Math.max(s, roundScore(prev + SCORE_STEP));
      scores.push(s);
      prev = s;
    }
  }
  // Bots below the player.
  if (below > 0) {
    const hi = playerScore;
    const lo = MIN_SCORE;
    const minRoom = below * SCORE_STEP;
    if (hi - lo < minRoom) {
      throw new Error('Player score too low to place bots below it');
    }
    const offs = spread(below, lo, hi);
    let prev = hi;
    for (let i = 0; i < below; i++) {
      let s = roundScore(hi - offs[i]);
      const remaining = below - i - 1;
      s = Math.max(s, roundScore(lo + remaining * SCORE_STEP));
      s = Math.min(s, roundScore(prev - SCORE_STEP));
      scores.push(s);
      prev = s;
    }
  }
  // Shuffle so the bot dive order doesn't reveal the outcome.
  for (let i = scores.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [scores[i], scores[j]] = [scores[j], scores[i]];
  }
  return scores.map((s) => Number(s.toFixed(2)));
}

/** Final standings given all scores. Returns array of {id, score, rank}. */
export function rankScores(entries) {
  const sorted = [...entries].sort((a, b) => b.score - a.score);
  return sorted.map((e, i) => ({ ...e, rank: i + 1 }));
}
