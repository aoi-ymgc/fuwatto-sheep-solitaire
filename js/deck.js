import { createStandardDeck } from "./cards.js";

/** Non-mutating Fisher-Yates shuffle. */
export function shuffle(cards, random = Math.random) {
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

/** A 52-card deck; Jokers deliberately stay out of Klondike. */
export const createKlondikeDeck = (options = {}) => shuffle(createStandardDeck(options), options.random);
