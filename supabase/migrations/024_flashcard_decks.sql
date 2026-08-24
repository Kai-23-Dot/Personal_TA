-- Preserve generated flashcards as complete decks instead of grouping cards by
-- their individual AI-assigned subtopics.
ALTER TABLE public.flashcards
  ADD COLUMN IF NOT EXISTS deck_id UUID,
  ADD COLUMN IF NOT EXISTS deck_name TEXT;

-- Rows created by one multi-row insert share the exact transaction timestamp.
-- Use that stable batch boundary to restore decks created before these columns
-- existed, without changing any card content or spaced-repetition history.
WITH legacy_decks AS (
  SELECT
    f.user_id,
    f.course_id,
    f.created_at,
    gen_random_uuid() AS deck_id,
    CASE
      WHEN COUNT(DISTINCT f.topic) = 1 THEN MIN(f.topic)
      ELSE COALESCE(MAX(c.name), 'Flashcard deck')
    END AS deck_name
  FROM public.flashcards AS f
  LEFT JOIN public.courses AS c ON c.id = f.course_id
  WHERE f.deck_id IS NULL
  GROUP BY f.user_id, f.course_id, f.created_at
)
UPDATE public.flashcards AS f
SET
  deck_id = legacy_decks.deck_id,
  deck_name = legacy_decks.deck_name
FROM legacy_decks
WHERE f.deck_id IS NULL
  AND f.user_id = legacy_decks.user_id
  AND f.course_id IS NOT DISTINCT FROM legacy_decks.course_id
  AND f.created_at = legacy_decks.created_at;

ALTER TABLE public.flashcards
  ALTER COLUMN deck_id SET DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_flashcards_user_deck
  ON public.flashcards(user_id, deck_id, created_at DESC);
