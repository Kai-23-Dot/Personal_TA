/**
 * PATCH /api/flashcards/review
 * Record the result of a flashcard review and update SRS schedule.
 */
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { calculateNextReview } from "@/lib/ai/generateFlashcards";
import type { SRSGrade } from "@/types";

export async function PATCH(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const { flashcardId, grade } = await req.json() as { flashcardId: string; grade: SRSGrade };

    if (typeof grade !== "number" || grade < 0 || grade > 5) {
      return NextResponse.json({ success: false, error: "Grade must be 0–5" }, { status: 400 });
    }

    // Fetch current card state
    const { data: card } = await supabase
      .from("flashcards")
      .select("interval_days,ease_factor,repetitions,times_correct,times_reviewed")
      .eq("id", flashcardId)
      .eq("user_id", user.id)
      .single();

    if (!card) {
      return NextResponse.json({ success: false, error: "Flashcard not found" }, { status: 404 });
    }

    const update = calculateNextReview(
      grade,
      card.interval_days,
      card.ease_factor,
      card.repetitions,
      card.times_correct,
      card.times_reviewed
    );

    const { error } = await supabase
      .from("flashcards")
      .update({ ...update, last_reviewed: new Date().toISOString() })
      .eq("id", flashcardId)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, nextReview: update.next_review });
  } catch (err) {
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
