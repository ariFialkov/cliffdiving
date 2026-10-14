// Round orchestration: the state machine that ties the deterministic
// outcome to what the player sees.

import { COMPETITIONS, drawPosition, oddsFor, placeBotScores, rankScores } from './odds.js';
import { mulberry32, secureSeed, seedToId } from './rng.js';
import { TRICKS, sequenceDifficulty } from './tricks.js';
import { entryQuality, judgeDive, synthesizeBotDive, LOCK_WINDOW, LOCK_SWEET } from './scoring.js';
import { Diver, World, makeBotPlan, entryTilt, START_X } from './world.js';
import { HAIR_STYLES, PLAYER_HAIR } from './rig.js';

const BOT_POOL = [
  { name: 'Marco', color: '#2f80ed' },
  { name: 'Jules', color: '#f2994a' },
  { name: 'Kaia', color: '#9b51e0' },
  { name: 'Tomas', color: '#27ae60' },
  { name: 'Nikolai', color: '#1abc9c' },
  { name: 'Priya', color: '#f2c94c' },
  { name: 'Sven', color: '#56ccf2' },
  { name: 'Ayo', color: '#bb6bd9' },
];

const PLAYER_COLOR = '#e03e3e';
const EDGE_X = START_X;
const QUEUE_X = [-2.3, -3.7, -5.1];
const DIVE_CLOCK = 10;
const START_BALANCE = 1000;
const STORAGE_KEY = 'cliffdiving.balance';
const TUTORIAL_KEY = 'cliffdiving.tutorialSeen';

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export class Game {
  constructor({ renderer, ui, input }) {
    this.renderer = renderer;
    this.ui = ui;
    this.input = input;
    this.world = new World();
    this.state = 'lobby';
    this.timers = [];
    this.session = {
      balance: this.loadBalance(),
      unlocked: 1, // number of competitions unlocked (resets on reload by design)
      compIndex: 0,
      stake: COMPETITIONS[0].stakes[0],
    };
    this.round = null;
    this.cameraHold = null;
    this.ui.on('dive', () => this.startRound());
    this.ui.on('selectComp', (i) => this.selectComp(i));
    this.ui.on('selectStake', (s) => this.selectStake(s));
    this.ui.on('stakeStep', (dir) => this.stepStake(dir));
    this.ui.on('again', () => {
      this.ui.hideResults();
      this.startRound();
    });
    this.ui.on('lobby', () => {
      this.ui.hideResults();
      this.enterLobby();
    });
    this.ui.on('topup', () => {
      this.session.balance = START_BALANCE;
      this.saveBalance();
      this.ui.toast('Credits topped up to 1,000');
      this.refreshLobby();
    });
    this.ui.on('tutorialClosed', () => {
      try {
        localStorage.setItem(TUTORIAL_KEY, '1');
      } catch {
        /* ignore */
      }
    });
    this.input.handlers.onTap = () => this.onTap();
    this.input.handlers.onSwipe = (r) => this.onSwipe(r);
    this.input.handlers.onPressStart = (src) => this.onPressStart(src);
    this.input.handlers.onPressEnd = (src) => this.onPressEnd(src);
    this.input.handlers.onHoldStart = () => this.onHold(true);
    this.input.handlers.onHoldEnd = () => this.onHold(false);
  }

  // ---- persistence ----------------------------------------------------------
  loadBalance() {
    try {
      const v = Number(localStorage.getItem(STORAGE_KEY));
      if (Number.isFinite(v) && v > 0) return v;
    } catch {
      /* ignore */
    }
    return START_BALANCE;
  }

  saveBalance() {
    try {
      localStorage.setItem(STORAGE_KEY, String(this.session.balance));
    } catch {
      /* ignore */
    }
  }

  // ---- timers ---------------------------------------------------------------
  after(seconds, fn) {
    const id = setTimeout(() => {
      this.timers = this.timers.filter((t) => t !== id);
      fn();
    }, seconds * 1000);
    this.timers.push(id);
    return id;
  }

  clearTimers() {
    for (const id of this.timers) clearTimeout(id);
    this.timers = [];
  }

  // ---- lobby ----------------------------------------------------------------
  boot() {
    this.ui.setBalance(this.session.balance);
    this.enterLobby();
    let seen = false;
    try {
      seen = localStorage.getItem(TUTORIAL_KEY) === '1';
    } catch {
      /* ignore */
    }
    if (!seen) this.ui.showTutorial();
  }

  get comp() {
    return COMPETITIONS[this.session.compIndex];
  }

  enterLobby() {
    this.clearTimers();
    this.cameraHold = null;
    this.state = 'lobby';
    this.input.swipeEnabled = false;
    this.ui.hideJudges();
    this.ui.setPrompt(null);
    this.ui.setClock(null);
    this.ui.setLockMeter(null);
    this.ui.clearFeed();
    this.ui.renderLeaderboard([], { show: false });
    this.setupScene();
    this.refreshLobby();
  }

  refreshLobby() {
    const s = this.session;
    this.ui.renderLobby({ unlocked: s.unlocked, selected: s.compIndex, stake: s.stake, balance: s.balance });
    this.ui.setCompPill(this.comp);
    this.ui.setBalance(s.balance);
  }

  selectComp(i) {
    if (i >= this.session.unlocked) return;
    this.session.compIndex = i;
    const c = this.comp;
    if (!c.stakes.includes(this.session.stake)) this.session.stake = c.stakes[0];
    this.setupScene();
    this.refreshLobby();
  }

  selectStake(s) {
    this.session.stake = s;
    this.refreshLobby();
  }

  stepStake(dir) {
    const stakes = this.comp.stakes;
    const i = stakes.indexOf(this.session.stake);
    const next = clamp((i === -1 ? 0 : i) + dir, 0, stakes.length - 1);
    this.session.stake = stakes[next];
    this.refreshLobby();
  }

  /** Place the player at the edge with three bots queued behind. */
  setupScene() {
    const w = this.world;
    w.setCompetition(this.comp);
    w.divers = [];
    w.splashes = [];
    const player = new Diver({ id: 'player', name: 'You', color: PLAYER_COLOR, isPlayer: true, x: EDGE_X, hairStyle: PLAYER_HAIR });
    player.setState('ready');
    w.divers.push(player);
    // Preview bots (replaced with the round's bots when a round starts).
    const picks = this.round?.bots ?? this.pickBots(Math.random);
    picks.forEach((b, i) => {
      const d = new Diver({ id: `bot${i}`, name: b.name, color: b.color, x: QUEUE_X[i], hairStyle: b.hairStyle, idleStyle: b.idleStyle });
      d.setState('idle');
      w.divers.push(d);
    });
    this.player = player;
    this.bots = w.divers.slice(1);
    this.frameTop(true);
  }

  /** Aim the camera so the cliff top (and the nervous diver on it) sits in clear view. */
  frameTop(snap = false) {
    const r = this.renderer;
    const ppm = r.camera.ppm;
    let topY = r.h * 0.52;
    if (this.state === 'lobby') {
      const rect = this.ui.el.lobby.getBoundingClientRect();
      const isSheet = rect.width >= r.w - 2 && rect.top > 0;
      if (isSheet) topY = rect.top - 0.3 * ppm;
    }
    topY = Math.max(topY, 120 + 2.0 * ppm);
    const camY = (r.h / 2 - topY) / ppm;
    const camX = r.w >= 900 ? 1.6 : 0.9;
    r.camera.follow(camX, camY, snap);
  }

  pickBots(rand) {
    const pool = [...BOT_POOL];
    const styles = Object.keys(HAIR_STYLES).filter((k) => k !== 'bald' && k !== PLAYER_HAIR);
    const idles = ['stand', 'hipsHands', 'crossed', 'stretch'];
    const out = [];
    for (let i = 0; i < 3; i++) {
      const idx = Math.floor(rand() * pool.length);
      const b = { ...pool.splice(idx, 1)[0] };
      // Bots change their look every round; the player's never changes.
      b.hairStyle = rand() < 0.08 ? 'bald' : styles[Math.floor(rand() * styles.length)];
      b.idleStyle = idles[Math.floor(rand() * idles.length)];
      out.push(b);
    }
    return out;
  }

  // ---- round ----------------------------------------------------------------
  startRound() {
    const s = this.session;
    const comp = this.comp;
    if (s.stake > s.balance) return;
    s.balance -= s.stake;
    this.saveBalance();
    this.ui.setBalance(s.balance);
    this.ui.hideLobby();
    this.ui.hideResults();

    // The outcome is decided here, before anything happens on screen.
    const seed = secureSeed();
    const rand = mulberry32(seed);
    const position = drawPosition(comp, rand());
    const picks = this.pickBots(rand);
    this.round = {
      seed,
      id: seedToId(seed),
      rand,
      comp,
      stake: s.stake,
      position,
      bots: picks,
      botScores: null,
      botIndex: 0,
      entries: [],
    };
    this.world.rand = rand;
    this.setupScene();
    this.round.entries = [
      { id: 'player', name: 'You', color: PLAYER_COLOR, isPlayer: true, score: null, marks: null, active: true },
      ...this.bots.map((b) => ({ id: b.id, name: b.name, color: b.color, isPlayer: false, score: null, marks: null, active: false })),
    ];
    for (const d of this.world.divers) d.onEvent = (type, data, diver) => this.onDiverEvent(type, data, diver);

    this.state = 'ready';
    this.input.swipeEnabled = false;
    this.clockLeft = DIVE_CLOCK;
    this.ui.setPrompt('Hold to charge · release to dive', 'pulse');
    this.ui.setChargeMeter(null);
    this.input.resetGestures();
    this.ui.setClock(1, DIVE_CLOCK);
    this.ui.renderLeaderboard(this.round.entries);
    this.ui.clearFeed();
    this.frameTop();
  }

  // ---- player input ---------------------------------------------------------
  onPressStart(src) {
    if (this.state === 'ready') {
      if (this.player.startCharge()) {
        this.state = 'charging';
        this.ui.setPrompt('Release to jump!', 'soft');
        this.ui.setChargeMeter(0);
      }
    } else if (this.state === 'playerAir' && src === 'key') {
      this.tryLock();
    }
  }

  onPressEnd() {
    if (this.state === 'charging') this.releaseJump();
  }

  onTap() {
    if (this.state === 'playerAir') this.tryLock();
  }

  tryLock() {
    if (this.player.state !== 'airborne' || this.player.airT < 0.25) return;
    if (!this.player.lock()) return;
    const d = this.player.lockDelta;
    if (this.player.lockedEarly) this.ui.feed('Locked too early', 'warn');
    else {
      const err = Math.abs(d - LOCK_SWEET);
      const label = err < 0.07 ? 'Perfect lock!' : err < 0.16 ? 'Good lock' : d > LOCK_SWEET ? 'Early lock' : 'Late lock';
      this.ui.feed(label, err < 0.07 ? 'great' : err < 0.16 ? 'good' : 'warn');
    }
    this.input.swipeEnabled = false;
    this.ui.setLockMeter(null);
  }

  onHold(on) {
    const p = this.player;
    if (!p) return;
    if (!on) {
      p.holding = false;
      return;
    }
    if (this.state !== 'playerAir' || p.state !== 'airborne') return;
    p.holding = true;
    if (!this.holdHintShown) {
      this.holdHintShown = true;
      this.ui.feed('Rotating… let go when you\'re lined up', 'hint');
    }
  }

  onSwipe(r) {
    if (this.state !== 'playerAir' || !r?.trick) return;
    const p = this.player;
    const timeLeft = p.state === 'airborne' ? p.impactT - p.airT : this.world.airTimeFor(p.jumpCharge);
    const busy = p.current ? p.current.T - p.current.t : 0;
    const power = r.power ?? 1;
    const status = p.queueTrick(r.trick, power);
    if (!status) return;
    const pct = `${Math.round(power * 100)}%`;
    if (status === 'combo') {
      const combo = p.current?.trick ?? TRICKS[p.queue[0]?.id];
      const left = p.current ? p.current.T - p.current.t : combo.duration;
      const fits = timeLeft >= left + 0.05;
      this.ui.feed(`COMBO! ${combo.name}  +${combo.difficulty.toFixed(1)}${fits ? '' : '  (too late!)'}`, fits ? 'great' : 'warn');
      return;
    }
    const trick = TRICKS[r.trick];
    const fits = timeLeft - busy >= trick.duration + 0.05;
    const flips = trick.flip !== 0 && r.dirs?.[0] !== 'key';
    this.ui.feed(`${trick.name}  +${trick.difficulty.toFixed(1)}${flips ? `  · ${pct}` : ''}${fits ? '' : '  (too late!)'}`, fits ? 'trick' : 'warn');
  }

  releaseJump() {
    this.player.release();
    this.state = 'playerAir';
    this.ui.setPrompt(null);
    this.ui.setClock(null);
    this.ui.setChargeMeter(null);
    this.input.swipeEnabled = true;
    const c = this.player.charge;
    if (c >= 0.97) this.ui.feed('Full power!', 'great');
    this.ui.feed('Swipe: trick · Hold: rotate · Tap: streamline', 'hint');
  }

  onDiverEvent(type, data, diver) {
    if (type === 'impact') this.onImpact(diver, data);
    if (type === 'arrived' && !diver.isPlayer) this.onBotArrived(diver);
  }

  onImpact(diver, data) {
    const r = this.round;
    if (!r) return;
    this.cameraHold = { x: diver.x + 0.6, y: this.world.height - 1.2 };
    let judged;
    if (diver.isPlayer) {
      const q = entryQuality({ angleErrDeg: data.angleErrDeg, lockDelta: data.lockDelta, lockedEarly: data.lockedEarly, headFirst: data.headFirst });
      judged = judgeDive({ trickIds: data.completed, q, rand: r.rand });
      diver.result = judged;
      this.world.addSplash(diver.x, 1 - q);
      this.renderer.camera.shake = 0.3 + (1 - q) * 0.8;
      this.input.swipeEnabled = false;
      this.ui.setLockMeter(null);
      this.state = 'playerScore';
      const err = data.angleErrDeg;
      // Which way were we off? Measured from the nearest vertical line, forward = over-rotated.
      const off = ((diver.angle % 180) + 180) % 180;
      const way = off < 90 ? 'over-rotated' : 'under-rotated';
      if (data.midTrick) this.ui.feed('Hit the water mid-trick!', 'warn');
      else if (data.headFirst && err < 8) this.ui.feed('Rip entry! Head-first', 'great');
      else if (err < 8) this.ui.feed('Clean entry!', 'great');
      else if (err >= 25) this.ui.feed(`Big splash… ${Math.round(err)}° ${way}`, 'warn');
      else this.ui.feed(`${Math.round(err)}° ${way}`, 'good');
      this.after(0.9, () => this.ui.showJudges('Your dive', judged.marks, judged.total));
      this.after(2.8, () => {
        this.ui.hideJudges();
        this.cameraHold = null;
        this.setScore('player', judged.total, judged.marks);
        this.prepareBots(judged.total);
        this.after(0.6, () => this.nextBot());
      });
    } else {
      const plan = diver.plan;
      this.world.addSplash(diver.x, 1 - plan.q);
      this.renderer.camera.shake = 0.2 + (1 - plan.q) * 0.6;
      const marks = diver.botDive.marks;
      const total = diver.botDive.total;
      this.after(0.9, () => this.ui.showJudges(`${diver.name}'s dive`, marks, total));
      this.after(2.6, () => {
        this.ui.hideJudges();
        this.cameraHold = null;
        this.setScore(diver.id, total, marks);
        r.botIndex += 1;
        this.after(0.5, () => this.nextBot());
      });
    }
  }

  setScore(id, score, marks) {
    const e = this.round.entries.find((x) => x.id === id);
    e.score = score;
    e.marks = marks;
    e.active = false;
    this.ui.renderLeaderboard(this.round.entries);
  }

  /** Decide the bots' scores from the predetermined position and build their dives. */
  prepareBots(playerScore) {
    const r = this.round;
    const scores = placeBotScores(playerScore, r.position, r.rand);
    r.botScores = scores;
    this.bots.forEach((bot, i) => {
      // Each bot commits to its own jump power, which sets how much air time it has.
      bot.jumpChargeTarget = Math.min(1, 0.15 + r.rand() * r.rand() * 1.1 + r.rand() * 0.25);
      const airTime = this.world.airTimeFor(bot.jumpChargeTarget);
      const dive = synthesizeBotDive({ targetTotal: scores[i], airTime, rand: r.rand });
      bot.botDive = dive;
      bot.plan = makeBotPlan({ trickIds: dive.trickIds, q: dive.q, rand: r.rand, airTime });
      bot.hesitation = r.rand.range(0.7, 2.2);
      bot.balk = r.rand.chance(0.22);
    });
  }

  nextBot() {
    const r = this.round;
    if (r.botIndex >= this.bots.length) {
      this.finishRound();
      return;
    }
    this.state = 'botTurn';
    const bot = this.bots[r.botIndex];
    const entry = r.entries.find((e) => e.id === bot.id);
    entry.active = true;
    this.ui.renderLeaderboard(r.entries);
    this.ui.setPrompt(`${bot.name} is up`, 'soft');
    this.frameTop();
    // Shuffle the remaining queue forward.
    this.bots.slice(r.botIndex + 1).forEach((b, i) => {
      b.walkTarget = QUEUE_X[i];
      b.setState('walking');
    });
    bot.walkTarget = EDGE_X;
    bot.setState('walking');
  }

  onBotArrived(bot) {
    if (bot.walkTarget != null) return;
    if (this.state !== 'botTurn' || this.bots[this.round.botIndex] !== bot) {
      bot.setState('idle');
      return;
    }
    if (Math.abs(bot.x - EDGE_X) > 0.05) {
      bot.setState('idle');
      return;
    }
    bot.setState('hesitate');
    const go = () => {
      bot.startCharge(bot.jumpChargeTarget);
      this.ui.setPrompt(null);
    };
    if (bot.balk) {
      // Step back nervously, then commit.
      this.after(bot.hesitation * 0.6, () => {
        bot.walkTarget = EDGE_X - 0.6;
        bot.balk = false;
        bot.setState('walking');
        this.after(1.0, () => {
          bot.walkTarget = EDGE_X;
          bot.setState('walking');
          this.after(0.9, () => {
            bot.setState('hesitate');
            this.after(0.5, go);
          });
        });
      });
    } else {
      this.after(bot.hesitation, go);
    }
  }

  finishRound() {
    const r = this.round;
    const s = this.session;
    this.state = 'results';
    this.ui.setPrompt(null);
    const standings = rankScores(r.entries.map((e) => ({ ...e })));
    const me = standings.find((e) => e.isPlayer);
    const odds = oddsFor(r.comp);
    const multiplier = odds.multipliers[me.rank - 1];
    const payout = Number((r.stake * multiplier).toFixed(2));
    s.balance = Number((s.balance + payout).toFixed(2));
    this.saveBalance();
    this.ui.setBalance(s.balance);
    let unlockedComp = null;
    if (me.rank === 1 && s.compIndex === s.unlocked - 1 && s.unlocked < COMPETITIONS.length) {
      s.unlocked += 1;
      unlockedComp = COMPETITIONS[s.unlocked - 1];
    }
    if (me.rank !== r.position) console.warn('Outcome mismatch', me.rank, r.position);
    this.after(0.4, () => {
      this.ui.showResults({ standings, playerRank: me.rank, stake: r.stake, multiplier, payout, unlockedComp, roundId: r.id, comp: r.comp });
    });
  }

  // ---- frame ------------------------------------------------------------------
  update(dt) {
    const w = this.world;
    const cam = this.renderer.camera;
    if (this.state === 'ready' || this.state === 'charging') {
      this.clockLeft -= dt;
      this.ui.setClock(clamp(this.clockLeft / DIVE_CLOCK, 0, 1), Math.max(0, this.clockLeft));
      if (this.state === 'charging') this.ui.setChargeMeter(this.player.charge);
      if (this.clockLeft <= 0) {
        this.ui.feed('Time! Off you go…', 'warn');
        if (this.state === 'ready') {
          this.player.startCharge(0);
          this.state = 'charging';
        }
        this.releaseJump();
      }
    }
    if (!(this.player && this.player.state === 'airborne')) this.ui.setAngleGauge(null);
    // Camera follows whoever is in the air.
    const flier = w.divers.find((d) => d.state === 'airborne' || d.state === 'entering');
    if (flier) {
      cam.follow(flier.x + 0.6, flier.y + (flier.state === 'airborne' ? 2.2 : 0.8));
      if (flier.isPlayer && flier.state === 'airborne') this.ui.setAngleGauge(flier.angle, entryTilt(flier.angle, flier.roll));
      if (flier.isPlayer && flier.state === 'airborne' && !flier.locked) {
        const left = flier.impactT - flier.airT;
        this.ui.setLockMeter(left <= LOCK_WINDOW + 0.4 ? clamp(1 - left / (LOCK_WINDOW + 0.4), 0, 1) : null);
      }
    } else if (this.cameraHold) {
      cam.follow(this.cameraHold.x, this.cameraHold.y);
    } else {
      this.frameTop();
    }
    w.update(dt);
    cam.update(dt);
    void sequenceDifficulty;
  }
}
