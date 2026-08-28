/** DOM-free rules for standard FreeCell. */

export function isDescendingAlternating(upper, lower) {
  return Boolean(upper && lower && upper.color !== lower.color && upper.value === lower.value + 1);
}

/** Every card in a tableau run is face-up, descending and alternating in colour. */
export function isValidTableauRun(cards) {
  return Array.isArray(cards)
    && cards.length > 0
    && cards.every((card) => card?.faceUp)
    && cards.slice(1).every((card, index) => isDescendingAlternating(cards[index], card));
}

/** FreeCell accepts any card in an empty column. */
export function canPlaceOnTableau(card, targetPile) {
  if (!card || !Array.isArray(targetPile)) return false;
  return targetPile.length === 0 || isDescendingAlternating(targetPile.at(-1), card);
}

export function canPlaceOnFoundation(card, targetPile) {
  if (!card || !Array.isArray(targetPile)) return false;
  if (targetPile.length === 0) return card.value === 1;
  const top = targetPile.at(-1);
  return top.suit === card.suit && card.value === top.value + 1;
}

export function findFoundationTarget(card, foundations) {
  return foundations.findIndex((pile) => canPlaceOnFoundation(card, pile));
}

export function isFoundationComplete(foundations) {
  return Array.isArray(foundations) && foundations.length === 4 && foundations.every((pile) => pile.length === 13);
}

/**
 * Standard FreeCell transport capacity. Empty tableau columns double capacity;
 * an empty destination cannot also be used as temporary storage.
 */
export function movableCardCapacity({ freeCells, tableau, target } = {}) {
  if (!Array.isArray(freeCells) || !Array.isArray(tableau)) return 0;
  const emptyFreeCells = freeCells.filter((card) => !card).length;
  let emptyColumns = tableau.filter((pile) => Array.isArray(pile) && pile.length === 0).length;
  if (target?.type === "tableau" && tableau[target.pile]?.length === 0) emptyColumns -= 1;
  return (emptyFreeCells + 1) * (2 ** Math.max(0, emptyColumns));
}

export const formatTime = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
