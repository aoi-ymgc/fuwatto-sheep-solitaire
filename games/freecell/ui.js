import { formatTime } from "./rules.js";
import { FREECELL_DIFFICULTIES, FreeCellSolitaire } from "./freecell.js";
import { FREECELL_GAME_KEY, createAudioToggleSequence, loadJSON, noteFreecellClear, noteFreecellPlay, removeStored, saveJSON } from "../../js/storage.js";
import { sound } from "../../js/sound.js";
import { preloadCards } from "../../js/cards.js";
import { cleanRankingName, createAnonymousRankingName, fetchRankings, getRankingName, saveRankingName, submitRanking } from "../../js/rankings.js";

const $ = (selector) => document.querySelector(selector);
const piles = {
  freecells: [...document.querySelectorAll(".freecell-slot")],
  foundations: [...document.querySelectorAll(".foundation-slot")],
  tableau: [...document.querySelectorAll(".freecell-pile")],
};
const ui = {
  time: $("#time-display"), moves: $("#moves-display"), score: $("#score-display"), difficulty: $("#difficulty-label"), streak: $("#clear-streak-display"), undo: $("#undo-button"), hint: $("#hint-button"), sound: $("#sound-button"), message: $("#hint-message"), announcement: $("#game-announcement"), clear: $("#clear-modal"), confirm: $("#confirm-modal"), menu: $("#menu-modal"), howTo: $("#how-to-modal"), stuck: $("#stuck-modal"), ranking: $("#ranking-modal"), rankingEntry: $("#ranking-entry-modal"), rankingList: $("#ranking-list"), rankingMessage: $("#ranking-message"), rankingName: $("#ranking-name"), rankingEntrySummary: $("#ranking-entry-summary"), rankingSubmitMessage: $("#ranking-submit-message"), rankingSubmit: $("#ranking-submit"), rankingContinue: $("#ranking-continue-button"),
};
const RANKING_GAME = "freecell";
const RANKING_DIFFICULTY = "standard";
const audioToggleSequence = createAudioToggleSequence();
let game;
let state;
let selected = null;
let drag = null;
let suppressNextCardClick = false;
let lastHintKey = "";
let playRecorded = false;
let pendingRanking = null;
let awaitingContinuation = false;
let autoCompleting = false;
let autoCompletionTimer = null;
let autoCompletionRun = 0;

function difficultyLabel(difficulty) {
  return FREECELL_DIFFICULTIES?.[difficulty]?.label || "STANDARD";
}
function resetAudioToggleSequence() { audioToggleSequence.reset(); }
function announce(message) { ui.announcement.textContent = message; }
function saveGame() { saveJSON(FREECELL_GAME_KEY, game.serialize()); }
function sourceFromCard(card) {
  const { zone, pile, cardIndex } = card.dataset;
  return { type: zone, pile: Number(pile), ...(zone === "tableau" ? { cardIndex: Number(cardIndex) } : {}) };
}
function targetFromElement(element) {
  const target = element?.closest?.("[data-zone]");
  if (!target) return null;
  return { type: target.dataset.zone, pile: Number(target.dataset.pile) };
}
function tableauTop(pile, index) { return `calc(${index} * var(--card-step))`; }
function tableauHeight(pile) { return `calc(var(--card-h) + ${Math.max(0, pile.length - 1)} * var(--card-step))`; }
function createIndex(card, position) {
  const index = document.createElement("span");
  index.className = `freecell-card-index freecell-card-index--${position}`;
  index.setAttribute("aria-hidden", "true");
  const rank = document.createElement("b"); rank.textContent = card.rank;
  const symbol = document.createElement("i"); symbol.textContent = card.symbol;
  index.append(rank, symbol);
  return index;
}
function createCard(card, source, { top = "0" } = {}) {
  const node = document.createElement("button");
  node.type = "button";
  node.className = `card${card.color === "red" ? " is-red" : ""}`;
  node.dataset.zone = source.type;
  node.dataset.pile = String(source.pile);
  if (source.cardIndex !== undefined) node.dataset.cardIndex = String(source.cardIndex);
  node.dataset.cardId = card.id;
  node.style.top = top;
  node.style.zIndex = String((source.cardIndex ?? 0) + 1);
  node.style.backgroundImage = `url("${card.image}")`;
  node.setAttribute("aria-label", card.label);
  node.append(createIndex(card, "top"), createIndex(card, "bottom"));
  node.addEventListener("click", handleCardClick);
  node.addEventListener("pointerdown", startDrag);
  return node;
}
function clearPile(node) { node.replaceChildren(); node.classList.remove("is-drop-target"); }
function renderTableau(pile, index) {
  const node = piles.tableau[index];
  clearPile(node);
  node.style.minHeight = pile.length ? tableauHeight(pile) : "";
  const fragment = document.createDocumentFragment();
  pile.forEach((card, cardIndex) => fragment.append(createCard(card, { type: "tableau", pile: index, cardIndex }, { top: tableauTop(pile, cardIndex) })));
  node.append(fragment);
}
function renderSingle(node, card, type, pile) {
  clearPile(node);
  if (card) node.append(createCard(card, { type, pile }));
}
function render(nextState, meta = {}) {
  state = nextState;
  ui.time.textContent = formatTime(state.elapsedTime);
  if (meta.action === "tick") return;
  ui.moves.textContent = String(state.moves);
  ui.score.textContent = String(state.score);
  ui.streak.hidden = !state.clearStreak;
  ui.streak.textContent = `${state.clearStreak}連続クリア中`;
  ui.difficulty.textContent = difficultyLabel(state.difficulty);
  ui.undo.disabled = !state.history?.length || state.gameStatus === "completed";
  state.freeCells.forEach((card, index) => renderSingle(piles.freecells[index], card, "freecell", index));
  state.foundations.forEach((pile, index) => renderSingle(piles.foundations[index], pile.at(-1), "foundation", index));
  state.tableau.forEach(renderTableau);
  if (meta.stuck && !ui.stuck.open) ui.stuck.showModal();
  if ((meta.autoCompleteReady || game?.isAutoCompleteReady?.()) && !autoCompleting && state.gameStatus === "playing") startAutoCompletion();
}
function playForAction({ action, state: actionState, target }) {
  if (action !== "tick") lastHintKey = "";
  if (action !== "tick" && action !== "new-game" && actionState?.playRecorded && !playRecorded) { noteFreecellPlay(); playRecorded = true; }
  if (action === "move") sound[target?.type === "foundation" ? "foundation" : "card"]();
  else if (action === "new-game") sound.click();
  if (action !== "tick" && action !== "new-game" && actionState?.gameStatus !== "completed") saveGame();
}
function clearSelection() {
  selected = null;
  document.querySelectorAll(".is-selected, .is-drop-target").forEach((node) => node.classList.remove("is-selected", "is-drop-target"));
}
function pileForTarget(target) {
  if (target.type === "tableau") return piles.tableau[target.pile];
  if (target.type === "freecell") return piles.freecells[target.pile];
  if (target.type === "foundation") return piles.foundations[target.pile];
  return null;
}
function showTargets(source) {
  clearSelection();
  selected = source;
  const sourceId = source.type === "tableau" ? state.tableau[source.pile][source.cardIndex]?.id : source.type === "foundation" ? state.foundations[source.pile].at(-1)?.id : state.freeCells[source.pile]?.id;
  document.querySelector(`[data-card-id='${sourceId}']`)?.classList.add("is-selected");
  game.getValidTargets(source).forEach((target) => pileForTarget(target)?.classList.add("is-drop-target"));
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
  if (autoCompleting) return;
  if (suppressNextCardClick) { suppressNextCardClick = false; return; }
  const source = sourceFromCard(event.currentTarget);
  if (!game.sourceCards(source)) { sound.invalid(); return; }
  if (selected) {
    const target = { type: source.type, pile: source.pile };
    if (selected.type === source.type && selected.pile === source.pile && selected.cardIndex === source.cardIndex) { clearSelection(); return; }
    if (tryMove(selected, target)) { announce("カードを移動しました"); return; }
  }
  if (game.autoPlace(source)) { clearSelection(); announce("カードを置ける場所へ移動しました"); return; }
  showTargets(source);
  if (!game.getValidTargets(source).length) announce("このカードを置ける場所はありません");
}
function makeDragProxy(source) {
  const cards = game.sourceCards(source);
  const proxy = document.createElement("div");
  proxy.className = "freecell-drag-proxy";
  cards.forEach((card, index) => {
    const item = document.createElement("div");
    item.className = "freecell-drag-proxy__card";
    item.style.backgroundImage = `url("${card.image}")`;
    item.style.top = `calc(${index} * var(--drag-step))`;
    proxy.append(item);
  });
  document.body.append(proxy);
  return proxy;
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
  if (!drag.moved && Math.hypot(event.clientX - drag.origin.x, event.clientY - drag.origin.y) < 8) return;
  if (!drag.moved) {
    drag.moved = true;
    drag.proxy = makeDragProxy(drag.source);
    drag.card.classList.add("is-dragging");
    game.getValidTargets(drag.source).forEach((target) => pileForTarget(target)?.classList.add("is-drop-target"));
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
  document.querySelectorAll(".is-drop-target").forEach((node) => node.classList.remove("is-drop-target"));
  drag = null;
  if (!active.moved || event.type === "pointercancel") return;
  suppressNextCardClick = true;
  window.setTimeout(() => { suppressNextCardClick = false; }, 250);
  const target = targetFromElement(document.elementFromPoint(event.clientX, event.clientY));
  if (!target || !tryMove(active.source, target)) announce("カードは元の位置に戻りました");
}
function showHint() {
  resetAudioToggleSequence();
  if (autoCompleting) return;
  const hint = game.getHint();
  if (!hint) { ui.message.textContent = "いま移動できるカードはありません。"; return; }
  const key = `${hint.cardId}:${hint.target?.type || ""}:${hint.target?.pile ?? ""}`;
  if (key === lastHintKey) { ui.message.textContent = "表示中のヒントを試してみてください。"; return; }
  lastHintKey = key;
  document.querySelectorAll(".is-hinted").forEach((node) => node.classList.remove("is-hinted"));
  ui.message.textContent = `ヒント：${hint.text}`;
  document.querySelector(`[data-card-id='${hint.cardId}']`)?.classList.add("is-hinted");
  if (hint.target) pileForTarget(hint.target)?.classList.add("is-hinted");
}
function complete(result) {
  stopAutoCompletion();
  sound.clear();
  const records = noteFreecellClear(result);
  $("#clear-time").textContent = formatTime(result.elapsedTime);
  $("#clear-moves").textContent = result.moves;
  $("#clear-score").textContent = result.score;
  $("#record-message").textContent = records.bestTime === result.elapsedTime || records.fewestMoves === result.moves || records.highScore === result.score ? "NEW RECORD!" : "また遊んでね。";
  removeStored(FREECELL_GAME_KEY);
  pendingRanking = { game: RANKING_GAME, difficulty: RANKING_DIFFICULTY, score: result.score, elapsedTime: result.elapsedTime, moves: result.moves };
  awaitingContinuation = true;
  ui.rankingContinue.hidden = true;
  ui.clear.showModal();
}
function fillRankingRows(entries) {
  ui.rankingList.replaceChildren();
  if (!entries.length) { const row = document.createElement("tr"); const cell = document.createElement("td"); cell.colSpan = 5; cell.className = "ranking-empty"; cell.textContent = "まだ登録された記録はありません。"; row.append(cell); ui.rankingList.append(row); return; }
  entries.forEach((entry, index) => { const row = document.createElement("tr"); [entry.rank || index + 1, entry.name, entry.score, formatTime(entry.elapsedTime), entry.moves].forEach((value) => { const cell = document.createElement("td"); cell.textContent = String(value); row.append(cell); }); ui.rankingList.append(row); });
}
async function loadRankings() {
  ui.rankingMessage.textContent = "読み込み中…";
  ui.rankingList.replaceChildren();
  try { const entries = await fetchRankings(RANKING_GAME, RANKING_DIFFICULTY); fillRankingRows(entries); ui.rankingMessage.textContent = `上位${entries.length}件を表示しています。`; }
  catch (error) { ui.rankingMessage.textContent = error.message || "ランキングを読み込めませんでした。"; }
}
function openRankingEntry() {
  if (!pendingRanking) return;
  if (ui.clear.open) { ui.clear.returnValue = ""; ui.clear.close(); }
  const savedName = cleanRankingName(getRankingName());
  ui.rankingName.value = savedName || createAnonymousRankingName();
  ui.rankingName.dataset.autoName = String(!savedName);
  ui.rankingEntrySummary.textContent = `${pendingRanking.score}点 · ${formatTime(pendingRanking.elapsedTime)} · ${pendingRanking.moves}手`;
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
  ui.rankingSubmit.disabled = true;
  ui.rankingSubmitMessage.textContent = "登録中…";
  try {
    await submitRanking({ ...pendingRanking, name });
    saveRankingName(isAutoName ? "" : name);
    pendingRanking = null;
    ui.rankingEntry.close();
    ui.rankingContinue.hidden = !awaitingContinuation;
    ui.ranking.showModal();
    loadRankings();
    announce("ランキングに登録しました");
  } catch (error) { ui.rankingSubmitMessage.textContent = error.message || "ランキングを登録できませんでした。"; }
  finally { ui.rankingSubmit.disabled = false; }
}
function startNewGame({ continueStreak = false } = {}) {
  stopAutoCompletion();
  playRecorded = false;
  clearSelection();
  ui.message.textContent = "";
  if (!continueStreak) { awaitingContinuation = false; pendingRanking = null; ui.rankingContinue.hidden = true; }
  const clearStreak = continueStreak ? (state.clearStreak || 0) + 1 : audioToggleSequence.consumeNewGame();
  game.newGame({ clearStreak });
  saveGame();
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
function continueAfterClear() {
  if (!awaitingContinuation) return;
  awaitingContinuation = false;
  pendingRanking = null;
  ui.rankingContinue.hidden = true;
  if (ui.ranking.open) ui.ranking.close();
  startNewGame({ continueStreak: true });
}
function restoreClearChoices() { if (awaitingContinuation && pendingRanking && !ui.clear.open) { ui.clear.returnValue = ""; ui.clear.showModal(); } }
function wireUI() {
  [...piles.tableau, ...piles.freecells, ...piles.foundations].forEach((pile) => pile.addEventListener("click", (event) => {
    if (autoCompleting || event.target.closest(".card") || !selected) return;
    if (tryMove(selected, { type: pile.dataset.zone, pile: Number(pile.dataset.pile) })) announce("カードを移動しました");
  }));
  ui.undo.addEventListener("click", () => { resetAudioToggleSequence(); stopAutoCompletion(); clearSelection(); if (game.undo()) { sound.click(); saveGame(); } });
  ui.hint.addEventListener("click", showHint);
  ui.sound.addEventListener("click", () => { audioToggleSequence.recordToggle(); const on = sound.toggle(); ui.sound.textContent = `音 ${on ? "ON" : "OFF"}`; });
  $("#new-game-button").addEventListener("click", () => { if (state.moves || state.gameStatus === "playing") ui.confirm.showModal(); else startNewGame(); });
  ui.confirm.addEventListener("close", () => { if (ui.confirm.returnValue === "confirm") startNewGame(); });
  $("#menu-button").addEventListener("click", () => ui.menu.showModal());
  $("#how-to-button").addEventListener("click", () => { resetAudioToggleSequence(); ui.menu.close(); ui.howTo.showModal(); });
  $("#ranking-button").addEventListener("click", () => { resetAudioToggleSequence(); ui.menu.close(); ui.rankingContinue.hidden = true; ui.ranking.showModal(); loadRankings(); });
  $("#submit-ranking-button").addEventListener("click", () => { resetAudioToggleSequence(); openRankingEntry(); });
  $("#ranking-entry-form").addEventListener("submit", submitPendingRanking);
  ui.rankingName.addEventListener("input", () => { ui.rankingName.dataset.autoName = "false"; });
  $("#ranking-entry-cancel").addEventListener("click", () => ui.rankingEntry.close());
  $("#ranking-entry-close").addEventListener("click", () => ui.rankingEntry.close());
  ui.rankingEntry.addEventListener("close", restoreClearChoices);
  ui.rankingContinue.addEventListener("click", continueAfterClear);
  $("#menu-new-game").addEventListener("click", () => { ui.menu.close(); ui.confirm.showModal(); });
  ui.clear.addEventListener("close", () => { if (ui.clear.returnValue === "new-game") continueAfterClear(); });
  $("#stuck-undo").addEventListener("click", () => { resetAudioToggleSequence(); ui.stuck.close(); game.undo(); });
  ui.stuck.addEventListener("close", () => { if (ui.stuck.returnValue === "new-game") startNewGame(); });
  document.querySelectorAll("a[href='../../']").forEach((link) => link.addEventListener("click", () => { resetAudioToggleSequence(); removeStored(FREECELL_GAME_KEY); }));
}

game = new FreeCellSolitaire({ onChange: render, onComplete: complete, onAction: playForAction });
const saved = loadJSON(FREECELL_GAME_KEY, null);
if (saved && game.loadState(saved)) playRecorded = Boolean(saved.playRecorded);
else render(game.getState());
wireUI();
const preload = () => preloadCards([...state.freeCells.filter(Boolean), ...state.tableau.flat(), ...state.foundations.flat()]);
if ("requestIdleCallback" in window) window.requestIdleCallback(preload, { timeout: 1800 });
else window.setTimeout(preload, 400);
