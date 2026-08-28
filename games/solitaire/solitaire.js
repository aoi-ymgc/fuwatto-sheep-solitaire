import { createKlondikeDeck } from "../../js/deck.js";
import { loadJSON, noteSolitaireClear, noteSolitairePlay, removeStored, saveJSON, SOLITAIRE_GAME_KEY } from "../../js/storage.js";
import { canPlaceOnFoundation, canPlaceOnTableau, findFoundationTarget, isFoundationComplete, isValidTableauRun } from "./rules.js";

export const SCORE = Object.freeze({
  TO_FOUNDATION: 10,
  WASTE_TO_TABLEAU: 5,
  REVEAL_TABLEAU: 5,
  FOUNDATION_TO_TABLEAU: -15,
  ONE_CARD_RECYCLE: -100,
});

// Consecutive clears are deliberately kept out of the rules copy.  The UI may
// show the current streak, while this small step is applied to the actual
// score so that the saved/ranked score always matches what the player saw.
export const STREAK_SCORE_STEP = 0.01;
export function getStreakScoreMultiplier(clearStreak = 0) {
  return 1 + Math.max(0, Number.isInteger(clearStreak) ? clearStreak : 0) * STREAK_SCORE_STEP;
}

export const DIFFICULTIES = Object.freeze({
  beginner: { id: "beginner", label: "BEGINNER", drawCount: 1, maxRecycle: null, tableauFaceUp: true },
  easy: { id: "easy", label: "EASY", drawCount: 1, maxRecycle: null },
  normal: { id: "normal", label: "NORMAL", drawCount: 3, maxRecycle: null },
  hard: { id: "hard", label: "HARD", drawCount: 3, maxRecycle: 3 },
});

const clone = (value) => JSON.parse(JSON.stringify(value));
const validIndex = (value, length) => Number.isInteger(value) && value >= 0 && value < length;

/**
 * DOM-free Klondike state machine. UI code should call methods here, then render
 * the state received through onChange; it must not use HTML as game state.
 */
export class KlondikeSolitaire {
  constructor({ onChange = () => {}, onComplete = () => {}, onAction = () => {}, random = Math.random, assetBase } = {}) {
    this.onChange = onChange;
    this.onComplete = onComplete;
    this.onAction = onAction;
    this.random = random;
    this.assetBase = assetBase;
    this.difficulty = "easy";
    this.timer = null;
    this.disposed = false;
    this.newGame();
  }

  newGame({ difficulty = this.difficulty, clearStreak = 0 } = {}) {
    this.stopTimer();
    this.difficulty = DIFFICULTIES[difficulty] ? difficulty : "easy";
    const settings = DIFFICULTIES[this.difficulty];
    const deck = createKlondikeDeck({ random: this.random, assetBase: this.assetBase }).map((card) => ({ ...card, faceUp: false }));
    const tableau = Array.from({ length: 7 }, () => []);
    for (let column = 0; column < 7; column += 1) {
      for (let row = 0; row <= column; row += 1) {
        tableau[column].push({ ...deck.shift(), faceUp: settings.tableauFaceUp || row === column });
      }
    }
    const streak = Math.max(0, Number.isInteger(clearStreak) ? clearStreak : 0);
    this.state = {
      stock: deck,
      waste: [],
      tableau,
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
      difficulty: settings.id,
      drawCount: settings.drawCount,
      maxRecycle: settings.maxRecycle,
      recycleCount: 0,
    };
    this.emit("new-game");
    return this.getState();
  }

  setDifficulty(difficulty) {
    if (!DIFFICULTIES[difficulty]) return false;
    this.newGame({ difficulty });
    return true;
  }

  /** A JSON-safe copy appropriate for rendering or saving. */
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
    if (this.state.gameStatus === "ready") {
      this.state.gameStatus = "playing";
      if (!this.state.playRecorded) {
        noteSolitairePlay();
        this.state.playRecorded = true;
      }
      this.startTimer();
    }
  }

  finishIfComplete() {
    if (!isFoundationComplete(this.state.foundations)) return false;
    this.state.gameStatus = "completed";
    this.stopTimer();
    const records = noteSolitaireClear(this.state);
    this.onComplete({ ...this.getState(), records });
    return true;
  }

  /**
   * Conservative dead-end check. With unlimited Waste recycling, a non-empty
   * Waste can still be explored, so it must never trigger a false warning.
   */
  isStuck() {
    if (this.state.gameStatus === "completed" || isFoundationComplete(this.state.foundations)) return false;
    const sources = [];
    this.state.tableau.forEach((pile, pileIndex) => pile.forEach((card, cardIndex) => {
      if (card.faceUp && isValidTableauRun(pile.slice(cardIndex))) sources.push({ type: "tableau", pile: pileIndex, cardIndex });
    }));
    if (this.state.waste.length) sources.push({ type: "waste" });
    this.state.foundations.forEach((pile, pileIndex) => { if (pile.length) sources.push({ type: "foundation", pile: pileIndex }); });
    const cannotRecycle = this.state.waste.length === 0
      || (this.state.maxRecycle !== null && this.state.recycleCount >= this.state.maxRecycle);
    return this.state.stock.length === 0
      && cannotRecycle
      && !sources.some((source) => this.getValidTargets(source).length);
  }

  /** Proves that all remaining tableau cards can be sent to Foundation without guesswork. */
  isAutoCompleteReady() {
    if (this.state.stock.length || this.state.waste.length || this.state.tableau.some((pile) => pile.some((card) => !card.faceUp))) return false;
    const tableau = clone(this.state.tableau);
    const foundations = clone(this.state.foundations);
    let moved = true;
    while (moved) {
      moved = false;
      for (const pile of tableau) {
        const card = pile.at(-1);
        const foundation = card && findFoundationTarget(card, foundations);
        if (foundation >= 0) { foundations[foundation].push(pile.pop()); moved = true; }
      }
    }
    return foundations.every((pile) => pile.length === 13);
  }

  /** Moves one guaranteed tableau card to Foundation for the UI auto-complete sequence. */
  autoCompleteStep() {
    for (let pile = 0; pile < 7; pile += 1) {
      if (this.autoMove({ type: "tableau", pile })) return true;
    }
    return false;
  }

  /** Commits a successful move and makes it reversible. */
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
    this.emit(action, { ...detail, completed, stuck: !completed && this.isStuck(), autoCompleteReady: !completed && this.isAutoCompleteReady() });
    return true;
  }

  /** Draws one card; clicking empty stock recycles waste for unlimited passes. */
  drawStock() {
    return this.commit("stock", () => {
      if (this.state.stock.length) {
        const amount = Math.min(this.state.drawCount, this.state.stock.length);
        for (let count = 0; count < amount; count += 1) this.state.waste.push({ ...this.state.stock.pop(), faceUp: true });
        return { detail: { kind: "draw", count: amount } };
      }
      if (!this.state.waste.length || (this.state.maxRecycle !== null && this.state.recycleCount >= this.state.maxRecycle)) return false;
      while (this.state.waste.length) this.state.stock.push({ ...this.state.waste.pop(), faceUp: false });
      this.state.recycleCount += 1;
      return { score: this.state.drawCount === 1 ? SCORE.ONE_CARD_RECYCLE : 0, detail: { kind: "recycle" } };
    });
  }

  sourceCards(source) {
    if (!source || typeof source !== "object") return null;
    if (source.type === "tableau" && validIndex(source.pile, 7)) {
      const pile = this.state.tableau[source.pile];
      const index = source.cardIndex ?? pile.length - 1;
      const cards = pile.slice(index);
      return index >= 0 && isValidTableauRun(cards) ? cards : null;
    }
    if (source.type === "waste") return this.state.waste.length ? [this.state.waste.at(-1)] : null;
    if (source.type === "foundation" && validIndex(source.pile, 4)) {
      const card = this.state.foundations[source.pile].at(-1);
      return card ? [card] : null;
    }
    return null;
  }

  canDrop(source, target) {
    const cards = this.sourceCards(source);
    if (!cards || !target || typeof target !== "object") return false;
    if (target.type === "tableau" && validIndex(target.pile, 7)) {
      return !(source.type === "tableau" && source.pile === target.pile) && canPlaceOnTableau(cards[0], this.state.tableau[target.pile]);
    }
    return target.type === "foundation" && validIndex(target.pile, 4) && cards.length === 1 && canPlaceOnFoundation(cards[0], this.state.foundations[target.pile]);
  }

  removeSource(source) {
    if (source.type === "tableau") {
      const pile = this.state.tableau[source.pile];
      const index = source.cardIndex ?? pile.length - 1;
      return pile.splice(index);
    }
    if (source.type === "waste") return [this.state.waste.pop()];
    return [this.state.foundations[source.pile].pop()];
  }

  revealTopCard(column) {
    const top = this.state.tableau[column].at(-1);
    if (top && !top.faceUp) { top.faceUp = true; return true; }
    return false;
  }

  move(source, target) {
    return this.commit("move", () => {
      if (!this.canDrop(source, target)) return false;
      const cards = this.removeSource(source);
      if (target.type === "tableau") this.state.tableau[target.pile].push(...cards);
      else this.state.foundations[target.pile].push(cards[0]);
      const revealed = source.type === "tableau" && this.revealTopCard(source.pile);
      let score = revealed ? SCORE.REVEAL_TABLEAU : 0;
      if (target.type === "foundation") score += SCORE.TO_FOUNDATION;
      if (source.type === "waste" && target.type === "tableau") score += SCORE.WASTE_TO_TABLEAU;
      if (source.type === "foundation" && target.type === "tableau") score += SCORE.FOUNDATION_TO_TABLEAU;
      return { score, detail: { source, target, cards: cards.map((card) => card.id), revealed } };
    });
  }

  moveTableauToTableau(fromPile, cardIndex, toPile) { return this.move({ type: "tableau", pile: fromPile, cardIndex }, { type: "tableau", pile: toPile }); }
  moveWasteToTableau(toPile) { return this.move({ type: "waste" }, { type: "tableau", pile: toPile }); }
  moveFoundationToTableau(fromPile, toPile) { return this.move({ type: "foundation", pile: fromPile }, { type: "tableau", pile: toPile }); }
  moveTableauToFoundation(fromPile) { return this.autoMove({ type: "tableau", pile: fromPile }); }
  moveWasteToFoundation() { return this.autoMove({ type: "waste" }); }

  /** Moves a selectable card to its legal foundation, for double-click/tap. */
  autoMove(source) {
    const card = this.sourceCards(source)?.[0];
    if (!card || this.sourceCards(source)?.length !== 1) return false;
    const foundation = findFoundationTarget(card, this.state.foundations);
    return foundation >= 0 && this.move(source, { type: "foundation", pile: foundation });
  }

  /** Uses a stable priority order for one-tap placement: Foundation, then Tableau. */
  autoPlace(source) {
    const targets = this.getValidTargets(source);
    const target = targets.find((item) => item.type === "foundation") || targets.find((item) => item.type === "tableau");
    return target ? this.move(source, target) : false;
  }

  autoPlaceWaste() { return this.autoPlace({ type: "waste" }); }

  getValidTargets(source) {
    const targets = [];
    for (let pile = 0; pile < 7; pile += 1) if (this.canDrop(source, { type: "tableau", pile })) targets.push({ type: "tableau", pile });
    for (let pile = 0; pile < 4; pile += 1) if (this.canDrop(source, { type: "foundation", pile })) targets.push({ type: "foundation", pile });
    return targets;
  }

  getHint() {
    const sources = [];
    this.state.tableau.forEach((pile, pileIndex) => pile.forEach((card, cardIndex) => {
      if (card.faceUp && isValidTableauRun(pile.slice(cardIndex))) sources.push({ type: "tableau", pile: pileIndex, cardIndex });
    }));
    if (this.state.waste.length) sources.push({ type: "waste" });
    this.state.foundations.forEach((pile, pileIndex) => { if (pile.length) sources.push({ type: "foundation", pile: pileIndex }); });
    for (const source of sources) {
      const targets = this.getValidTargets(source);
      const foundation = targets.find((target) => target.type === "foundation");
      if (foundation) return this.describeHint(source, foundation);
    }
    for (const source of sources) {
      const target = this.getValidTargets(source).find((item) => item.type === "tableau");
      if (target) return this.describeHint(source, target);
    }
    return this.state.stock.length || this.state.waste.length ? { type: "stock", text: this.state.stock.length ? "山札をめくる" : "山札を戻す" } : null;
  }

  describeHint(source, target) {
    const card = this.sourceCards(source)[0];
    const targetTop = target.type === "tableau" ? this.state.tableau[target.pile].at(-1) : this.state.foundations[target.pile].at(-1);
    return { source, target, cardId: card.id, targetCardId: targetTop?.id || null, text: `${card.rank}${card.symbol || ""} を移動できます` };
  }

  /** Moves all currently accessible foundation cards. Returns the number moved. */
  autoComplete() {
    let moved = 0;
    while (true) {
      let didMove = false;
      for (let pile = 0; pile < 7; pile += 1) didMove ||= this.autoMove({ type: "tableau", pile });
      didMove ||= this.autoMove({ type: "waste" });
      if (!didMove) break;
      moved += 1;
    }
    return moved;
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

  save(key = SOLITAIRE_GAME_KEY) { return saveJSON(key, this.capture()); }
  clearSavedGame(key = SOLITAIRE_GAME_KEY) { removeStored(key); }

  load(key = SOLITAIRE_GAME_KEY) {
    const saved = loadJSON(key, null);
    if (!KlondikeSolitaire.isValidSavedState(saved)) return false;
    this.stopTimer();
    this.state = { ...saved, history: [] };
    this.difficulty = DIFFICULTIES[this.state.difficulty] ? this.state.difficulty : "easy";
    this.state.difficulty ??= this.difficulty;
    this.state.drawCount ??= DIFFICULTIES[this.difficulty].drawCount;
    this.state.maxRecycle ??= DIFFICULTIES[this.difficulty].maxRecycle;
    this.ensureScoreState();
    if (this.state.gameStatus === "playing") this.startTimer();
    this.emit("load", { stuck: this.isStuck() });
    return true;
  }

  static isValidSavedState(value) {
    if (!value || !Array.isArray(value.stock) || !Array.isArray(value.waste) || !Array.isArray(value.tableau) || !Array.isArray(value.foundations)) return false;
    if (value.tableau.length !== 7 || value.foundations.length !== 4) return false;
    const cards = [...value.stock, ...value.waste, ...value.tableau.flat(), ...value.foundations.flat()];
    return cards.length === 52 && new Set(cards.map((card) => card.id)).size === 52;
  }
}
