import { createCard, RANKS } from "../../js/cards.js";
import { shuffle } from "../../js/deck.js";
import { canPlaceOnTableau, hasCompleteTail, isMovableRun, isSpiderComplete } from "./rules.js";

export const SPIDER_SCORE = Object.freeze({
  START: 500,
  MOVE: -1,
  COMPLETE_SEQUENCE: 100,
});

export const STREAK_SCORE_STEP = 0.01;
export function getStreakScoreMultiplier(clearStreak = 0) {
  return 1 + Math.max(0, Number.isInteger(clearStreak) ? clearStreak : 0) * STREAK_SCORE_STEP;
}

export const SPIDER_DIFFICULTIES = Object.freeze({
  one: { id: "one", label: "ONE SUIT", suitCount: 1 },
  two: { id: "two", label: "TWO SUITS", suitCount: 2 },
  four: { id: "four", label: "FOUR SUITS", suitCount: 4 },
  beginner: { id: "beginner", label: "BEGINNER", suitCount: 1 },
  easy: { id: "easy", label: "1 SUIT", suitCount: 1 },
  normal: { id: "normal", label: "2 SUITS", suitCount: 2 },
  hard: { id: "hard", label: "4 SUITS", suitCount: 4 },
});

const clone = (value) => JSON.parse(JSON.stringify(value));
const validIndex = (value, length) => Number.isInteger(value) && value >= 0 && value < length;
const SUITS_BY_DIFFICULTY = Object.freeze({
  1: ["S", "S", "S", "S", "S", "S", "S", "S"],
  2: ["S", "S", "S", "S", "H", "H", "H", "H"],
  4: ["S", "S", "H", "H", "D", "D", "C", "C"],
});

/** Creates 104 unique cards while retaining the shared card-image metadata. */
export function createSpiderDeck({ suitCount = 1, random = Math.random, assetBase } = {}) {
  const suits = SUITS_BY_DIFFICULTY[suitCount] || SUITS_BY_DIFFICULTY[1];
  const deck = suits.flatMap((suit, set) => RANKS.map((rank) => ({
    ...createCard(suit, rank, assetBase),
    id: `spider-${set + 1}-${suit}-${rank}`,
  })));
  return shuffle(deck, random);
}

/**
 * State machine for standard Spider Solitaire. It intentionally owns no DOM or
 * localStorage: the UI may serialize getState() using its own storage policy.
 */
export class SpiderSolitaire {
  constructor({ onChange = () => {}, onComplete = () => {}, onAction = () => {}, random = Math.random, assetBase } = {}) {
    this.onChange = onChange;
    this.onComplete = onComplete;
    this.onAction = onAction;
    this.random = random;
    this.assetBase = assetBase;
    this.difficulty = "one";
    this.timer = null;
    this.disposed = false;
    this.newGame();
  }

  newGame({ difficulty = this.difficulty, clearStreak = 0 } = {}) {
    this.stopTimer();
    this.difficulty = SPIDER_DIFFICULTIES[difficulty] ? difficulty : "one";
    const settings = SPIDER_DIFFICULTIES[this.difficulty];
    const deck = createSpiderDeck({ suitCount: settings.suitCount, random: this.random, assetBase: this.assetBase })
      .map((card) => ({ ...card, faceUp: false }));
    const tableau = Array.from({ length: 10 }, () => []);
    // First four columns receive six cards, the other six receive five.
    for (let pile = 0; pile < 10; pile += 1) {
      const count = pile < 4 ? 6 : 5;
      for (let card = 0; card < count; card += 1) tableau[pile].push({ ...deck.pop(), faceUp: false });
      tableau[pile].at(-1).faceUp = true;
    }
    const streak = Math.max(0, Number.isInteger(clearStreak) ? clearStreak : 0);
    const scoreMultiplier = getStreakScoreMultiplier(streak);
    this.state = {
      stock: deck,
      tableau,
      completed: [],
      moves: 0,
      baseScore: SPIDER_SCORE.START,
      score: Math.round(SPIDER_SCORE.START * scoreMultiplier),
      scoreMultiplier,
      clearStreak: streak,
      elapsedTime: 0,
      gameStatus: "ready",
      playRecorded: false,
      history: [],
      difficulty: settings.id,
      suitCount: settings.suitCount,
    };
    this.emit("new-game");
    return this.getState();
  }

  setDifficulty(difficulty) {
    if (!SPIDER_DIFFICULTIES[difficulty]) return false;
    this.newGame({ difficulty });
    return true;
  }

  getState() { return clone(this.state); }

  capture() {
    const { history, ...snapshot } = this.state;
    return clone(snapshot);
  }

  ensureScoreState() {
    const clearStreak = Math.max(0, Number.isInteger(this.state.clearStreak) ? this.state.clearStreak : 0);
    const scoreMultiplier = getStreakScoreMultiplier(clearStreak);
    const score = Number.isFinite(this.state.score) ? this.state.score : SPIDER_SCORE.START;
    this.state.clearStreak = clearStreak;
    this.state.scoreMultiplier = scoreMultiplier;
    this.state.baseScore = Number.isFinite(this.state.baseScore) ? this.state.baseScore : score / scoreMultiplier;
    this.state.score = Math.max(0, Math.round(this.state.baseScore * scoreMultiplier));
  }

  applyScore(change) {
    this.ensureScoreState();
    this.state.baseScore = Math.max(0, this.state.baseScore + change);
    this.state.score = Math.max(0, Math.round(this.state.baseScore * this.state.scoreMultiplier));
  }

  emit(action, detail = {}) {
    if (this.disposed) return;
    const state = this.getState();
    this.onChange(state, { action, ...detail });
    this.onAction({ action, ...detail, state });
  }

  startTimer() {
    if (this.timer || this.state.gameStatus !== "playing") return;
    this.timer = setInterval(() => {
      if (this.state.gameStatus !== "playing") return;
      this.state.elapsedTime += 1;
      this.emit("tick");
    }, 1000);
  }

  stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  dispose() { this.disposed = true; this.stopTimer(); }
  pause() { if (this.state.gameStatus === "playing") { this.state.gameStatus = "paused"; this.stopTimer(); this.emit("pause"); } }
  resume() { if (this.state.gameStatus === "paused") { this.state.gameStatus = "playing"; this.startTimer(); this.emit("resume"); } }

  ensurePlaying() {
    if (this.state.gameStatus !== "ready") return;
    this.state.gameStatus = "playing";
    this.state.playRecorded = true;
    this.startTimer();
  }

  finishIfComplete() {
    if (!isSpiderComplete(this.state.completed)) return false;
    this.state.gameStatus = "completed";
    this.stopTimer();
    this.onComplete(this.getState());
    return true;
  }

  /** Turns over exposed cards, then removes every completed K→A suit. */
  processCompletedSequences() {
    const removed = [];
    for (let pileIndex = 0; pileIndex < 10; pileIndex += 1) {
      const pile = this.state.tableau[pileIndex];
      while (hasCompleteTail(pile)) {
        const cards = pile.splice(-13);
        this.state.completed.push(cards);
        removed.push({ pile: pileIndex, cards: cards.map((card) => card.id) });
      }
      this.revealTopCard(pileIndex);
    }
    return removed;
  }

  commit(action, mutate) {
    if (this.disposed || this.state.gameStatus === "paused" || this.state.gameStatus === "completed") return false;
    const before = this.capture();
    const result = mutate();
    if (!result) return false;
    const { score = 0, detail = {} } = result === true ? {} : result;
    const removed = this.processCompletedSequences();
    this.state.history.push(before);
    this.state.moves += 1;
    this.applyScore(score + removed.length * SPIDER_SCORE.COMPLETE_SEQUENCE);
    this.ensurePlaying();
    const completed = this.finishIfComplete();
    this.emit(action, { ...detail, removed, completed, stuck: !completed && this.isStuck() });
    return true;
  }

  revealTopCard(pileIndex) {
    const top = this.state.tableau[pileIndex]?.at(-1);
    if (top && !top.faceUp) { top.faceUp = true; return true; }
    return false;
  }

  /** Standard Spider deals exactly one face-up card to every non-empty column. */
  dealStock() {
    return this.commit("stock", () => {
      if (this.state.stock.length < 10 || this.state.tableau.some((pile) => pile.length === 0)) return false;
      for (let pile = 0; pile < 10; pile += 1) this.state.tableau[pile].push({ ...this.state.stock.pop(), faceUp: true });
      return { score: SPIDER_SCORE.MOVE, detail: { kind: "deal", count: 10 } };
    });
  }

  sourceCards(source) {
    if (!source || source.type !== "tableau" || !validIndex(source.pile, 10)) return null;
    const pile = this.state.tableau[source.pile];
    const index = source.cardIndex ?? pile.length - 1;
    if (!Number.isInteger(index) || index < 0 || index >= pile.length) return null;
    const cards = pile.slice(index);
    return isMovableRun(cards) ? cards : null;
  }

  canDrop(source, target) {
    const cards = this.sourceCards(source);
    return Boolean(
      cards
      && target?.type === "tableau"
      && validIndex(target.pile, 10)
      && source.pile !== target.pile
      && canPlaceOnTableau(cards[0], this.state.tableau[target.pile]),
    );
  }

  move(source, target) {
    return this.commit("move", () => {
      if (!this.canDrop(source, target)) return false;
      const from = this.state.tableau[source.pile];
      const index = source.cardIndex ?? from.length - 1;
      const cards = from.splice(index);
      this.state.tableau[target.pile].push(...cards);
      return { score: SPIDER_SCORE.MOVE, detail: { source, target, cards: cards.map((card) => card.id) } };
    });
  }

  moveTableauToTableau(fromPile, cardIndex, toPile) {
    return this.move({ type: "tableau", pile: fromPile, cardIndex }, { type: "tableau", pile: toPile });
  }

  getValidTargets(source) {
    const targets = [];
    for (let pile = 0; pile < 10; pile += 1) if (this.canDrop(source, { type: "tableau", pile })) targets.push({ type: "tableau", pile });
    return targets;
  }

  /** One-click/tap placement selects the first legal column from left to right. */
  autoPlace(source) {
    const target = this.getValidTargets(source)[0];
    return target ? this.move(source, target) : false;
  }

  getHint() {
    const sources = [];
    this.state.tableau.forEach((pile, pileIndex) => pile.forEach((card, cardIndex) => {
      if (card.faceUp && isMovableRun(pile.slice(cardIndex))) sources.push({ type: "tableau", pile: pileIndex, cardIndex });
    }));
    for (const source of sources) {
      const target = this.getValidTargets(source)[0];
      if (target) {
        const card = this.sourceCards(source)[0];
        return { source, target, cardId: card.id, text: `${card.rank}${card.symbol || ""} を移動できます` };
      }
    }
    if (this.state.stock.length >= 10 && this.state.tableau.every((pile) => pile.length)) return { type: "stock", text: "山札を配る" };
    return null;
  }

  /** Conservative dead-end check: it only warns if no legal move or deal remains. */
  isStuck() {
    if (this.state.gameStatus === "completed") return false;
    if (this.state.stock.length >= 10 && this.state.tableau.every((pile) => pile.length)) return false;
    return !this.state.tableau.some((pile, pileIndex) => pile.some((card, cardIndex) => (
      card.faceUp && this.getValidTargets({ type: "tableau", pile: pileIndex, cardIndex }).length
    )));
  }

  undo() {
    if (this.disposed || !this.state.history.length || this.state.gameStatus === "completed") return false;
    const playRecorded = this.state.playRecorded;
    const previous = this.state.history.pop();
    const history = this.state.history;
    this.state = { ...clone(previous), history, playRecorded: playRecorded || previous.playRecorded };
    this.stopTimer();
    if (this.state.gameStatus === "playing") this.startTimer();
    this.emit("undo", { stuck: this.isStuck() });
    return true;
  }

  /** JSON-safe state suitable for a UI-owned save layer. */
  serialize() { return this.capture(); }

  loadState(saved) {
    if (!SpiderSolitaire.isValidSavedState(saved)) return false;
    this.stopTimer();
    this.state = { ...clone(saved), history: [] };
    this.difficulty = SPIDER_DIFFICULTIES[this.state.difficulty] ? this.state.difficulty : "one";
    this.state.difficulty ??= this.difficulty;
    this.state.suitCount ??= SPIDER_DIFFICULTIES[this.difficulty].suitCount;
    this.ensureScoreState();
    if (this.state.gameStatus === "playing") this.startTimer();
    this.emit("load", { stuck: this.isStuck() });
    return true;
  }

  static isValidSavedState(value) {
    if (!value || !Array.isArray(value.stock) || !Array.isArray(value.tableau) || !Array.isArray(value.completed)) return false;
    if (value.tableau.length !== 10 || value.completed.length > 8) return false;
    const cards = [...value.stock, ...value.tableau.flat(), ...value.completed.flat()];
    return cards.length === 104 && new Set(cards.map((card) => card.id)).size === 104;
  }
}
