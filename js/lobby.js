import { fetchRankings } from "./rankings.js";

const $ = (selector) => document.querySelector(selector);
const HOW_TO = {
  solitaire: { eyebrow: "KLONDIKE", title: "クロンダイクの遊び方", points: ["赤と黒を交互に、数字がひとつ小さくなるように場札へ重ねます。", "組札は同じスートで A から K まで順に揃えます。", "空いた列には K、または K から続くカード列を置けます。", "カードをタップすると、置ける場所へ自動で移動します。"] },
  spider: { eyebrow: "SPIDER", title: "スパイダーの遊び方", points: ["場札は、スートに関係なく数字をひとつ小さくして重ねます。", "同じスートで続くカード列だけを、まとめて移動できます。", "同じスートの K から A を揃えると、その組は自動で取り除かれます。", "山札を配るには、すべての列にカードが必要です。"] },
  freecell: { eyebrow: "FREECELL", title: "フリーセルの遊び方", points: ["場札は赤と黒を交互に、数字をひとつずつ下げて重ねます。", "上部の4つの空きセルには、カードを1枚ずつ一時的に置けます。", "空いた列には、どのカードでも置けます。空きセルと空き列が多いほど、まとめて動かせます。", "組札は同じスートで A から K まで順に揃えます。"] },
};
const GAME_OPTIONS = {
  solitaire: { title: "クロンダイク ランキング", difficulties: [["beginner", "BEGINNER"], ["easy", "EASY"], ["normal", "NORMAL"], ["hard", "HARD"]] },
  spider: { title: "スパイダー ランキング", difficulties: [["one", "ONE SUIT"], ["two", "TWO SUITS"], ["four", "FOUR SUITS"]] },
  freecell: { title: "フリーセル ランキング", difficulties: [["standard", "STANDARD"]] },
};

const howTo = $("#how-to-modal");
const ranking = $("#ranking-modal");
const rankingGame = $("#ranking-game");
const rankingDifficulty = $("#ranking-difficulty");
const rankingTitle = $("#ranking-title");
const rankingList = $("#ranking-list");
const rankingMessage = $("#ranking-message");

function formatTime(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function updateDifficultyOptions() {
  const config = GAME_OPTIONS[rankingGame.value];
  rankingTitle.textContent = config.title;
  rankingDifficulty.replaceChildren(...config.difficulties.map(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  }));
}

function fillRows(entries) {
  rankingList.replaceChildren();
  if (!entries.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.className = "ranking-empty";
    cell.colSpan = 5;
    cell.textContent = "まだ登録された記録はありません。";
    row.append(cell);
    rankingList.append(row);
    return;
  }
  entries.forEach((entry, index) => {
    const row = document.createElement("tr");
    [entry.rank || index + 1, entry.name, entry.score, formatTime(entry.elapsedTime), entry.moves].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = String(value);
      row.append(cell);
    });
    rankingList.append(row);
  });
}

async function loadRankings() {
  rankingMessage.textContent = "読み込み中…";
  rankingList.replaceChildren();
  try {
    const entries = await fetchRankings(rankingGame.value, rankingDifficulty.value);
    fillRows(entries);
    rankingMessage.textContent = `上位${entries.length}件を表示しています。`;
  } catch (error) {
    rankingMessage.textContent = error.message || "ランキングを読み込めませんでした。";
  }
}

document.querySelectorAll("[data-how-to]").forEach((button) => button.addEventListener("click", () => {
  const contents = HOW_TO[button.dataset.howTo];
  $("#how-to-eyebrow").textContent = contents.eyebrow;
  $("#how-to-title").textContent = contents.title;
  $("#how-to-list").replaceChildren(...contents.points.map((point) => {
    const item = document.createElement("li");
    item.textContent = point;
    return item;
  }));
  howTo.showModal();
}));
document.querySelectorAll("[data-ranking-game]").forEach((button) => button.addEventListener("click", () => {
  rankingGame.value = button.dataset.rankingGame;
  updateDifficultyOptions();
  ranking.showModal();
  loadRankings();
}));
rankingGame.addEventListener("change", () => { updateDifficultyOptions(); loadRankings(); });
rankingDifficulty.addEventListener("change", loadRankings);
$("#ranking-refresh").addEventListener("click", loadRankings);
