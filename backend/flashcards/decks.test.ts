import { describe, expect, it } from "vitest";
import { groupFlashcardsIntoDecks } from "@/frontend/lib/flashcardDecks";

type Card = {
  id: string;
  topic: string;
  course_id: string | null;
  created_at: string;
  deck_id?: string | null;
  deck_name?: string | null;
};

const base = {
  course_id: "course-1",
  created_at: "2026-08-24T10:00:00.000Z",
};

describe("flashcard deck grouping", () => {
  it("keeps differently-tagged cards from the same deck together", () => {
    const cards: Card[] = [
      { ...base, id: "card-1", topic: "Planning", deck_id: "deck-1", deck_name: "Management I" },
      { ...base, id: "card-2", topic: "Leadership", deck_id: "deck-1", deck_name: "Management I" },
      { ...base, id: "card-3", topic: "Control", deck_id: "deck-1", deck_name: "Management I" },
    ];

    expect(groupFlashcardsIntoDecks(cards)).toEqual([
      { id: "deck-1", name: "Management I", count: 3, cards },
    ]);
  });

  it("keeps separate generation batches separate even when names match", () => {
    const cards: Card[] = [
      { ...base, id: "card-1", topic: "Management", deck_id: "deck-1", deck_name: "Management" },
      { ...base, id: "card-2", topic: "Management", deck_id: "deck-2", deck_name: "Management" },
    ];

    expect(groupFlashcardsIntoDecks(cards).map((deck) => deck.id)).toEqual([
      "deck-1",
      "deck-2",
    ]);
  });

  it("reconstructs legacy multi-card batches from their insert timestamp", () => {
    const cards: Card[] = [
      { ...base, id: "card-1", topic: "Planning" },
      { ...base, id: "card-2", topic: "Leadership" },
    ];

    const [deck] = groupFlashcardsIntoDecks(cards);
    expect(deck.count).toBe(2);
    expect(deck.cards).toHaveLength(2);
  });
});
