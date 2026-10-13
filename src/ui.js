// DOM overlay: lobby, HUD, judges, results, tutorial, toasts.

import { COMPETITIONS, oddsFor } from './odds.js';
import { TRICK_LIST } from './tricks.js';

const $ = (sel) => document.querySelector(sel);

export function fmtMoney(n) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtScore(n) {
  return n == null ? '—' : n.toFixed(2);
}

export class UI {
  constructor() {
    this.el = {
      balance: $('#balance'),
      compPill: $('#comp-pill'),
      lobby: $('#lobby'),
      compList: $('#comp-list'),
      stakeChips: $('#stake-chips'),
      stakeValue: $('#stake-value'),
      stakeDec: $('#stake-dec'),
      stakeInc: $('#stake-inc'),
      diveBtn: $('#dive-btn'),
      oddsTable: $('#odds-table'),
      prompt: $('#prompt'),
      clock: $('#dive-clock'),
      clockRing: $('#dive-clock circle.fg'),
      clockText: $('#dive-clock text'),
      feed: $('#trick-feed'),
      leaderboard: $('#leaderboard'),
      judges: $('#judges'),
      judgesName: $('#judges-name'),
      judgeMarks: [...document.querySelectorAll('#judges .mark')],
      judgesTotal: $('#judges-total'),
      results: $('#results'),
      resultsTitle: $('#results-title'),
      resultsSub: $('#results-sub'),
      resultsTable: $('#results-table'),
      resultsPayout: $('#results-payout'),
      resultsUnlock: $('#results-unlock'),
      againBtn: $('#again-btn'),
      lobbyBtn: $('#lobby-btn'),
      tutorial: $('#tutorial'),
      tutorialClose: $('#tutorial-close'),
      helpBtn: $('#help-btn'),
      toasts: $('#toasts'),
      lockMeter: $('#lock-meter'),
      lockFill: $('#lock-meter .fill'),
      roundId: $('#round-id'),
      topup: $('#topup-btn'),
      gestureList: $('#gesture-list'),
      tutorialGestures: $('#tutorial-gestures'),
      installBtn: $('#install-btn'),
    };
    this.handlers = {};
    this.selectedComp = 0;
    this.stake = 1;
    this.renderGestureLists();
    this.bind();
  }

  on(name, fn) {
    this.handlers[name] = fn;
  }

  bind() {
    const e = this.el;
    e.diveBtn.addEventListener('click', () => this.handlers.dive?.());
    e.stakeDec.addEventListener('click', () => this.handlers.stakeStep?.(-1));
    e.stakeInc.addEventListener('click', () => this.handlers.stakeStep?.(1));
    e.againBtn.addEventListener('click', () => this.handlers.again?.());
    e.lobbyBtn.addEventListener('click', () => this.handlers.lobby?.());
    e.tutorialClose.addEventListener('click', () => this.hideTutorial());
    e.helpBtn.addEventListener('click', () => this.showTutorial());
    e.topup.addEventListener('click', () => this.handlers.topup?.());
  }

  renderGestureLists() {
    const html = TRICK_LIST.map(
      (t) => `<li><span class="arrow">${t.arrow}</span><span class="tname">${t.name}</span><span class="tdiff">${t.difficulty.toFixed(1)}</span><span class="tges">${t.gesture}</span></li>`,
    ).join('');
    this.el.gestureList.innerHTML = html;
    this.el.tutorialGestures.innerHTML = html;
  }

  // ---- top bar ------------------------------------------------------------
  setBalance(balance) {
    this.el.balance.textContent = fmtMoney(balance);
  }

  setCompPill(comp) {
    this.el.compPill.textContent = `${comp.short} · ${comp.height}m`;
  }

  // ---- lobby --------------------------------------------------------------
  renderLobby({ unlocked, selected, stake, balance }) {
    this.selectedComp = selected;
    this.stake = stake;
    const list = COMPETITIONS.map((c, i) => {
      const locked = i >= unlocked;
      const odds = oddsFor(c);
      const top = odds.multipliers[0];
      const cls = ['comp-card', locked ? 'locked' : '', i === selected ? 'selected' : ''].join(' ');
      return `<button class="${cls}" data-index="${i}" ${locked ? 'disabled' : ''} aria-pressed="${i === selected}">
        <span class="comp-height">${c.height}m</span>
        <span class="comp-name">${c.name}</span>
        <span class="comp-top">Top prize <b>${top}x</b></span>
        ${locked ? `<span class="comp-lock">🔒 Win a round in ${COMPETITIONS[i - 1].short} to unlock</span>` : `<span class="comp-blurb">${c.blurb}</span>`}
      </button>`;
    }).join('');
    this.el.compList.innerHTML = list;
    for (const btn of this.el.compList.querySelectorAll('.comp-card')) {
      btn.addEventListener('click', () => this.handlers.selectComp?.(Number(btn.dataset.index)));
    }
    this.renderStake(COMPETITIONS[selected], stake, balance);
    this.renderOdds(COMPETITIONS[selected], stake);
    this.el.lobby.classList.remove('hidden');
  }

  renderStake(comp, stake, balance) {
    this.el.stakeChips.innerHTML = comp.stakes
      .map((s) => `<button class="chip ${s === stake ? 'selected' : ''}" data-stake="${s}" ${s > balance ? 'disabled' : ''}>${s}</button>`)
      .join('');
    for (const chip of this.el.stakeChips.querySelectorAll('.chip')) {
      chip.addEventListener('click', () => this.handlers.selectStake?.(Number(chip.dataset.stake)));
    }
    this.el.stakeValue.textContent = fmtMoney(stake);
    const canPlay = stake <= balance && stake > 0;
    this.el.diveBtn.disabled = !canPlay;
    this.el.diveBtn.textContent = canPlay ? `Enter for ${fmtMoney(stake)}` : 'Not enough credits';
    this.el.topup.classList.toggle('hidden', balance >= comp.stakes[0]);
  }

  renderOdds(comp, stake) {
    const odds = oddsFor(comp);
    const labels = ['1st', '2nd', '3rd', '4th'];
    const rows = odds.multipliers
      .map((m, i) => {
        const p = odds.probabilities[i] * 100;
        return `<tr class="${m > 1 ? 'win' : m > 0 ? 'partial' : 'lose'}"><td>${labels[i]}</td><td>${m}x</td><td>${fmtMoney(m * stake)}</td><td><span class="bar" style="width:${p.toFixed(1)}%"></span>${p.toFixed(1)}%</td></tr>`;
      })
      .join('');
    this.el.oddsTable.innerHTML = `<thead><tr><th>Place</th><th>Prize</th><th>Pays</th><th>Chance</th></tr></thead><tbody>${rows}</tbody>`;
  }

  hideLobby() {
    this.el.lobby.classList.add('hidden');
  }

  // ---- HUD ----------------------------------------------------------------
  setPrompt(text, cls = '') {
    const p = this.el.prompt;
    if (!text) {
      p.classList.add('hidden');
      return;
    }
    p.textContent = text;
    p.className = `prompt ${cls}`;
    p.classList.remove('hidden');
  }

  setClock(fraction, seconds) {
    const c = this.el.clock;
    if (fraction == null) {
      c.classList.add('hidden');
      return;
    }
    c.classList.remove('hidden');
    const r = 26;
    const circ = 2 * Math.PI * r;
    this.el.clockRing.setAttribute('stroke-dasharray', `${circ * fraction} ${circ}`);
    this.el.clockText.textContent = Math.ceil(seconds);
    c.classList.toggle('urgent', seconds < 3);
  }

  setLockMeter(fraction) {
    const m = this.el.lockMeter;
    if (fraction == null) {
      m.classList.add('hidden');
      return;
    }
    m.classList.remove('hidden');
    this.el.lockFill.style.height = `${Math.round(fraction * 100)}%`;
  }

  feed(text, cls = '') {
    const item = document.createElement('div');
    item.className = `feed-item ${cls}`;
    item.textContent = text;
    this.el.feed.appendChild(item);
    requestAnimationFrame(() => item.classList.add('show'));
    setTimeout(() => {
      item.classList.add('fade');
      setTimeout(() => item.remove(), 500);
    }, 1800);
    while (this.el.feed.children.length > 4) this.el.feed.firstChild.remove();
  }

  clearFeed() {
    this.el.feed.innerHTML = '';
  }

  renderLeaderboard(entries, { show = true } = {}) {
    const lb = this.el.leaderboard;
    if (!show) {
      lb.classList.add('hidden');
      return;
    }
    lb.classList.remove('hidden');
    const scored = entries.filter((e) => e.score != null).sort((a, b) => b.score - a.score);
    const pending = entries.filter((e) => e.score == null);
    const rows = [...scored, ...pending]
      .map((e, i) => {
        const rank = e.score != null ? i + 1 : '';
        return `<li class="${e.isPlayer ? 'me' : ''} ${e.active ? 'active' : ''} ${e.score == null ? 'pending' : ''}">
          <span class="rank">${rank || '·'}</span>
          <span class="dot" style="background:${e.color}"></span>
          <span class="name">${e.isPlayer ? 'You' : e.name}</span>
          <span class="score">${e.score == null ? (e.active ? 'diving…' : '—') : fmtScore(e.score)}</span>
        </li>`;
      })
      .join('');
    lb.innerHTML = `<ol>${rows}</ol>`;
  }

  // ---- judges -------------------------------------------------------------
  showJudges(name, marks, total) {
    const j = this.el.judges;
    this.el.judgesName.textContent = name;
    this.el.judgeMarks.forEach((m, i) => {
      m.textContent = '';
      m.classList.remove('pop');
      setTimeout(() => {
        m.textContent = marks[i].toFixed(2);
        m.classList.add('pop');
      }, 250 + i * 320);
    });
    this.el.judgesTotal.textContent = '';
    this.el.judgesTotal.classList.remove('pop');
    setTimeout(() => {
      this.el.judgesTotal.textContent = fmtScore(total);
      this.el.judgesTotal.classList.add('pop');
    }, 250 + 3 * 320);
    j.classList.remove('hidden');
  }

  hideJudges() {
    this.el.judges.classList.add('hidden');
  }

  // ---- results ------------------------------------------------------------
  showResults({ standings, playerRank, stake, multiplier, payout, unlockedComp, roundId, comp }) {
    const ordinal = ['1st', '2nd', '3rd', '4th'][playerRank - 1];
    const titles = ['🏆 You won!', '🥈 Second place', '🥉 Third place', 'Fourth place'];
    this.el.resultsTitle.textContent = titles[playerRank - 1];
    this.el.resultsSub.textContent = `${ordinal} in the ${comp.name}`;
    this.el.resultsTable.innerHTML = standings
      .map(
        (s) => `<li class="${s.isPlayer ? 'me' : ''}">
          <span class="rank">${s.rank}</span>
          <span class="dot" style="background:${s.color}"></span>
          <span class="name">${s.isPlayer ? 'You' : s.name}</span>
          <span class="marks">${s.marks.map((m) => m.toFixed(1)).join(' · ')}</span>
          <span class="score">${fmtScore(s.score)}</span>
        </li>`,
      )
      .join('');
    const net = payout - stake;
    this.el.resultsPayout.className = `payout ${net > 0 ? 'win' : net === 0 ? 'even' : 'lose'}`;
    this.el.resultsPayout.innerHTML =
      multiplier > 0
        ? `<span class="mult">${multiplier}x</span><span class="amt">+${fmtMoney(payout)}</span><span class="net">${net >= 0 ? '+' : ''}${fmtMoney(net)} net</span>`
        : `<span class="mult">0x</span><span class="amt">No prize</span><span class="net">-${fmtMoney(stake)} net</span>`;
    if (unlockedComp) {
      this.el.resultsUnlock.classList.remove('hidden');
      this.el.resultsUnlock.innerHTML = `🔓 <b>Unlocked:</b> ${unlockedComp.name} (${unlockedComp.height}m)`;
    } else {
      this.el.resultsUnlock.classList.add('hidden');
    }
    this.el.roundId.textContent = `Round ${roundId}`;
    this.el.results.classList.remove('hidden');
  }

  hideResults() {
    this.el.results.classList.add('hidden');
  }

  // ---- tutorial / toasts --------------------------------------------------
  showTutorial() {
    this.el.tutorial.classList.remove('hidden');
  }

  hideTutorial() {
    this.el.tutorial.classList.add('hidden');
    this.handlers.tutorialClosed?.();
  }

  toast(text, cls = '') {
    const t = document.createElement('div');
    t.className = `toast ${cls}`;
    t.textContent = text;
    this.el.toasts.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 400);
    }, 2600);
  }
}
