/** Shared playing-card data used by every card game in this project. */
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const CARD_ASSET_BASE = new URL("../assets/card-images", import.meta.url).href.replace(/\/$/, "");

export const SUITS = [
  { key: "S", name: "スペード", symbol: "♠", color: "black" },
  { key: "H", name: "ハート", symbol: "♥", color: "red" },
  { key: "D", name: "ダイヤ", symbol: "♦", color: "red" },
  { key: "C", name: "クラブ", symbol: "♣", color: "black" },
];

export const rankValue = (rank) => RANKS.indexOf(rank) + 1;
export const rankName = (rank) => ({ A: "Ace", J: "Jack", Q: "Queen", K: "King" }[rank] || rank);

export function createCard(suit, rank, assetBase = CARD_ASSET_BASE) {
  const suitInfo = typeof suit === "string" ? SUITS.find((item) => item.key === suit) : suit;
  if (!suitInfo || !RANKS.includes(rank)) throw new Error("Unknown playing card");
  return {
    id: `${suitInfo.key}-${rank}`,
    suit: suitInfo.key,
    suitName: suitInfo.name,
    symbol: suitInfo.symbol,
    rank,
    value: rankValue(rank),
    color: suitInfo.color,
    image: `${assetBase}/${suitInfo.key}_${rank}.webp`,
    label: `${suitInfo.name}の${rankName(rank)}`,
  };
}

export function createStandardDeck({ assetBase, includeJokers = false } = {}) {
  const cards = SUITS.flatMap((suit) => RANKS.map((rank) => createCard(suit, rank, assetBase)));
  if (!includeJokers) return cards;
  const base = assetBase || CARD_ASSET_BASE;
  return cards.concat([1, 2].map((number) => ({
    id: `joker-${number}`, suit: "JOKER", rank: "JOKER", value: 0, color: "joker",
    image: `${base}/JOKER_${number}.webp`, label: `Joker ${number}`,
  })));
}

export const cardImage = (card, assetBase = CARD_ASSET_BASE) => card.image || `${assetBase}/${card.suit}_${card.rank}.webp`;

export function preloadCards(cards) {
  return Promise.all(cards.map((card) => new Promise((resolve) => {
    const image = new Image();
    image.onload = image.onerror = () => resolve();
    image.src = card.image;
  })));
}
