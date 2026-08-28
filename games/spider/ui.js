import { formatTime } from "./rules.js";
import { SPIDER_DIFFICULTIES, SpiderSolitaire } from "./spider.js";
import { SPIDER_GAME_KEY, createAudioToggleSequence, loadJSON, noteSpiderClear, noteSpiderPlay, removeStored, saveJSON } from "../../js/storage.js";
import { sound } from "../../js/sound.js";
import { preloadCards } from "../../js/cards.js";
import { cleanRankingName, createAnonymousRankingName, fetchRankings, getRankingName, saveRankingName, submitRanking } from "../../js/rankings.js";

const $ = (selector) => document.querySelector(selector);
const piles = {
  stock: $(".spider-stock"),
  tableau: [...document.querySelectorAll(".spider-pile")],
  completed: [...document.querySelectorAll(".completed-slot")],
};
const ui = {
  time: $("#time-display"), moves: $("#moves-display"), score: $("#score-display"), difficulty: $("#difficulty-label"), streak: $("#clear-streak-display"), stockCount: $("#stock-count"), completedCount: $("#completed-count"), undo: $("#undo-button"), hint: $("#hint-button"), sound: $("#sound-button"), message: $("#hint-message"), announcement: $("#game-announcement"), clear: $("#clear-modal"), confirm: $("#confirm-modal"), menu: $("#menu-modal"), howTo: $("#how-to-modal"), difficultyModal: $("#difficulty-modal"), stuck: $("#stuck-modal"), ranking: $("#ranking-modal"), rankingEntry: $("#ranking-entry-modal"), rankingDifficulty: $("#ranking-difficulty"), rankingList: $("#ranking-list"), rankingMessage: $("#ranking-message"), rankingName: $("#ranking-name"), rankingEntrySummary: $("#ranking-entry-summary"), rankingSubmitMessage: $("#ranking-submit-message"), rankingSubmit: $("#ranking-submit"), rankingContinue: $("#ranking-continue-button"),
};

let game;
let state;
let selected = null;
let drag = null;
let suppressNextCardClick = false;
let lastHintKey = "";
let playRecorded = false;
let pendingRanking = null;
let awaitingContinuation = false;
const RANKING_GAME = "spider";
const audioToggleSequence = createAudioToggleSequence();

function resetAudioToggleSequence() { audioToggleSequence.reset(); }

function sourceFromCard(card) { return { type: "tableau", pile: Number(card.dataset.pile), cardIndex: Number(card.dataset.cardIndex) }; }
function targetFromElement(element) {
  const pile = element?.closest?.(".spider-pile");
  return pile ? { type: "tableau", pile: Number(pile.dataset.pile) } : null;
}
function topStyle(pile, index) {
  let down = 0; let up = 0;
  pile.slice(0, index).forEach((card) => { if (card.faceUp) up += 1; else down += 1; });
  return `calc(${down} * var(--card-step-back) + ${up} * var(--card-step-face))`;
}
function pileHeight(pile) { return `calc(var(--card-h) + ${pile.filter((card) => !card.faceUp).length} * var(--card-step-back) + ${Math.max(0, pile.filter((card) => card.faceUp).length - 1)} * var(--card-step-face))`; }
function createIndex(card) {
  const index = document.createElement("span");
  index.className = "spider-card-index";
  index.setAttribute("aria-hidden", "true");
  const rank = document.createElement("b"); rank.textContent = card.rank;
  const symbol = document.createElement("i"); symbol.textContent = card.symbol;
  index.append(rank, symbol);
  return index;
}
function createCard(card, pile, cardIndex) {
  const node = document.createElement("button");
  node.type = "button";
  node.className = `spider-card${card.faceUp ? "" : " spider-card--back"}${card.color === "red" ? " is-red" : ""}`;
  node.dataset.zone = "tableau";
  node.dataset.pile = String(pile);
  node.dataset.cardIndex = String(cardIndex);
  node.dataset.cardId = card.id;
  node.style.top = topStyle(state.tableau[pile], cardIndex);
  node.style.zIndex = String(cardIndex + 1);
  node.style.backgroundImage = `url("${card.faceUp ? card.image : "../../assets/card-back.svg"}")`;
  node.setAttribute("aria-label", card.faceUp ? card.label : "裏向きのカード");
  node.disabled = !card.faceUp;
  if (card.faceUp) {
    node.append(createIndex(card));
    node.addEventListener("click", handleCardClick);
    node.addEventListener("pointerdown", startDrag);
  }
  return node;
}
function clearPile(node) { node.replaceChildren(); node.classList.remove("is-drop-target"); }
function renderPile(node, pile, pileIndex) {
  clearPile(node);
  node.style.minHeight = pile.length ? pileHeight(pile) : "";
  const fragment = document.createDocumentFragment();
  pile.forEach((card, cardIndex) => fragment.append(createCard(card, pileIndex, cardIndex)));
  node.append(fragment);
}
function render(nextState, meta = {}) {
  state = nextState;
  ui.time.textContent = formatTime(state.elapsedTime);
  if (meta.action === "tick") return;
  ui.moves.textContent = String(state.moves);
  ui.score.textContent = String(state.score);
  ui.streak.hidden = !state.clearStreak;
  ui.streak.textContent = `${state.clearStreak}連続クリア中`;
  ui.stockCount.textContent = String(Math.floor(state.stock.length / 10));
  piles.stock.classList.toggle("is-empty", state.stock.length < 10);
  piles.stock.setAttribute("aria-disabled", String(state.stock.length < 10));
  ui.completedCount.textContent = String(state.completed.length);
  ui.difficulty.textContent = SPIDER_DIFFICULTIES[state.difficulty]?.label || "1 SUIT";
  ui.undo.disabled = !state.history.length || state.gameStatus === "completed";
  piles.completed.forEach((slot, index) => slot.classList.toggle("is-complete", index < state.completed.length));
  document.querySelectorAll("[data-difficulty]").forEach((button) => {
    const active = button.dataset.difficulty === state.difficulty;
    button.classList.toggle("is-current-difficulty", active);
    button.setAttribute("aria-pressed", String(active));
  });
  state.tableau.forEach((pile, pileIndex) => renderPile(piles.tableau[pileIndex], pile, pileIndex));
  if (meta.stuck && !ui.stuck.open) ui.stuck.showModal();
  if (meta.removed?.length) ui.message.textContent = `${meta.removed.length}組完成しました！`;
}
function announce(message) { ui.announcement.textContent = message; }
function saveGame() { saveJSON(SPIDER_GAME_KEY, game.serialize()); }
function playForAction({ action, state: actionState, removed }) {
  if (action !== "tick") lastHintKey = "";
  if (action !== "new-game" && action !== "tick" && actionState.playRecorded && !playRecorded) { noteSpiderPlay(); playRecorded = true; }
  if (action === "stock") sound.stock();
  else if (action === "move") { removed?.length ? sound.foundation() : sound.card(); }
  else if (action === "new-game") sound.click();
  if (action !== "tick" && action !== "new-game" && actionState.gameStatus !== "completed") saveGame();
}
function complete(result) {
  sound.clear();
  const records = noteSpiderClear(result);
  $("#clear-time").textContent = formatTime(result.elapsedTime);
  $("#clear-moves").textContent = result.moves;
  $("#clear-score").textContent = result.score;
  $("#record-message").textContent = records.bestTime === result.elapsedTime || records.fewestMoves === result.moves || records.highScore === result.score ? "NEW RECORD!" : "また遊んでね。";
  removeStored(SPIDER_GAME_KEY);
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
  ui.rankingEntrySummary.textContent = `${SPIDER_DIFFICULTIES[pendingRanking.difficulty]?.label || "1 SUIT"} · ${pendingRanking.score}点 · ${formatTime(pendingRanking.elapsedTime)} · ${pendingRanking.moves}手`;
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
function clearSelection() {
  selected = null;
  document.querySelectorAll(".is-selected, .is-drop-target").forEach((node) => node.classList.remove("is-selected", "is-drop-target"));
}
function showTargets(source) {
  clearSelection();
  selected = source;
  document.querySelector(`[data-card-id='${state.tableau[source.pile][source.cardIndex]?.id}']`)?.classList.add("is-selected");
  game.getValidTargets(source).forEach((target) => piles.tableau[target.pile].classList.add("is-drop-target"));
}
function tryMove(source, target) {
  resetAudioToggleSequence();
  const moved = game.move(source, target);
  clearSelection();
  if (!moved) { sound.invalid(); announce("そこには置けません"); }
  return moved;
}
function handleCardClick(event) {
  resetAudioToggleSequence();
  if (suppressNextCardClick) { suppressNextCardClick = false; return; }
  const source = sourceFromCard(event.currentTarget);
  if (!game.sourceCards(source)) { sound.invalid(); return; }
  if (selected) {
    const target = { type: "tableau", pile: source.pile };
    if (selected.pile === source.pile && selected.cardIndex === source.cardIndex) { clearSelection(); return; }
    if (tryMove(selected, target)) { announce("カードを移動しました"); return; }
  }
  showTargets(source);
  if (!game.getValidTargets(source).length) announce("このカードを置ける場所はありません");
}
function makeDragProxy(source) {
  const cards = game.sourceCards(source);
  const proxy = document.createElement("div");
  proxy.className = "spider-drag-proxy";
  proxy.style.setProperty("--count", String(cards.length));
  cards.forEach((card, index) => {
    const item = document.createElement("div");
    item.className = "spider-drag-proxy__card";
    item.style.backgroundImage = `url("${card.image}")`;
    item.style.top = `calc(${index} * var(--drag-step))`;
    proxy.append(item);
  });
  document.body.append(proxy);
  return proxy;
}
function startDrag(event) {
  resetAudioToggleSequence();
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
  if (!drag.moved) {
    drag.moved = true;
    drag.proxy = makeDragProxy(drag.source);
    drag.card.classList.add("is-dragging");
    game.getValidTargets(drag.source).forEach((target) => piles.tableau[target.pile].classList.add("is-drop-target"));
    document.body.classList.add("is-dragging-card");
  }
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
  drag = null;
  document.querySelectorAll(".is-drop-target").forEach((node) => node.classList.remove("is-drop-target"));
  if (!active.moved || event.type === "pointercancel") return;
  suppressNextCardClick = true;
  window.setTimeout(() => { suppressNextCardClick = false; }, 250);
  const target = targetFromElement(document.elementFromPoint(event.clientX, event.clientY));
  if (!target || !tryMove(active.source, target)) announce("カードは元の位置に戻りました");
}
function showHint() {
  resetAudioToggleSequence();
  const hint = game.getHint();
  if (!hint) { ui.message.textContent = "いま移動できるカードはありません。"; return; }
  const key = hint.type === "stock" ? "stock" : `${hint.cardId}:${hint.target.pile}`;
  if (key === lastHintKey) { ui.message.textContent = "表示中のヒントを試してみてください。"; return; }
  lastHintKey = key;
  document.querySelectorAll(".is-hinted").forEach((node) => node.classList.remove("is-hinted"));
  ui.message.textContent = `ヒント：${hint.text}`;
  if (hint.type === "stock") { piles.stock.classList.add("is-hinted"); return; }
  document.querySelector(`[data-card-id='${hint.cardId}']`)?.classList.add("is-hinted");
  piles.tableau[hint.target.pile].classList.add("is-hinted");
}
function startNewGame(difficulty = game.difficulty, { continueStreak = false } = {}) {
  playRecorded = false;
  clearSelection();
  ui.message.textContent = "";
  if (!continueStreak) {
    awaitingContinuation = false;
    pendingRanking = null;
    ui.rankingContinue.hidden = true;
  }
  const clearStreak = continueStreak ? (state.clearStreak || 0) + 1 : audioToggleSequence.consumeNewGame();
  game.newGame({ difficulty, clearStreak });
  saveGame();
}
function continueAfterClear() {
  if (!awaitingContinuation) return;
  awaitingContinuation = false;
  pendingRanking = null;
  ui.rankingContinue.hidden = true;
  if (ui.ranking.open) ui.ranking.close();
  startNewGame(game.difficulty, { continueStreak: true });
}
function restoreClearChoices() {
  if (!awaitingContinuation || !pendingRanking || ui.clear.open) return;
  ui.clear.returnValue = "";
  ui.clear.showModal();
}
function stockUnavailableMessage() {
  return state.tableau.some((pile) => pile.length === 0) ? "空の列を埋めてから山札を配ってください" : "山札はありません";
}
function wireUI() {
  piles.stock.addEventListener("click", () => { resetAudioToggleSequence(); if (!game.dealStock()) { sound.invalid(); announce(stockUnavailableMessage()); } });
  piles.tableau.forEach((pile) => pile.addEventListener("click", (event) => {
    if (event.target.closest(".spider-card") || !selected) return;
    if (tryMove(selected, { type: "tableau", pile: Number(pile.dataset.pile) })) announce("空いた列へカードを移動しました");
  }));
  ui.undo.addEventListener("click", () => { resetAudioToggleSequence(); clearSelection(); if (game.undo()) { sound.click(); saveGame(); } });
  ui.hint.addEventListener("click", showHint);
  ui.sound.addEventListener("click", () => { audioToggleSequence.recordToggle(); const on = sound.toggle(); ui.sound.textContent = `音 ${on ? "ON" : "OFF"}`; });
  $("#new-game-button").addEventListener("click", () => { if (state.moves || state.gameStatus === "playing") ui.confirm.showModal(); else startNewGame(); });
  ui.confirm.addEventListener("close", () => { if (ui.confirm.returnValue === "confirm") startNewGame(); });
  $("#menu-button").addEventListener("click", () => ui.menu.showModal());
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
    ui.difficultyModal.close();
    startNewGame(button.dataset.difficulty);
    announce(`${SPIDER_DIFFICULTIES[button.dataset.difficulty].label}で新しいゲームを始めました`);
  }));
  $("#menu-new-game").addEventListener("click", () => { ui.menu.close(); ui.confirm.showModal(); });
  ui.clear.addEventListener("close", () => { if (ui.clear.returnValue === "new-game") continueAfterClear(); });
  $("#stuck-undo").addEventListener("click", () => { resetAudioToggleSequence(); ui.stuck.close(); game.undo(); });
  ui.stuck.addEventListener("close", () => { if (ui.stuck.returnValue === "new-game") startNewGame(); });
  document.querySelectorAll("a[href='../../']").forEach((link) => link.addEventListener("click", () => { resetAudioToggleSequence(); removeStored(SPIDER_GAME_KEY); }));
}

game = new SpiderSolitaire({ onChange: render, onComplete: complete, onAction: playForAction });
const saved = loadJSON(SPIDER_GAME_KEY, null);
if (saved && game.loadState(saved)) playRecorded = Boolean(saved.playRecorded);
else render(game.getState());
wireUI();

const preload = () => preloadCards([...state.stock, ...state.tableau.flat(), ...state.completed.flat()]);
if ("requestIdleCallback" in window) window.requestIdleCallback(preload, { timeout: 1800 });
else window.setTimeout(preload, 400);
