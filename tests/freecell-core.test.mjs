import assert from "node:assert/strict";

const { createCard, RANKS } = await import("../js/cards.js");
const { FreeCellSolitaire, FREECELL_SCORE, createFreeCellDeck } = await import("../games/freecell/freecell.js");
const { canPlaceOnFoundation, canPlaceOnTableau, movableCardCapacity } = await import("../games/freecell/rules.js");

const faceUp = (suit, rank) => ({ ...createCard(suit, rank), faceUp: true });
const stateOf = ({ tableau = Array.from({ length: 8 }, () => []), freeCells = Array(4).fill(null), foundations = Array.from({ length: 4 }, () => []) } = {}) => ({
  tableau, freeCells, foundations, moves: 0, score: 0, elapsedTime: 0, gameStatus: "ready", playRecorded: false, history: [],
});

const deck = createFreeCellDeck({ random: () => .37 });
assert.equal(deck.length, 52, "FreeCellは52枚のデッキを使う");
assert.equal(new Set(deck.map((card) => card.id)).size, 52, "デッキに重複がない");

const game = new FreeCellSolitaire({ random: () => .37 });
let state = game.getState();
assert.deepEqual(state.tableau.map((pile) => pile.length), [7, 7, 7, 7, 6, 6, 6, 6], "標準の8列配札になる");
assert.equal(state.tableau.flat().length, 52, "開始時に全52枚が場札にある");
assert.ok(state.tableau.flat().every((card) => card.faceUp), "FreeCellは全カード表向き");
assert.deepEqual(state.freeCells, [null, null, null, null], "4つの空きセルで始まる");
assert.equal(state.difficulty, "standard", "標準難易度を状態に保存する");
assert.equal(game.setDifficulty("standard"), true, "STANDARDを選択できる");
game.newGame({ clearStreak: 10 });
assert.equal(game.getState().scoreMultiplier, 1.1, "10連続時はスコア倍率を状態に保存する");

assert.equal(canPlaceOnTableau(faceUp("S", "Q"), [faceUp("H", "K")]), true, "赤Kに黒Qを置ける");
assert.equal(canPlaceOnTableau(faceUp("C", "Q"), [faceUp("S", "K")]), false, "同色には置けない");
assert.equal(canPlaceOnTableau(faceUp("H", "5"), []), true, "空き列には任意のカードを置ける");
assert.equal(canPlaceOnFoundation(faceUp("S", "A"), []), true, "FoundationはAから開始");
assert.equal(canPlaceOnFoundation(faceUp("S", "2"), [faceUp("S", "A")]), true, "Foundationは同スート昇順");

game.state = stateOf({ tableau: [[faceUp("S", "Q")], [faceUp("H", "K")], ...Array.from({ length: 6 }, () => [])] });
assert.equal(game.moveTableauToTableau(0, 0, 1), true, "合法な場札移動ができる");
assert.equal(game.getState().tableau[1].at(-1).id, "S-Q");
assert.equal(game.undo(), true, "場札移動をUNDOできる");
assert.equal(game.getState().tableau[0].at(-1).id, "S-Q");

game.state = stateOf({ tableau: [[faceUp("S", "A")], ...Array.from({ length: 7 }, () => [])] });
assert.equal(game.move({ type: "tableau", pile: 0 }, { type: "freecell", pile: 0 }), true, "単体カードを空きセルへ移せる");
assert.equal(game.getState().freeCells[0].id, "S-A");
assert.equal(game.autoPlace({ type: "freecell", pile: 0 }), true, "空きセルのAをワンタップでFoundationへ移せる");
assert.equal(game.getState().foundations[0].at(-1).id, "S-A");
assert.equal(game.getState().score, FREECELL_SCORE.TO_FOUNDATION, "Foundation移動だけが10点加算される");

game.state = {
  ...stateOf({ tableau: [[faceUp("S", "A")], ...Array.from({ length: 7 }, () => [])] }),
  baseScore: 0, scoreMultiplier: 1.1, clearStreak: 10,
};
assert.equal(game.autoPlace({ type: "tableau", pile: 0 }), true, "連続クリア中もFoundationへ移せる");
assert.equal(game.getState().score, 11, "10連続時はFoundation加点にも倍率を反映する");

const capacityState = { freeCells: [faceUp("S", "A"), null, null, null], tableau: [[faceUp("H", "K")], [], [], [faceUp("S", "Q")], [faceUp("H", "J")], [faceUp("S", "10")], [faceUp("H", "9")], [faceUp("S", "8")]] };
assert.equal(movableCardCapacity({ ...capacityState, target: { type: "tableau", pile: 0 } }), 16, "空きセル3・空き列2なら16枚まで動かせる");
assert.equal(movableCardCapacity({ ...capacityState, target: { type: "tableau", pile: 1 } }), 8, "空き列を移動先にする場合はその列を補助に数えない");
game.state = stateOf({ tableau: [
  [faceUp("S", "Q"), faceUp("H", "J"), faceUp("S", "10"), faceUp("H", "9"), faceUp("S", "8"), faceUp("H", "7"), faceUp("S", "6")],
  [faceUp("H", "K")], [], [], [faceUp("S", "5")], [faceUp("H", "4")], [faceUp("S", "3")], [faceUp("H", "2")],
], freeCells: [faceUp("C", "A"), null, null, null] });
assert.equal(game.moveTableauToTableau(0, 0, 1), true, "容量以内の連続列を移動できる");
game.undo();
assert.equal(game.moveTableauToTableau(0, 0, 2), true, "空き列への7枚移動も宛先を除いた容量8枚以内なら可能");
game.state = stateOf({ tableau: [
  [faceUp("H", "K"), faceUp("S", "Q"), faceUp("H", "J"), faceUp("S", "10"), faceUp("H", "9"), faceUp("S", "8"), faceUp("H", "7"), faceUp("S", "6"), faceUp("H", "5")],
  [faceUp("S", "K")], [], [], [faceUp("S", "4")], [faceUp("H", "3")], [faceUp("S", "2")], [faceUp("H", "A")],
], freeCells: [faceUp("C", "A"), null, null, null] });
assert.equal(game.moveTableauToTableau(0, 0, 2), false, "空き列への9枚移動は宛先を除いた容量8枚を超えるため不可");

game.state = stateOf({ tableau: [[faceUp("S", "A")], ...Array.from({ length: 7 }, () => [])] });
assert.equal(game.autoPlace({ type: "tableau", pile: 0 }), true, "ワンタップはFoundationを優先する");
assert.equal(game.getState().foundations[0].at(-1).id, "S-A");

const completeSuit = (suit) => RANKS.map((rank) => faceUp(suit, rank));
game.state = stateOf({ tableau: [RANKS.slice().reverse().map((rank) => faceUp("S", rank)), [], [], [], [], [], [], []], foundations: [[], completeSuit("H"), completeSuit("D"), completeSuit("C")] });
assert.equal(game.isAutoCompleteReady(), true, "残りをFoundationへ順番に送れる時だけ自動完了できる");
let steps = 0;
while (game.autoCompleteStep()) steps += 1;
assert.equal(steps, 13, "自動完了は13枚を一枚ずつ送る");
assert.equal(game.getState().gameStatus, "completed", "4組そろうとクリアする");

game.newGame();
assert.equal(FreeCellSolitaire.isValidSavedState(game.serialize()), true, "通常のゲーム状態を保存できる");
const fresh = game.serialize();
assert.equal(game.loadState(fresh), true, "保存状態を復元できる");
game.dispose();

console.log("freecell core tests passed");
