import assert from "node:assert/strict";

const memory = new Map();
globalThis.localStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: (key) => memory.delete(key) };

const { createCard, RANKS } = await import("../js/cards.js");
const { canPlaceOnFoundation, canPlaceOnTableau } = await import("../games/solitaire/rules.js");
const { KlondikeSolitaire } = await import("../games/solitaire/solitaire.js");
const { getSolitaireRecords } = await import("../js/storage.js");
const faceUp = (suit, rank) => ({ ...createCard(suit, rank), faceUp: true });
const faceDown = (suit, rank) => ({ ...createCard(suit, rank), faceUp: false });

const game = new KlondikeSolitaire({ random: () => .37 });
let state = game.getState();
const allCards = [...state.stock, ...state.tableau.flat()];
assert.equal(allCards.length, 52, "52枚で開始する");
assert.equal(new Set(allCards.map((card) => card.id)).size, 52, "カードが重複しない");
assert.deepEqual(state.tableau.map((pile) => pile.length), [1, 2, 3, 4, 5, 6, 7], "場札は1〜7枚");
assert.equal(state.stock.length, 24, "山札は24枚");
assert.ok(state.tableau.every((pile) => pile.at(-1).faceUp && pile.slice(0, -1).every((card) => !card.faceUp)), "各列の最上段だけ表向き");

assert.equal(game.drawStock(), true, "山札をめくれる");
state = game.getState();
assert.equal(state.stock.length, 23); assert.equal(state.waste.length, 1); assert.equal(state.moves, 1);
assert.equal(getSolitaireRecords().plays, 1, "最初の有効操作でプレイ回数を記録");
assert.equal(game.undo(), true, "山札操作を戻せる");
assert.equal(game.getState().stock.length, 24);

assert.equal(game.setDifficulty("beginner"), true, "BEGINNERを選択できる");
state = game.getState();
assert.equal(state.drawCount, 1, "BEGINNERは1枚めくり");
assert.equal(state.maxRecycle, null, "BEGINNERは山札を無制限に再利用できる");
assert.ok(state.tableau.every((pile) => pile.every((card) => card.faceUp)), "BEGINNERは場札をすべて表向きにする");
assert.equal(state.tableau.flat().length, 28, "BEGINNERでも通常どおり場札は28枚で配る");
assert.equal(game.setDifficulty("normal"), true, "NORMALを選択できる");
assert.equal(game.getState().drawCount, 3, "NORMALは3枚めくり");
assert.equal(game.getState().maxRecycle, null, "NORMALは山札を無制限に再利用できる");
assert.equal(game.setDifficulty("hard"), true, "HARDを選択できる");
assert.equal(game.getState().maxRecycle, 3, "HARDは山札の再利用を3回に制限する");
game.state.stock = [];
game.state.waste = [faceUp("S", "A")];
game.state.recycleCount = 3;
assert.equal(game.drawStock(), false, "HARDでは再利用回数上限を超えて山札を戻せない");
game.newGame({ difficulty: "easy" });

game.state = { stock: [], waste: [faceUp("S", "A")], tableau: [[], [], [], [], [], [], []], foundations: [[], [], [], []], moves: 0, score: 0, elapsedTime: 0, gameStatus: "ready", playRecorded: true, history: [], drawCount: 1, recycleCount: 0 };
assert.equal(game.autoPlaceWaste(), true, "WasteのAをワンクリック用の自動配置でFoundationへ置ける");
assert.equal(game.getState().foundations[0].at(-1).id, "S-A");
assert.equal(game.undo(), true, "Wasteの自動配置もUNDOできる");
assert.equal(game.getState().waste.at(-1).id, "S-A");

game.state = { stock: [], waste: [faceUp("S", "A")], tableau: [[], [], [], [], [], [], []], foundations: [[], [], [], []], moves: 0, baseScore: 0, score: 0, scoreMultiplier: 1.1, clearStreak: 10, elapsedTime: 0, gameStatus: "ready", playRecorded: true, history: [], drawCount: 1, recycleCount: 0 };
assert.equal(game.autoPlaceWaste(), true, "連続クリア中もFoundationへ自動配置できる");
assert.equal(game.getState().score, 11, "10連続時は獲得スコアを1%ずつ積み上げて反映する");

game.state = { stock: [], waste: [faceUp("S", "A")], tableau: [[faceUp("H", "2")], [], [], [], [], [], []], foundations: [[], [], [], []], moves: 0, score: 0, elapsedTime: 0, gameStatus: "ready", playRecorded: true, history: [], drawCount: 1, recycleCount: 0 };
assert.equal(game.autoPlaceWaste(), true, "FoundationとTableauの両方へ置ける場合も自動配置できる");
assert.equal(game.getState().foundations[0].at(-1).id, "S-A", "自動配置はFoundationを優先する");

game.state = { stock: [], waste: [faceUp("S", "Q")], tableau: [[faceUp("H", "K")], [], [], [], [], [], []], foundations: [[], [], [], []], moves: 0, score: 0, elapsedTime: 0, gameStatus: "ready", playRecorded: true, history: [], drawCount: 1, recycleCount: 0 };
assert.equal(game.autoPlaceWaste(), true, "Foundationに置けないWasteは合法なTableauへ置ける");
assert.equal(game.getState().tableau[0].at(-1).id, "S-Q");
assert.equal(game.getState().score, 5, "WasteからTableauへの移動は5点");

game.state = { stock: [], waste: [], tableau: [[faceUp("H", "2")], [], [], [], [], [], []], foundations: [[faceUp("S", "A")], [], [], []], moves: 0, score: 25, elapsedTime: 0, gameStatus: "ready", playRecorded: true, history: [], drawCount: 1, recycleCount: 0 };
assert.equal(game.move({ type: "foundation", pile: 0 }, { type: "tableau", pile: 0 }), true, "FoundationからTableauへ戻せる");
assert.equal(game.getState().score, 10, "FoundationからTableauへ戻すと15点減点");

game.state = { stock: [], waste: [faceUp("S", "A")], tableau: [[], [], [], [], [], [], []], foundations: [[], [], [], []], moves: 0, score: 60, elapsedTime: 0, gameStatus: "ready", playRecorded: true, history: [], drawCount: 1, maxRecycle: null, recycleCount: 0 };
assert.equal(game.drawStock(), true, "1枚めくりではWasteを山札に戻せる");
assert.equal(game.getState().score, 0, "1枚めくりで山札を戻すと100点減点し、スコアは0未満にならない");

game.state = { stock: [], waste: [], tableau: [[faceUp("S", "Q")], [faceUp("H", "K")], [], [], [], [], []], foundations: [[], [], [], []], moves: 0, score: 0, elapsedTime: 0, gameStatus: "ready", playRecorded: true, history: [], drawCount: 1, recycleCount: 0 };
assert.equal(game.autoPlace({ type: "tableau", pile: 0 }), true, "Tableauもワンタップ用の自動配置で移動できる");
assert.equal(game.getState().tableau[1].at(-1).id, "S-Q");

const completeSuit = (suit) => RANKS.map((rank) => faceUp(suit, rank));
game.state = { stock: [], waste: [], tableau: [RANKS.slice().reverse().map((rank) => faceUp("S", rank)), [], [], [], [], [], []], foundations: [[], completeSuit("H"), completeSuit("D"), completeSuit("C")], moves: 0, score: 0, elapsedTime: 0, gameStatus: "ready", playRecorded: true, history: [], difficulty: "easy", drawCount: 1, maxRecycle: null, recycleCount: 0 };
assert.equal(game.isAutoCompleteReady(), true, "残りを組札へ順に送れる盤面だけ自動完了の対象にする");
let completedSteps = 0;
while (game.autoCompleteStep()) completedSteps += 1;
assert.equal(completedSteps, 13, "自動完了は残りの13枚を一枚ずつ送る");
assert.equal(game.getState().gameStatus, "completed", "自動完了後にクリア状態になる");
game.state.stock = [faceUp("S", "K")];
assert.equal(game.isAutoCompleteReady(), false, "山札が残る盤面では自動完了を始めない");

game.state = { stock: [], waste: [], tableau: [[faceUp("S", "Q")], [], [], [], [], [], []], foundations: [[], [], [], []], moves: 0, score: 0, elapsedTime: 0, gameStatus: "playing", playRecorded: true, history: [], drawCount: 1, recycleCount: 0 };
assert.equal(game.isStuck(), true, "移動先も再利用できるWasteもない状態だけを詰みと判定する");
game.state.waste.push(faceUp("S", "A"));
assert.equal(game.isStuck(), false, "Wasteが残る間は再利用できるため詰みの警告を出さない");

game.state = { stock: [], waste: [faceUp("S", "Q")], tableau: [[faceUp("H", "J")], [], [], [], [], [], []], foundations: [[], [], [], []], moves: 0, score: 0, elapsedTime: 0, gameStatus: "ready", playRecorded: true, history: [], difficulty: "hard", drawCount: 3, maxRecycle: 3, recycleCount: 3 };
assert.equal(game.isStuck(), true, "HARDで山札再利用上限に達し、移動先がなければ詰みと判定する");
game.state.tableau[0] = [faceUp("H", "K")];
assert.equal(game.isStuck(), false, "HARDでも合法な移動が残る間は詰みと判定しない");

game.state = { stock: [], waste: [faceUp("S", "Q")], tableau: [[], [], [], [], [], [], []], foundations: [[], [], [], []], moves: 0, score: 0, elapsedTime: 0, gameStatus: "ready", playRecorded: true, history: [], drawCount: 1, recycleCount: 0 };
assert.equal(game.autoPlaceWaste(), false, "置けないWasteは自動配置しない");
assert.equal(game.getState().moves, 0, "置けないWasteで手数を増やさない");

assert.equal(canPlaceOnTableau(faceUp("S", "Q"), [faceUp("H", "K")]), true, "赤Kに黒Qを置ける");
assert.equal(canPlaceOnTableau(faceUp("C", "Q"), [faceUp("S", "K")]), false, "同色には置けない");
assert.equal(canPlaceOnTableau(faceUp("H", "Q"), []), false, "空き列にはK以外を置けない");
assert.equal(canPlaceOnFoundation(faceUp("H", "A"), []), true, "FoundationはAから開始");
assert.equal(canPlaceOnFoundation(faceUp("H", "2"), [faceUp("H", "A")]), true, "Foundationは同スート昇順");
assert.equal(canPlaceOnFoundation(faceUp("D", "2"), [faceUp("H", "A")]), false, "Foundationに別スートを置けない");

game.state = { stock: [], waste: [], tableau: [[faceDown("S", "2"), faceUp("H", "A")], [], [], [], [], [], []], foundations: [[], [], [], []], moves: 0, score: 0, elapsedTime: 0, gameStatus: "ready", history: [], drawCount: 1, recycleCount: 0 };
assert.equal(game.autoMove({ type: "tableau", pile: 0 }), true, "表向きのAをFoundationへ移動できる");
state = game.getState();
assert.equal(state.foundations[0].at(-1).rank, "A");
assert.equal(state.tableau[0].at(-1).faceUp, true, "隠れた最上段を自動で表返し");
assert.equal(state.score, 15, "Foundationと表返しのスコアを加算");
assert.equal(game.undo(), true, "表返しを含む移動を戻せる");
assert.equal(game.getState().tableau[0].at(-1).faceUp, true, "UNDOで移動前の表カードに戻る");

console.log("solitaire core tests passed");
