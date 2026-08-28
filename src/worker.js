const LEADERBOARD_LIMIT = 100;
const RATE_LIMIT_WINDOW_SECONDS = 10 * 60;
const RATE_LIMIT_MAX_SUBMISSIONS = 6;
const ANONYMOUS_ANIMALS = Object.freeze([
  "ひつじ", "おおかみ", "ねずみ", "うし", "らいおん", "ねこ", "いぬ", "うさぎ",
  "きつね", "たぬき", "くま", "ぱんだ", "こあら", "りす", "はりねずみ", "ぺんぎん",
  "あざらし", "らっこ", "かわうそ", "しろくま", "かぴばら", "きりん", "ぞう", "しまうま",
  "かば", "さる", "ごりら", "とら", "ひょう", "ちーたー", "ふくろう", "ことり",
  "あひる", "やぎ", "かめ", "いるか", "くじら", "しゃち", "らくだ", "ひよこ",
]);

const DIFFICULTIES = Object.freeze({
  solitaire: new Set(["beginner", "easy", "normal", "hard"]),
  spider: new Set(["one", "two", "four"]),
  freecell: new Set(["standard"]),
});

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
});

function validateScope(game, difficulty) {
  return typeof game === "string" && DIFFICULTIES[game]?.has(difficulty);
}

function cleanNickname(value) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  const nickname = value.replace(/\s+/gu, " ").trim();
  if (Array.from(nickname).length > 20) return null;
  return /[\u0000-\u001f\u007f-\u009f]/u.test(nickname) ? null : nickname;
}

function createAnonymousNickname() {
  const number = new Uint32Array(1);
  crypto.getRandomValues(number);
  return `ななしの${ANONYMOUS_ANIMALS[number[0] % ANONYMOUS_ANIMALS.length]}`;
}

function validInteger(value, { min, max }) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

async function clientKey(request, salt = "") {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const material = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function allowSubmission(request, env) {
  const now = Math.floor(Date.now() / 1000);
  const windowStartedAt = now - (now % RATE_LIMIT_WINDOW_SECONDS);
  const key = await clientKey(request, env.RANKING_RATE_LIMIT_SALT || "");
  const db = env.fuwatto_sheep_rankings;
  await db.prepare(
    `INSERT INTO ranking_rate_limits (client_key, window_started_at, submissions)
     VALUES (?, ?, 1)
     ON CONFLICT(client_key, window_started_at)
     DO UPDATE SET submissions = submissions + 1`,
  ).bind(key, windowStartedAt).run();
  const { submissions = RATE_LIMIT_MAX_SUBMISSIONS + 1 } = await db.prepare(
    "SELECT submissions FROM ranking_rate_limits WHERE client_key = ? AND window_started_at = ?",
  ).bind(key, windowStartedAt).first() || {};
  return submissions <= RATE_LIMIT_MAX_SUBMISSIONS;
}

async function getRankings(url, env) {
  const game = url.searchParams.get("game");
  const difficulty = url.searchParams.get("difficulty");
  if (!validateScope(game, difficulty)) {
    return json({ error: "game と difficulty の指定が正しくありません。" }, 400);
  }
  const { results = [] } = await env.fuwatto_sheep_rankings.prepare(
    `SELECT nickname, score, elapsed_time AS elapsedTime, moves, created_at AS createdAt
     FROM rankings
     WHERE game = ? AND difficulty = ?
     ORDER BY score DESC, elapsed_time ASC, moves ASC, created_at ASC
     LIMIT ?`,
  ).bind(game, difficulty, LEADERBOARD_LIMIT).all();
  return json({ game, difficulty, rankings: results.map((entry, index) => ({ rank: index + 1, ...entry })) });
}

async function postRanking(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "JSON形式のデータを送信してください。" }, 400);
  }
  const { game, difficulty, score, elapsedTime, moves } = payload || {};
  const cleanedNickname = cleanNickname(payload?.nickname);
  const nickname = cleanedNickname === "" ? createAnonymousNickname() : cleanedNickname;
  if (!validateScope(game, difficulty) || !nickname
    || !validInteger(score, { min: 0, max: 1_000_000 })
    || !validInteger(elapsedTime, { min: 0, max: 604_800 })
    || !validInteger(moves, { min: 0, max: 100_000 })) {
    return json({ error: "送信内容が正しくありません。" }, 400);
  }
  if (!(await allowSubmission(request, env))) {
    return json({ error: "投稿が集中しています。10分ほど待ってからもう一度お試しください。" }, 429, { "retry-after": String(RATE_LIMIT_WINDOW_SECONDS) });
  }
  const createdAt = Math.floor(Date.now() / 1000);
  const result = await env.fuwatto_sheep_rankings.prepare(
    `INSERT INTO rankings (game, difficulty, nickname, score, elapsed_time, moves, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(game, difficulty, nickname, score, elapsedTime, moves, createdAt).run();
  return json({
    ok: true,
    id: result.meta.last_row_id,
    entry: { game, difficulty, nickname, score, elapsedTime, moves, createdAt },
  }, 201);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/rankings") {
      try {
        if (request.method === "GET") return getRankings(url, env);
        if (request.method === "POST") return postRanking(request, env);
        return json({ error: "このメソッドは利用できません。" }, 405, { allow: "GET, POST" });
      } catch (error) {
        console.error("Ranking API error", error);
        return json({ error: "ランキングを処理できませんでした。" }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
