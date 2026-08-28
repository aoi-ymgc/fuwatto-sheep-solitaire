/** Klondike-only rule functions. They have no DOM dependency. */
export const isKing = (card) => card?.value === 13;

export function isDescendingAlternating(upper, lower) {
  return Boolean(upper && lower && upper.color !== lower.color && upper.value === lower.value + 1);
}

export function isValidTableauRun(cards) {
  return cards.length > 0
    && cards.every((card) => card.faceUp)
    && cards.slice(1).every((card, index) => isDescendingAlternating(cards[index], card));
}

export function canPlaceOnTableau(card, targetPile) {
  if (!card || !Array.isArray(targetPile)) return false;
  if (targetPile.length === 0) return isKing(card);
  return isDescendingAlternating(targetPile.at(-1), card);
}

export function canPlaceOnFoundation(card, targetPile) {
  if (!card || !Array.isArray(targetPile)) return false;
  if (targetPile.length === 0) return card.value === 1;
  const top = targetPile.at(-1);
  return top.suit === card.suit && card.value === top.value + 1;
}

export function isFoundationComplete(foundations) {
  return foundations.length === 4 && foundations.every((pile) => pile.length === 13);
}

export function findFoundationTarget(card, foundations) {
  return foundations.findIndex((pile) => canPlaceOnFoundation(card, pile));
}

export const formatTime = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
