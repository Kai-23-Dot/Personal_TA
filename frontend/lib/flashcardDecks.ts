export type DeckableFlashcard = {
  id: string;
  topic: string;
  course_id?: string | null;
  created_at?: string | null;
  deck_id?: string | null;
  deck_name?: string | null;
};

export type FlashcardDeck<T extends DeckableFlashcard> = {
  id: string;
  name: string;
  count: number;
  cards: T[];
};

/**
 * Keep cards from one generation together. Older rows predate deck_id, but
 * cards inserted in the same database statement share an exact created_at
 * timestamp, which gives us a safe legacy batch key until the DB backfill runs.
 */
export function groupFlashcardsIntoDecks<T extends DeckableFlashcard>(
  cards: T[]
): FlashcardDeck<T>[] {
  const decks = new Map<string, FlashcardDeck<T>>();

  for (const card of cards) {
    const legacyBatch = card.created_at
      ? `${card.course_id ?? "no-course"}:${card.created_at}`
      : `topic:${card.topic}`;
    const id = card.deck_id?.trim() || legacyBatch;
    const name = card.deck_name?.trim() || card.topic.trim() || "Flashcard deck";
    const existing = decks.get(id);

    if (existing) {
      existing.cards.push(card);
      existing.count += 1;
    } else {
      decks.set(id, { id, name, count: 1, cards: [card] });
    }
  }

  return Array.from(decks.values());
}
