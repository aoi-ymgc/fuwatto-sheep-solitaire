const safeRead = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
};

export const loadJSON = (key, fallback = null) => safeRead(key, fallback);
export const saveJSON = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
};
export const removeStored = (key) => { try { localStorage.removeItem(key); } catch {} };

export function createAudioToggleSequence({ requiredToggles = 20, newGameValue = 10 } = {}) {
  let toggles = 0;
  const required = Math.max(1, Number.isInteger(requiredToggles) ? requiredToggles : 20);
  const value = Math.max(0, Number.isInteger(newGameValue) ? newGameValue : 10);
  return {
    recordToggle() {
      toggles = Math.min(required, toggles + 1);
      return toggles;
    },
    reset() { toggles = 0; },
    consumeNewGame() {
      const result = toggles >= required ? value : 0;
      toggles = 0;
      return result;
    },
  };
}

export const SOLITAIRE_RECORD_KEY = "fuwatto-sheep-solitaire-records-v1";
export const SOLITAIRE_GAME_KEY = "fuwatto-sheep-solitaire-game-v1";

export function getSolitaireRecords() {
  return safeRead(SOLITAIRE_RECORD_KEY, { bestTime: null, fewestMoves: null, highScore: 0, plays: 0, clears: 0 });
}

export function noteSolitairePlay() {
  const records = getSolitaireRecords();
  records.plays += 1;
  saveJSON(SOLITAIRE_RECORD_KEY, records);
  return records;
}

export function noteSolitaireClear({ elapsedTime, moves, score }) {
  const records = getSolitaireRecords();
  records.clears += 1;
  records.bestTime = records.bestTime === null ? elapsedTime : Math.min(records.bestTime, elapsedTime);
  records.fewestMoves = records.fewestMoves === null ? moves : Math.min(records.fewestMoves, moves);
  records.highScore = Math.max(records.highScore, score);
  saveJSON(SOLITAIRE_RECORD_KEY, records);
  return records;
}

export const SPIDER_RECORD_KEY = "fuwatto-sheep-spider-records-v1";
export const SPIDER_GAME_KEY = "fuwatto-sheep-spider-game-v1";

export function getSpiderRecords() {
  return safeRead(SPIDER_RECORD_KEY, { bestTime: null, fewestMoves: null, highScore: 0, plays: 0, clears: 0 });
}

export function noteSpiderPlay() {
  const records = getSpiderRecords();
  records.plays += 1;
  saveJSON(SPIDER_RECORD_KEY, records);
  return records;
}

export function noteSpiderClear({ elapsedTime, moves, score }) {
  const records = getSpiderRecords();
  records.clears += 1;
  records.bestTime = records.bestTime === null ? elapsedTime : Math.min(records.bestTime, elapsedTime);
  records.fewestMoves = records.fewestMoves === null ? moves : Math.min(records.fewestMoves, moves);
  records.highScore = Math.max(records.highScore, score);
  saveJSON(SPIDER_RECORD_KEY, records);
  return records;
}

export const FREECELL_RECORD_KEY = "fuwatto-sheep-freecell-records-v1";
export const FREECELL_GAME_KEY = "fuwatto-sheep-freecell-game-v1";

export function getFreecellRecords() {
  return safeRead(FREECELL_RECORD_KEY, { bestTime: null, fewestMoves: null, highScore: 0, plays: 0, clears: 0 });
}

export function noteFreecellPlay() {
  const records = getFreecellRecords();
  records.plays += 1;
  saveJSON(FREECELL_RECORD_KEY, records);
  return records;
}

export function noteFreecellClear({ elapsedTime, moves, score }) {
  const records = getFreecellRecords();
  records.clears += 1;
  records.bestTime = records.bestTime === null ? elapsedTime : Math.min(records.bestTime, elapsedTime);
  records.fewestMoves = records.fewestMoves === null ? moves : Math.min(records.fewestMoves, moves);
  records.highScore = Math.max(records.highScore, score);
  saveJSON(FREECELL_RECORD_KEY, records);
  return records;
}
