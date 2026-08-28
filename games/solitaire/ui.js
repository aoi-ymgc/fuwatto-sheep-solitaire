import { formatTime } from "./rules.js";
import { DIFFICULTIES, KlondikeSolitaire } from "./solitaire.js";
import { createAudioToggleSequence, SOLITAIRE_GAME_KEY } from "../../js/storage.js";
import { sound } from "../../js/sound.js";
import { preloadCards } from "../../js/cards.js";
import { cleanRankingName, createAnonymousRankingName, fetchRankings, getRankingName, saveRankingName, submitRanking } from "../../js/rankings.js";

const $ = (selector) => document.querySelector(selector);
const board = $("#game-board");
const piles = {
  stock: $("[data-zone='stock']"),
  waste: $("[data-zone='waste']"),
  tableau: [...document.querySelectorAll(".tableau-pile")],
  foundations: [...document.querySelectorAll(".foundation-slot")],
};
const ui = {
  time: $("#time-display"), moves: $("#moves-display"), score: $("#score-display"), difficulty: $("#difficulty-label"), undo: $("#undo-button"), hint: $("#hint-button"), sound: $("#sound-button"), message: $("#hint-message"), announcement: $("#game-announcement"), clear: $("#clear-modal"), confirm: $("#confirm-modal"), menu: $("#menu-modal"), howTo: $("#how-to-modal"), difficultyModal: $("#difficulty-modal"),
  streak: $("#clear-streak-display"), stuck: $("#stuck-modal"), ranking: $("#ranking-modal"), rankingEntry: $("#ranking-entry-modal"), rankingDifficulty: $("#ranking-difficulty"), rankingList: $("#ranking-list"), rankingMessage: $("#ranking-message"), rankingName: $("#ranking-name"), rankingEntrySummary: $("#ranking-entry-summary"), rankingSubmitMessage: $("#ranking-submit-message"), rankingSubmit: $("#ranking-submit"), rankingContinue: $("#ranking-continue-button"),
};

let game;
let drag = null;
let state;
let suppressNextCardClick = false;
let lastHintKey = "";
let autoCompleting = false;
let autoCompletionTimer = null;
let autoCompletionRun = 0;
let pendingRanking = null;
let awaitingContinuation = false;
const RANKING_GAME = "solitaire";
const audioToggleSequence = createAudioToggleSequence();

function resetAudioToggleSequence() { audioToggleSequence.reset(); }

function targetFromElement(element) {
  const zone = element?.closest?.("[data-zone]");
  if (!zone || zone.dataset.zone === "stock" || zone.dataset.zone === "waste") return null;
  return { type: zone.dataset.zone, pile: Number(zone.dataset.pile) };
}
function sourceFromCard(card) {
  const { zone, pile, cardIndex } = card.dataset;
  if (zone === "tableau") return { type: zone, pile: Number(pile), cardIndex: Number(cardIndex) };
  if (zone === "foundation") return { type: zone, pile: Number(pile) };
  return { type: "waste" };
}
function topStyle(pile, index) {
  let down = 0; let up = 0;
  pile.slice(0, index).forEach((card) => { if (card.faceUp) up += 1; else down += 1; });
  return `calc(${down} * var(--card-step-back) + ${up} * var(--card-step-face))`;
}
function pileHeight(pile) { return `calc(var(--card-h) + ${pile.filter((card) => !card.faceUp).length} * var(--card-step-back) + ${pile.filter((card) => card.faceUp).length} * var(--card-step-face))`; }

function createCard(card, source, { top = "0" } = {}) {
  const node = document.createElement(source.type === "stock" ? "div" : "button");
  if (node instanceof HTMLButtonElement) node.type = "button";
  node.className = `card${card.faceUp ? "" : " card--back"}${card.color === "red" ? " is-red" : ""}`;
  node.dataset.zone = source.type;
  if (source.pile !== undefined) node.dataset.pile = source.pile;
  if (source.cardIndex !== undefined) node.dataset.cardIndex = source.cardIndex;
  node.dataset.cardId = card.id;
  node.dataset.rank = card.rank;
  node.dataset.symbol = card.symbol || "";
  node.style.top = top;
  node.style.zIndex = String((source.cardIndex ?? 0) + 1);
  node.style.backgroundImage = `url("${card.faceUp ? card.image : "../../assets/card-back.svg"}")`;
  node.setAttribute("aria-label", card.faceUp ? card.label : "裏向きのカード");
  if (node instanceof HTMLButtonElement) node.disabled = !card.faceUp;
  else node.setAttribute("aria-hidden", "true");
  if (card.faceUp) {
    ["top", "bottom"].forEach((position) => {
      const index = document.createElement("span");
      index.className = `card-index card-index--${position}`;
      index.setAttribute("aria-hidden", "true");
      const rank = document.createElement("b");
      rank.textContent = card.rank;
      const symbol = document.createElement("i");
      symbol.textContent = card.symbol;
      index.append(rank, symbol);
      node.append(index);
    });
  }
  if (card.faceUp) {
    node.addEventListener("click", handleCardClick);
    node.addEventListener("pointerdown", startDrag);
  }
  return node;
}

function clearPile(node) { node.replaceChildren(); node.classList.remove("is-drop-target"); }
function renderPile(node, pile, sourceType, pileIndex) {
  clearPile(node);
  node.style.minHeight = pile.length ? pileHeight(pile) : "";
  pile.forEach((card, cardIndex) => node.append(createCard(card, { type: sourceType, pile: pileIndex, cardIndex }, { top: topStyle(pile, cardIndex) })));
}
function render(stateNext, meta = {}) {
  state = stateNext;
  ui.time.textContent = formatTime(state.elapsedTime);
  if (meta.action === "tick") return;
  ui.moves.textContent = String(state.moves);
  ui.score.textContent = String(state.score);
  ui.streak.hidden = !state.clearStreak;
  ui.streak.textContent = `${state.clearStreak}連続クリア中`;
  ui.difficulty.textContent = DIFFICULTIES[state.difficulty]?.label || "EASY";
  ui.undo.disabled = !state.history.length || state.gameStatus === "completed";
  document.querySelectorAll("[data-difficulty]").forEach((button) => {
    const isCurrent = button.dataset.difficulty === state.difficulty;
    button.classList.toggle("is-current-difficulty", isCurrent);
    button.setAttribute("aria-pressed", String(isCurrent));
  });
  if (meta.stuck && !ui.stuck.open) ui.stuck.showModal();
  if (meta.autoCompleteReady && !autoCompleting) startAutoCompletion();
  clearPile(piles.stock);
  if (state.stock.length) piles.stock.append(createCard({ ...state.stock.at(-1), faceUp: false }, { type: "stock" }));
  clearPile(piles.waste);
  if (state.waste.length) piles.waste.append(createCard(state.waste.at(-1), { type: "waste" }));
  state.foundations.forEach((pile, index) => {
    clearPile(piles.foundations[index]);
    if (pile.length) piles.foundations[index].append(createCard(pile.at(-1), { type: "foundation", pile: index }));
  });
  state.tableau.forEach((pile, index) => renderPile(piles.tableau[index], pile, "tableau", index));
  if (meta.action && meta.action !== "tick") game?.save(SOLITAIRE_GAME_KEY);
  if (meta.revealed) {
    document.querySelector(`.tableau-pile[data-pile='${meta.source.pile}'] .card:last-child`)?.classList.add("is-flipping");
  }
}

function announce(message) { ui.announcement.textContent = message; }
function playForAction({ action, target, revealed }) {
  if (action !== "tick") lastHintKey = "";
  if (action === "stock") { sound.stock(); return; }
  if (action === "move") { target?.type === "foundation" ? sound.foundation() : sound.card(); if (revealed) sound.flip(); return; }
  if (action === "new-game") sound.click();
}
function tryMove(source, target) {
  resetAudioToggleSequence();
  const moved = game.move(source, target);
  if (!moved) { sound.invalid(); announce("そこには置けません"); render(game.getState()); }
  return moved;
}
function handleCardClick(event) {
  resetAudioToggleSequence();
  if (autoCompleting) return;
  if (suppressNextCardClick) { suppressNextCardClick = false; return; }
  const source = sourceFromCard(event.currentTarget);
  if (game.autoPlace(source)) {
    announce("カードを置ける場所へ移動しました");
    return;
  }
  sound.invalid();
  announce("このカードを置ける場所はありません");
}
function makeDragProxy(source) {
  const cards = game.sourceCards(source);
  const proxy = document.createElement("div");
  proxy.className = "drag-proxy";
  proxy.style.setProperty("--count", String(cards.length));
  cards.forEach((card, index) => {
    const piece = document.createElement("div");
    piece.className = "drag-proxy__card";
    piece.style.backgroundImage = `url("${card.image}")`;
    piece.style.top = `calc(${index} * var(--drag-step))`;
    proxy.append(piece);
  });
  document.body.append(proxy);
  return proxy;
}
function dragTargets(source) {
  document.querySelectorAll(".is-drop-target").forEach((node) => node.classList.remove("is-drop-target"));
  game.getValidTargets(source).forEach((target) => (target.type === "tableau" ? piles.tableau[target.pile] : piles.foundations[target.pile]).classList.add("is-drop-target"));
}
function startDrag(event) {
  resetAudioToggleSequence();
  if (autoCompleting) return;
  if (event.button !== undefined && event.button !== 0) return;
  const source = sourceFromCard(event.currentTarget);
  if (!game.sourceCards(source)) return;
  drag = { source, origin: { x: event.clientX, y: event.clientY }, moved: false, pointerId: event.pointerId, card: event.currentTarget, proxy: null };
  event.currentTarget.setPointerCapture?.(event.pointerId);
  event.currentTarget.addEventListener("pointermove", moveDrag);
  event.currentTarget.addEventListener("pointerup", endDrag, { once: true });
  event.currentTarget.addEventListener("pointercancel", endDrag, { once: true });
}
function moveDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const distance = Math.hypot(event.clientX - drag.origin.x, event.clientY - drag.origin.y);
  if (!drag.moved && distance < 8) return;
  if (!drag.moved) { drag.moved = true; drag.proxy = makeDragProxy(drag.source); drag.card.classList.add("is-dragging"); dragTargets(drag.source); document.body.classList.add("is-dragging-card"); }
  drag.proxy.style.left = `${event.clientX - 24}px`;
  drag.proxy.style.top = `${event.clientY - 28}px`;
  event.preventDefault();
}
function endDrag(event) {
  const active = drag;
  if (!active || event.pointerId !== active.pointerId) return;
  active.card.removeEventListener("pointermove", moveDrag);
  active.card.classList.remove("is-dragging");
  active.proxy?.remove();
  document.body.classList.remove("is-dragging-card");
  document.querySelectorAll(".is-drop-target").forEach((node) => node.classList.remove("is-drop-target"));
  drag = null;
  if (!active.moved || event.type === "pointercancel") return;
  suppressNextCardClick = true;
  window.setTimeout(() => { suppressNextCardClick = false; }, 0);
  const target = targetFromElement(document.elementFromPoint(event.clientX, event.clientY));
  if (!target || !tryMove(active.source, target)) announce("カードは元の位置に戻りました");
}
function showHint() {
  resetAudioToggleSequence();
  const hint = game.getHint();
  if (!hint) { ui.message.textContent = "いま移動できるカードはありません。"; return; }
  const hintKey = hint.type === "stock" ? "stock" : `${hint.cardId}:${hint.target?.type ?? ""}:${hint.target?.pile ?? ""}`;
  if (hintKey === lastHintKey) { ui.message.textContent = "表示中のヒントを試してみてください。"; return; }
  lastHintKey = hintKey;
  document.querySelectorAll(".is-hinted").forEach((node) => node.classList.remove("is-hinted"));
  ui.message.textContent = `ヒント：${hint.text}`;
  if (hint.type === "stock") { piles.stock.classList.add("is-hinted"); return; }
  document.querySelector(`[data-card-id='${hint.cardId}']`)?.classList.add("is-hinted");
  if (hint.target) (hint.target.type === "tableau" ? piles.tableau[hint.target.pile] : piles.foundations[hint.target.pile]).classList.add("is-hinted");
}
function complete(result) {
  stopAutoCompletion();
  sound.clear();
  $("#clear-time").textContent = formatTime(result.elapsedTime);
  $("#clear-moves").textContent = result.moves;
  $("#clear-score").textContent = result.score;
  const record = result.records;
  $("#record-message").textContent = record.bestTime === result.elapsedTime || record.fewestMoves === result.moves || record.highScore === result.score ? "NEW RECORD!" : "また遊んでね。";
  game.clearSavedGame();
  pendingRanking = { game: RANKING_GAME, difficulty: result.difficulty || state.difficulty, score: result.score, elapsedTime: result.elapsedTime, moves: result.moves };
  awaitingContinuation = true;
  ui.rankingContinue.hidden = true;
  ui.clear.showModal();
}
function fillRankingRows(entries) {
  ui.rankingList.replaceChildren();
  if (!entries.length) {
    const row = document.createElement("tr"); const cell = document.createElement("td");
    cell.colSpan = 5; cell.className = "ranking-empty"; cell.textContent = "まだ登録された記録はありません。";
    row.append(cell); ui.rankingList.append(row); return;
  }
  entries.forEach((entry, index) => {
    const row = document.createElement("tr");
    [entry.rank || index + 1, entry.name, entry.score, formatTime(entry.elapsedTime), entry.moves].forEach((value) => {
      const cell = document.createElement("td"); cell.textContent = String(value); row.append(cell);
    });
    ui.rankingList.append(row);
  });
}
async function loadRankings() {
  ui.rankingMessage.textContent = "読み込み中…";
  ui.rankingList.replaceChildren();
  try {
    const entries = await fetchRankings(RANKING_GAME, ui.rankingDifficulty.value);
    fillRankingRows(entries);
    ui.rankingMessage.textContent = `上位${entries.length}件を表示しています。`;
  } catch (error) { ui.rankingMessage.textContent = error.message || "ランキングを読み込めませんでした。"; }
}
function openRankingEntry() {
  if (!pendingRanking) return;
  if (ui.clear.open) {
    ui.clear.returnValue = "";
    ui.clear.close();
  }
  const savedName = cleanRankingName(getRankingName());
  ui.rankingName.value = savedName || createAnonymousRankingName();
  ui.rankingName.dataset.autoName = String(!savedName);
  ui.rankingEntrySummary.textContent = `${DIFFICULTIES[pendingRanking.difficulty]?.label || "EASY"} · ${pendingRanking.score}点 · ${formatTime(pendingRanking.elapsedTime)} · ${pendingRanking.moves}手`;
  ui.rankingSubmitMessage.textContent = "";
  ui.rankingEntry.showModal();
  window.setTimeout(() => ui.rankingName.focus(), 0);
}
async function submitPendingRanking(event) {
  event.preventDefault();
  if (!pendingRanking) return;
  const enteredName = cleanRankingName(ui.rankingName.value);
  const isAutoName = !enteredName || ui.rankingName.dataset.autoName === "true";
  const name = enteredName || createAnonymousRankingName();
  ui.rankingName.value = name;
  ui.rankingSubmit.disabled = true;
  ui.rankingSubmitMessage.textContent = "登録中…";
  try {
    await submitRanking({ ...pendingRanking, name });
    saveRankingName(isAutoName ? "" : name);
    const difficulty = pendingRanking.difficulty;
    pendingRanking = null;
    ui.rankingEntry.close();
    ui.rankingDifficulty.value = difficulty;
    ui.rankingContinue.hidden = !awaitingContinuation;
    ui.ranking.showModal();
    loadRankings();
    announce("ランキングに登録しました");
  } catch (error) { ui.rankingSubmitMessage.textContent = error.message || "ランキングを登録できませんでした。"; }
  finally { ui.rankingSubmit.disabled = false; }
}
function startAutoCompletion() {
  stopAutoCompletion();
  autoCompleting = true;
  const run = autoCompletionRun;
  ui.message.textContent = "クリアまでカードを自動で揃えます。";
  const step = () => {
    if (!autoCompleting || run !== autoCompletionRun || !game.autoCompleteStep()) { stopAutoCompletion(); return; }
    autoCompletionTimer = window.setTimeout(step, 115);
  };
  autoCompletionTimer = window.setTimeout(step, 180);
}
function stopAutoCompletion() {
  autoCompleting = false;
  autoCompletionRun += 1;
  if (autoCompletionTimer !== null) window.clearTimeout(autoCompletionTimer);
  autoCompletionTimer = null;
}
function startNewGame({ continueStreak = false } = {}) {
  stopAutoCompletion();
  ui.message.textContent = "";
  if (!continueStreak) {
    awaitingContinuation = false;
    pendingRanking = null;
    ui.rankingContinue.hidden = true;
  }
  const clearStreak = continueStreak ? (state.clearStreak || 0) + 1 : audioToggleSequence.consumeNewGame();
  game.newGame({ clearStreak });
}
function continueAfterClear() {
  if (!awaitingContinuation) return;
  awaitingContinuation = false;
  pendingRanking = null;
  ui.rankingContinue.hidden = true;
  if (ui.ranking.open) ui.ranking.close();
  startNewGame({ continueStreak: true });
}
function restoreClearChoices() {
  if (!awaitingContinuation || !pendingRanking || ui.clear.open) return;
  ui.clear.returnValue = "";
  ui.clear.showModal();
}
function stockUnavailableMessage() {
  if (state.stock.length === 0 && state.waste.length && state.maxRecycle !== null && state.recycleCount >= state.maxRecycle) return "この難易度では山札の再利用回数を使い切りました";
  return "山札も捨て札もありません";
}

function wireUI() {
  piles.stock.addEventListener("click", () => { resetAudioToggleSequence(); if (!autoCompleting && !game.drawStock()) { sound.invalid(); announce(stockUnavailableMessage()); } });
  piles.stock.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); piles.stock.click(); } });
  ui.undo.addEventListener("click", () => { resetAudioToggleSequence(); if (autoCompleting) return; if (game.undo()) sound.click(); });
  ui.hint.addEventListener("click", () => { if (!autoCompleting) showHint(); });
  ui.sound.addEventListener("click", () => { audioToggleSequence.recordToggle(); const on = sound.toggle(); ui.sound.textContent = `音 ${on ? "ON" : "OFF"}`; ui.sound.setAttribute("aria-label", `サウンドを${on ? "オフ" : "オン"}にする`); });
  $("#new-game-button").addEventListener("click", () => { if (autoCompleting) return; if (state.moves || state.gameStatus === "playing") ui.confirm.showModal(); else startNewGame(); });
  ui.confirm.addEventListener("close", () => { if (ui.confirm.returnValue === "confirm") startNewGame(); });
  $("#menu-button").addEventListener("click", () => { if (!autoCompleting) ui.menu.showModal(); });
  $("#how-to-button").addEventListener("click", () => { resetAudioToggleSequence(); ui.menu.close(); ui.howTo.showModal(); });
  $("#difficulty-button").addEventListener("click", () => { resetAudioToggleSequence(); ui.menu.close(); ui.difficultyModal.showModal(); });
  $("#ranking-button").addEventListener("click", () => { resetAudioToggleSequence(); ui.menu.close(); ui.rankingContinue.hidden = true; ui.rankingDifficulty.value = state.difficulty; ui.ranking.showModal(); loadRankings(); });
  $("#ranking-refresh").addEventListener("click", () => { resetAudioToggleSequence(); loadRankings(); });
  ui.rankingDifficulty.addEventListener("change", () => { resetAudioToggleSequence(); loadRankings(); });
  $("#submit-ranking-button").addEventListener("click", () => { resetAudioToggleSequence(); openRankingEntry(); });
  $("#ranking-entry-form").addEventListener("submit", submitPendingRanking);
  ui.rankingName.addEventListener("input", () => { ui.rankingName.dataset.autoName = "false"; });
  $("#ranking-entry-cancel").addEventListener("click", () => ui.rankingEntry.close());
  $("#ranking-entry-close").addEventListener("click", () => ui.rankingEntry.close());
  ui.rankingEntry.addEventListener("close", restoreClearChoices);
  ui.rankingContinue.addEventListener("click", continueAfterClear);
  document.querySelectorAll("[data-difficulty]").forEach((button) => button.addEventListener("click", () => {
    resetAudioToggleSequence();
    const difficulty = button.dataset.difficulty;
    ui.difficultyModal.close();
    stopAutoCompletion();
    game.setDifficulty(difficulty);
    announce(`${DIFFICULTIES[difficulty].label}で新しいゲームを始めました`);
  }));
  $("#menu-new-game").addEventListener("click", () => { ui.menu.close(); ui.confirm.showModal(); });
  ui.clear.addEventListener("close", () => { if (ui.clear.returnValue === "new-game") continueAfterClear(); });
  $("#stuck-undo").addEventListener("click", () => { resetAudioToggleSequence(); ui.stuck.close(); game.undo(); });
  ui.stuck.addEventListener("close", () => { if (ui.stuck.returnValue === "new-game") startNewGame(); });
  document.querySelectorAll("a[href='../../']").forEach((link) => link.addEventListener("click", () => { resetAudioToggleSequence(); game.clearSavedGame(); }));
}

game = new KlondikeSolitaire({ onChange: render, onComplete: complete, onAction: playForAction });
if (!game.load()) render(game.getState());
wireUI();

const allCards = () => {
  const current = game.getState();
  return [...current.stock, ...current.waste, ...current.tableau.flat(), ...current.foundations.flat()];
};
const preload = () => preloadCards(allCards());
if ("requestIdleCallback" in window) window.requestIdleCallback(preload, { timeout: 1800 });
else window.setTimeout(preload, 400);
