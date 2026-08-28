const API_PATH = "/api/rankings";
const NAME_KEY = "fuwatto-sheep-ranking-name-v1";
const ANONYMOUS_ANIMALS = Object.freeze([
  "ひつじ", "おおかみ", "ねずみ", "うし", "らいおん", "ねこ", "いぬ", "うさぎ",
  "きつね", "たぬき", "くま", "ぱんだ", "こあら", "りす", "はりねずみ", "ぺんぎん",
  "あざらし", "らっこ", "かわうそ", "しろくま", "かぴばら", "きりん", "ぞう", "しまうま",
  "かば", "さる", "ごりら", "とら", "ひょう", "ちーたー", "ふくろう", "ことり",
  "あひる", "やぎ", "かめ", "いるか", "くじら", "しゃち", "らくだ", "ひよこ",
]);

const asNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function getRankingName() {
  try { return localStorage.getItem(NAME_KEY) || ""; } catch { return ""; }
}

export function saveRankingName(name) {
  try { localStorage.setItem(NAME_KEY, name); } catch {}
}

export function cleanRankingName(value) {
  return Array.from(String(value ?? "").replace(/\s+/g, " ").trim()).slice(0, 20).join("");
}

export function createAnonymousRankingName(random = Math.random) {
  const index = Math.min(ANONYMOUS_ANIMALS.length - 1, Math.max(0, Math.floor(Number(random()) * ANONYMOUS_ANIMALS.length)));
  return `ななしの${ANONYMOUS_ANIMALS[index]}`;
}

export function resolveRankingName(value, random = Math.random) {
  return cleanRankingName(value) || createAnonymousRankingName(random);
}

function normalizeEntry(entry, index) {
  return {
    rank: asNumber(entry?.rank, index + 1),
    name: cleanRankingName(entry?.name ?? entry?.nickname) || "ななしのひつじ",
    score: asNumber(entry?.score),
    elapsedTime: asNumber(entry?.elapsedTime ?? entry?.time),
    moves: asNumber(entry?.moves),
    createdAt: entry?.createdAt ?? entry?.created_at ?? "",
  };
}

async function readJSON(response) {
  try { return await response.json(); } catch { return {}; }
}

export async function fetchRankings(game, difficulty) {
  const query = new URLSearchParams({ game, difficulty, limit: "100" });
  let response;
  try { response = await fetch(`${API_PATH}?${query}`, { headers: { Accept: "application/json" } }); }
  catch { throw new Error("ランキングを読み込めませんでした。通信状況を確認してください。"); }
  const body = await readJSON(response);
  if (!response.ok) throw new Error(body?.error || body?.message || "ランキングを読み込めませんでした。");
  const entries = Array.isArray(body) ? body : (body.rankings ?? body.entries ?? []);
  return Array.isArray(entries) ? entries.slice(0, 100).map(normalizeEntry) : [];
}

export async function submitRanking({ game, difficulty, name, score, elapsedTime, moves }) {
  const nickname = resolveRankingName(name);
  let response;
  try {
    response = await fetch(API_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ game, difficulty, nickname, score, elapsedTime, moves }),
    });
  } catch { throw new Error("ランキングを登録できませんでした。通信状況を確認してください。"); }
  const body = await readJSON(response);
  if (!response.ok) throw new Error(body?.error || body?.message || "ランキングを登録できませんでした。しばらくしてからお試しください。");
  return body;
}
