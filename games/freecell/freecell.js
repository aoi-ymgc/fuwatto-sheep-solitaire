import { createStandardDeck } from "../../js/cards.js";
import { shuffle } from "../../js/deck.js";
import {
  canPlaceOnFoundation,
  canPlaceOnTableau,
  findFoundationTarget,
  isFoundationComplete,
  isValidTableauRun,
  movableCardCapacity,
} from "./rules.js";

export const FREECELL_SCORE = Object.freeze({
  TO_FOUNDATION: 10,
});

export const STREAK_SCORE_STEP = 0.01;
export function getStreakScoreMultiplier(clearStreak = 0) {
  return 1 + Math.max(0, Number.isInteger(clearStreak) ? clearStreak : 0) * STREAK_SCORE_STEP;
}

export const FREECELL_DIFFICULTIES = Object.freeze({
  standard: { id: "standard", label: "STANDARD" },
});

const clone = (value) => JSON.parse(JSON.stringify(value));
const validIndex = (value, length) => Number.isInteger(value) && value >= 0 && value < length;

export function createFreeCellDeck({ random = Math.random, assetBase } = {}) {
  return shuffle(createStandardDeck({ assetBase }), random).map((card) => ({ ...card, faceUp: true }));
}

/** DOM-independent state machine for standard FreeCell. */
export class FreeCellSolitaire {
  constructor({ onChange = () => {}, onComplete = () => {}, onAction = () => {}, random = Math.random, assetBase } = {}) {
    this.onChange = onChange;
    this.onComplete = onComplete;
    this.onAction = onAction;
    this.random = random;
    this.assetBase = assetBase;
    this.difficulty = "standard";
    this.timer = null;
    this.disposed = false;
    this.newGame();
  }

  newGame({ difficulty = this.difficulty, clearStreak = 0 } = {}) {
    this.stopTimer();
    this.difficulty = FREECELL_DIFFICULTIES[difficulty] ? difficulty : "standard";
    const deck = createFreeCellDeck({ random: this.random, assetBase: this.assetBase });
    const tableau = Array.from({ length: 8 }, () => []);
    for (let pile = 0; pile < 8; pile += 1) {
      const count = pile < 4 ? 7 : 6;
      for (let card = 0; card < count; card += 1) tableau[pile].push(deck.pop());
    }
    const streak = Math.max(0, Number.isInteger(clearStreak) ? clearStreak : 0);
    this.state = {
      tableau,
      freeCells: Array(4).fill(null),
      foundations: Array.from({ length: 4 }, () => []),
      moves: 0,
      baseScore: 0,
      score: 0,
      scoreMultiplier: getStreakScoreMultiplier(streak),
      clearStreak: streak,
      elapsedTime: 0,
      gameStatus: "ready",
      playRecorded: false,
      history: [],
      difficulty: this.difficulty,
    };
    this.emit("new-game");
    return this.getState();
  }

  setDifficulty(difficulty) {
    if (!FREECELL_DIFFICULTIES[difficulty]) return false;
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
    const score = Number.isFinite(this.state.score) ? this.state.score : 0;
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
    if (!isFoundationComplete(this.state.foundations)) return false;
    this.state.gameStatus = "completed";
    this.stopTimer();
    this.onComplete(this.getState());
    return true;
  }

  commit(action, mutate) {
    if (this.disposed || this.state.gameStatus === "paused" || this.state.gameStatus === "completed") return false;
    const before = this.capture();
    const result = mutate();
    if (!result) return false;
    const { score = 0, detail = {} } = result === true ? {} : result;
    this.state.history.push(before);
    this.state.moves += 1;
    this.applyScore(score);
    this.ensurePlaying();
    const completed = this.finishIfComplete();
    this.emit(action, { ...detail, completed, stuck: !completed && this.isStuck() });
    return true;
  }

  sourceCards(source) {
    if (!source || typeof source !== "object") return null;
    if (source.type === "tableau" && validIndex(source.pile, 8)) {
      const pile = this.state.tableau[source.pile];
      const index = source.cardIndex ?? pile.length - 1;
      if (!Number.isInteger(index) || index < 0 || index >= pile.length) return null;
      const cards = pile.slice(index);
      return isValidTableauRun(cards) ? cards : null;
    }
    if (source.type === "freecell" && validIndex(source.pile, 4)) {
      const card = this.state.freeCells[source.pile];
      return card ? [card] : null;
    }
    if (source.type === "foundation" && validIndex(source.pile, 4)) {
      const card = this.state.foundations[source.pile].at(-1);
      return card ? [card] : null;
    }
    return null;
  }

  canDrop(source, target) {
    const cards = this.sourceCards(source);
    if (!cards || !target || typeof target !== "object") return false;
    if (target.type === "tableau" && validIndex(target.pile, 8)) {
      if (source.type === "tableau" && source.pile === target.pile) return false;
      return canPlaceOnTableau(cards[0], this.state.tableau[target.pile])
        && cards.length <= movableCardCapacity({ freeCells: this.state.freeCells, tableau: this.state.tableau, target });
    }
    if (target.type === "freecell" && validIndex(target.pile, 4)) return cards.length === 1 && !this.state.freeCells[target.pile];
    return target.type === "foundation"
      && validIndex(target.pile, 4)
      && cards.length === 1
      && canPlaceOnFoundation(cards[0], this.state.foundations[target.pile]);
  }

  removeSource(source) {
    if (source.type === "tableau") {
      const pile = this.state.tableau[source.pile];
      const index = source.cardIndex ?? pile.length - 1;
      return pile.splice(index);
    }
    if (source.type === "freecell") {
      const card = this.state.freeCells[source.pile];
      this.state.freeCells[source.pile] = null;
      return [card];
    }
    return [this.state.foundations[source.pile].pop()];
  }

  move(source, target) {
    return this.commit("move", () => {
      if (!this.canDrop(source, target)) return false;
      const cards = this.removeSource(source);
      if (target.type === "tableau") this.state.tableau[target.pile].push(...cards);
      else if (target.type === "freecell") this.state.freeCells[target.pile] = cards[0];
      else this.state.foundations[target.pile].push(cards[0]);
      return {
        score: target.type === "foundation" ? FREECELL_SCORE.TO_FOUNDATION : 0,
        detail: { source, target, cards: cards.map((card) => card.id) },
      };
    });
  }

  moveTableauToTableau(fromPile, cardIndex, toPile) { return this.move({ type: "tableau", pile: fromPile, cardIndex }, { type: "tableau", pile: toPile }); }

  getValidTargets(source) {
    const targets = [];
    for (let pile = 0; pile < 8; pile += 1) if (this.canDrop(source, { type: "tableau", pile })) targets.push({ type: "tableau", pile });
    for (let pile = 0; pile < 4; pile += 1) if (this.canDrop(source, { type: "freecell", pile })) targets.push({ type: "freecell", pile });
    for (let pile = 0; pile < 4; pile += 1) if (this.canDrop(source, { type: "foundation", pile })) targets.push({ type: "foundation", pile });
    return targets;
  }

  /** One tap prefers Foundation, then a tableau placement, then an empty Free Cell. */
  autoPlace(source) {
    const targets = this.getValidTargets(source);
    const target = targets.find((item) => item.type === "foundation")
      || targets.find((item) => item.type === "tableau")
      || targets.find((item) => item.type === "freecell");
    return target ? this.move(source, target) : false;
  }

  autoMove(source) {
    const cards = this.sourceCards(source);
    if (!cards || cards.length !== 1) return false;
    const foundation = findFoundationTarget(cards[0], this.state.foundations);
    return foundation >= 0 && this.move(source, { type: "foundation", pile: foundation });
  }

  describeHint(source, target) {
    const card = this.sourceCards(source)?.[0];
    return card ? { source, target, cardId: card.id, text: `${card.rank}${card.symbol || ""} を移動できます` } : null;
  }

  getHint() {
    const sources = this.getSources();
    for (const source of sources) {
      const target = this.getValidTargets(source).find((item) => item.type === "foundation");
      if (target) return this.describeHint(source, target);
    }
    for (const source of sources) {
      const target = this.getValidTargets(source).find((item) => item.type === "tableau");
      if (target) return this.describeHint(source, target);
    }
    for (const source of sources) {
      const target = this.getValidTargets(source).find((item) => item.type === "freecell");
      if (target) return this.describeHint(source, target);
    }
    return null;
  }

  getSources() {
    const sources = [];
    this.state.tableau.forEach((pile, pileIndex) => pile.forEach((card, cardIndex) => {
      if (card.faceUp && isValidTableauRun(pile.slice(cardIndex))) sources.push({ type: "tableau", pile: pileIndex, cardIndex });
    }));
    this.state.freeCells.forEach((card, pile) => { if (card) sources.push({ type: "freecell", pile }); });
    this.state.foundations.forEach((pile, pileIndex) => { if (pile.length) sources.push({ type: "foundation", pile: pileIndex }); });
    return sources;
  }

  isStuck() {
    if (this.state.gameStatus === "completed" || isFoundationComplete(this.state.foundations)) return false;
    return !this.getSources().some((source) => this.getValidTargets(source).length);
  }

  /** Checks whether the remaining exposed cards can all be safely sent to Foundation. */
  isAutoCompleteReady() {
    const tableau = clone(this.state.tableau);
    const freeCells = clone(this.state.freeCells);
    const foundations = clone(this.state.foundations);
    let moved = true;
    while (moved) {
      moved = false;
      for (const pile of tableau) {
        const card = pile.at(-1);
        const target = card ? findFoundationTarget(card, foundations) : -1;
        if (target >= 0) { foundations[target].push(pile.pop()); moved = true; }
      }
      for (let index = 0; index < freeCells.length; index += 1) {
        const card = freeCells[index];
        const target = card ? findFoundationTarget(card, foundations) : -1;
        if (target >= 0) { foundations[target].push(card); freeCells[index] = null; moved = true; }
      }
    }
    return isFoundationComplete(foundations);
  }

  autoCompleteStep() {
    for (let pile = 0; pile < 8; pile += 1) if (this.autoMove({ type: "tableau", pile })) return true;
    for (let pile = 0; pile < 4; pile += 1) if (this.autoMove({ type: "freecell", pile })) return true;
    return false;
  }

  autoComplete() {
    let moved = 0;
    while (this.autoCompleteStep()) moved += 1;
    return moved;
  }

  undo() {
    if (this.disposed || !this.state.history.length || this.state.gameStatus === "completed") return false;
    const previous = this.state.history.pop();
    const history = this.state.history;
    this.state = { ...clone(previous), history };
    this.stopTimer();
    if (this.state.gameStatus === "playing") this.startTimer();
    this.emit("undo", { stuck: this.isStuck() });
    return true;
  }

  serialize() { return this.capture(); }

  loadState(saved) {
    if (!FreeCellSolitaire.isValidSavedState(saved)) return false;
    this.stopTimer();
    this.state = { ...clone(saved), history: [] };
    this.state.score = Number.isFinite(this.state.score) ? this.state.score : 0;
    this.state.moves = Number.isInteger(this.state.moves) ? this.state.moves : 0;
    this.state.elapsedTime = Number.isInteger(this.state.elapsedTime) ? this.state.elapsedTime : 0;
    this.state.gameStatus ??= "ready";
    this.state.playRecorded = Boolean(this.state.playRecorded);
    this.difficulty = FREECELL_DIFFICULTIES[this.state.difficulty] ? this.state.difficulty : "standard";
    this.state.difficulty = this.difficulty;
    this.ensureScoreState();
    if (this.state.gameStatus === "playing") this.startTimer();
    this.emit("load", { stuck: this.isStuck() });
    return true;
  }

  static isValidSavedState(value) {
    if (!value || !Array.isArray(value.tableau) || !Array.isArray(value.freeCells) || !Array.isArray(value.foundations)) return false;
    if (value.tableau.length !== 8 || value.freeCells.length !== 4 || value.foundations.length !== 4) return false;
    if (value.freeCells.some((card) => card !== null && typeof card !== "object")) return false;
    const cards = [...value.tableau.flat(), ...value.freeCells.filter(Boolean), ...value.foundations.flat()];
    return cards.length === 52 && new Set(cards.map((card) => card.id)).size === 52;
  }
}
