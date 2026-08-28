import assert from "node:assert/strict";

const { createCard, RANKS } = await import("../js/cards.js");
const { SpiderSolitaire, SPIDER_SCORE, createSpiderDeck } = await import("../games/spider/spider.js");
const { canPlaceOnTableau, isCompleteSequence, isMovableRun } = await import("../games/spider/rules.js");

const faceUp = (suit, rank, set = 1) => ({ ...createCard(suit, rank), id: `test-${set}-${suit}-${rank}`, faceUp: true });
const faceDown = (suit, rank, set = 1) => ({ ...faceUp(suit, rank, set), faceUp: false });
const makeState = ({ stock = [], tableau = Array.from({ length: 10 }, () => []), completed = [], score = SPIDER_SCORE.START } = {}) => ({
  stock, tableau, completed, moves: 0, score, elapsedTime: 0, gameStatus: "ready", playRecorded: false, history: [], difficulty: "easy", suitCount: 1,
});

for (const suitCount of [1, 2, 4]) {
  const deck = createSpiderDeck({ suitCount, random: () => .37 });
  assert.equal(deck.length, 104, `${suitCount}スートは104枚`);
  assert.equal(new Set(deck.map((card) => card.id)).size, 104, `${suitCount}スートでもカードIDは一意`);
}

const game = new SpiderSolitaire({ random: () => .37 });
let state = game.getState();
assert.equal(state.stock.length, 50, "開始時の山札は50枚");
assert.deepEqual(state.tableau.map((pile) => pile.length), [6, 6, 6, 6, 5, 5, 5, 5, 5, 5], "10列に54枚を標準配札する");
assert.ok(state.tableau.every((pile) => pile.at(-1).faceUp && pile.slice(0, -1).every((card) => !card.faceUp)), "各列の最上段のみ表向き");
assert.equal(state.score, 500, "スコアは500点から開始");
game.newGame({ clearStreak: 10 });
assert.equal(game.getState().score, 550, "10連続時は開始スコアにも連続ボーナスを反映する");
assert.equal(game.getState().clearStreak, 10, "連続クリア数をゲーム状態に保存する");
game.newGame();

assert.equal(game.setDifficulty("normal"), true, "2スート難易度を選べる");
assert.equal(game.getState().suitCount, 2);
assert.equal(game.setDifficulty("hard"), true, "4スート難易度を選べる");
assert.equal(game.getState().suitCount, 4);
assert.equal(game.setDifficulty("beginner"), true, "BEGINNERを選べる");

game.state = makeState({
  tableau: [[faceDown("S", "K"), faceUp("S", "Q")], [faceUp("H", "K")], ...Array.from({ length: 8 }, () => [])],
});
assert.equal(game.moveTableauToTableau(0, 1, 1), true, "同スート連番を異スートの1つ上へ移動できる");
state = game.getState();
assert.equal(state.tableau[0].at(-1).faceUp, true, "移動元で露出したカードは表返しする");
assert.equal(state.tableau[1].at(-1).rank, "Q");
assert.equal(state.score, 499, "通常の移動は1点減点");
assert.equal(game.undo(), true, "移動と表返しをUNDOできる");
assert.equal(game.getState().tableau[0].at(-1).rank, "Q");

game.state = makeState({ tableau: [[faceUp("S", "Q"), faceUp("H", "J")], [faceUp("H", "Q")], ...Array.from({ length: 8 }, () => [])] });
assert.equal(game.moveTableauToTableau(0, 0, 1), false, "混合スートの連番はまとめて移動できない");
assert.equal(game.moveTableauToTableau(0, 1, 1), true, "単体カードなら移動できる");

game.state = makeState({ tableau: [[faceUp("S", "7")], [], ...Array.from({ length: 8 }, () => [])] });
assert.equal(game.moveTableauToTableau(0, 0, 1), true, "空き列には任意のカードを置ける");

game.state = makeState({ stock: Array.from({ length: 10 }, (_, index) => faceDown("S", RANKS[index], 8)), tableau: Array.from({ length: 10 }, (_, index) => [faceUp("S", "K", index + 1)]) });
assert.equal(game.dealStock(), true, "全列が埋まっていれば山札を10枚配れる");
state = game.getState();
assert.equal(state.stock.length, 0);
assert.ok(state.tableau.every((pile) => pile.length === 2 && pile.at(-1).faceUp), "各列に表向きで1枚ずつ配る");
assert.equal(state.score, 499, "追加配りも1手・1点減点");
assert.equal(game.undo(), true, "追加配りをUNDOできる");

game.state = makeState({ stock: Array.from({ length: 10 }, (_, index) => faceDown("S", RANKS[index], 9)), tableau: [[], ...Array.from({ length: 9 }, () => [faceUp("S", "K")])] });
assert.equal(game.dealStock(), false, "空き列がある間は追加配りできない");

const completeRun = RANKS.slice().reverse().map((rank) => faceUp("S", rank, 4));
assert.equal(isCompleteSequence(completeRun), true, "同スートKからAが完成列");
assert.equal(isMovableRun(completeRun), true, "完成列はまとめて移動可能な連番");
assert.equal(canPlaceOnTableau(faceUp("H", "Q"), [faceUp("S", "K")]), true, "積み重ね自体はスートを問わない");

game.state = makeState({ tableau: [completeRun, ...Array.from({ length: 9 }, () => [])] });
assert.equal(game.moveTableauToTableau(0, 0, 1), true, "完成列も空列へ動かせる");
state = game.getState();
assert.equal(state.completed.length, 1, "完成列は自動で除去する");
assert.equal(state.completed[0].length, 13);
assert.equal(state.score, 599, "完成列では移動減点と100点加算を反映する");

const firstStackedRun = RANKS.slice().reverse().map((rank) => faceUp("S", rank, 10));
const secondStackedRun = RANKS.slice().reverse().map((rank) => faceUp("S", rank, 11));
game.state = makeState({ tableau: [[...firstStackedRun, ...secondStackedRun], ...Array.from({ length: 9 }, () => [])] });
assert.equal(game.processCompletedSequences().length, 2, "同じ列で連続した完成列をすべて検出する");
assert.equal(game.getState().completed.length, 2, "同じ列で連続した完成列をすべて除去する");

game.state = makeState({ stock: [], tableau: Array.from({ length: 10 }, (_, index) => [faceUp("S", "Q", index + 1)]) });
assert.equal(game.isStuck(), true, "移動も追加配りもできない時だけ詰み判定する");
game.state.stock = Array.from({ length: 10 }, (_, index) => faceDown("S", RANKS[index], 7));
assert.equal(game.isStuck(), false, "追加配り可能なら詰みではない");

assert.equal(SpiderSolitaire.isValidSavedState(game.serialize()), false, "途中で作った不完全なテスト盤面は保存状態として拒否する");
const fresh = new SpiderSolitaire({ random: () => .12 });
assert.equal(SpiderSolitaire.isValidSavedState(fresh.serialize()), true, "通常のゲーム状態は保存できる");
assert.equal(game.loadState(fresh.serialize()), true, "JSON安全な状態を復元できる");

game.dispose();
fresh.dispose();
console.log("spider core tests passed");
