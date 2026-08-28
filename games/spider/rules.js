/** DOM-free rules for standard Spider Solitaire. */

export function isDescending(upper, lower) {
  return Boolean(upper && lower && upper.value === lower.value + 1);
}

/** A movable group must be face-up, descending, and entirely one suit. */
export function isMovableRun(cards) {
  return Array.isArray(cards)
    && cards.length > 0
    && cards.every((card) => card.faceUp)
    && cards.slice(1).every((card, index) => card.suit === cards[index].suit && isDescending(cards[index], card));
}

/** Any card may be placed in an empty column; otherwise it must be one rank lower. */
export function canPlaceOnTableau(card, targetPile) {
  if (!card || !Array.isArray(targetPile)) return false;
  return targetPile.length === 0 || isDescending(targetPile.at(-1), card);
}

/** A completed Spider run is a single-suit K through A tail. */
export function isCompleteSequence(cards) {
  return Array.isArray(cards)
    && cards.length === 13
    && cards.every((card) => card.faceUp)
    && cards.every((card, index) => card.value === 13 - index)
    && cards.every((card, index) => index === 0 || card.suit === cards[index - 1].suit);
}

export function hasCompleteTail(pile) {
  return Array.isArray(pile) && pile.length >= 13 && isCompleteSequence(pile.slice(-13));
}

export const isSpiderComplete = (completed) => Array.isArray(completed) && completed.length === 8;

export const formatTime = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
