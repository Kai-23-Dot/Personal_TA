/**
 * POST /api/notebooks/[id]/generate
 *
 * Turns everything in a notebook into study material: a study guide, a
 * practice test, or a flashcard deck.
 *
 * Practice and flashcards already accept `noteIds`, so those are delegated to
 * the existing generators rather than reimplemented — a notebook is just a set
 * of notes, and the grounding, difficulty tuning and deck handling are already
 * solved there. Only the study guide needs its own path, because the Canvas
 * one is built around lesson items rather than arbitrary sources.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { z } from "zod";
import { summarizeNotes } from "@/backend/ai/summarizeNotes";
import { generateEmbedding } from "@/backend/utils/embeddings";

const bodySchema = z.object({
  type: z.enum(["study_guide", "practice", "flashcards"]),
  // Mirrors SummaryType in types/index.ts; keeping these in step means the
  // API cannot accept a style summarizeNotes does not understand.
  summaryStyle: z
    .enum(["bullet_points", "outline", "detailed"])
    .default("bullet_points"),
  count: z.number().int().min(1).max(30).optional(),
});

/** Keeps a large notebook inside the model's context window. */
const MAX_COMBINED_CHARS = 30_000;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose what to generate." }, { status: 400 });
  }

  const { data: notebook } = await supabase
    .from("notebooks")
    .select("id, title, course_id, course:courses(name)")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!notebook) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: sources } = await supabase
    .from("notes")
    .select("id, title, content")
    .eq("notebook_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(50);

  if (!sources || sources.length === 0) {
    return NextResponse.json(
      { error: "Add at least one source before generating anything." },
      { status: 400 }
    );
  }

  const noteIds = sources.map((s) => s.id);

  if (parsed.data.type === "practice" || parsed.data.type === "flashcards") {
    // Both generators are course-scoped: practice requires courseId outright,
    // and flashcards reject selected notes without one. A notebook that is not
    // attached to a course therefore cannot use them — say so plainly instead
    // of forwarding a request that will be rejected for reasons the student
    // cannot act on.
    if (!notebook.course_id) {
      return NextResponse.json(
        {
          error: "Attach this notebook to a course first.",
          hint: "Practice tests and flashcards are filed under a course so they show up with the rest of your work. A study guide works without one.",
          reason: "course-required",
        },
        { status: 400 }
      );
    }

    const target =
      parsed.data.type === "practice" ? "/api/practice/generate" : "/api/flashcards/generate";

    // Each schema is .strict(), so the payloads differ and neither tolerates
    // stray fields.
    const body =
      parsed.data.type === "practice"
        ? {
            topic: notebook.title,
            courseId: notebook.course_id,
            noteIds: noteIds.slice(0, 30),
            questionCount: parsed.data.count ?? 10,
          }
        : {
            topic: notebook.title,
            courseId: notebook.course_id,
            noteIds: noteIds.slice(0, 100),
            count: parsed.data.count ?? 10,
          };

    // Forward the caller's cookies so the generator runs as this user under
    // the same row-level security.
    const upstream = await fetch(new URL(target, req.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: req.headers.get("cookie") ?? "",
      },
      body: JSON.stringify(body),
    });

    const payload = await upstream.json().catch(() => null);
    return NextResponse.json(payload ?? { error: "Generation failed." }, {
      status: upstream.status,
    });
  }

  // ── Study guide ───────────────────────────────────────────────────────────
  // Sources are labelled so the model can attribute each section, and the
  // combined text is capped rather than truncated mid-source where possible.
  // Fill the budget rather than stopping at the first source that exceeds it:
  // one long source (a full article runs well past this) would otherwise be
  // skipped whole and leave nothing to summarise.
  let combined = "";
  for (const source of sources) {
    const remaining = MAX_COMBINED_CHARS - combined.length;
    if (remaining <= 0) break;
    const header = `### ${source.title}\n`;
    const body = (source.content ?? "").slice(0, Math.max(0, remaining - header.length));
    if (!body.trim()) continue;
    combined += `${header}${body}\n\n`;
  }

  if (!combined.trim()) {
    return NextResponse.json(
      { error: "Those sources have no readable text yet." },
      { status: 400 }
    );
  }

  const courseName = (notebook.course as { name?: string } | null)?.name;

  const summary = await summarizeNotes({
    content: combined,
    title: notebook.title,
    summaryType: parsed.data.summaryStyle,
    courseName: courseName ?? undefined,
    customInstruction:
      "Build a study guide from the sources provided. Use only what is in them; do not introduce material that is not present. Organise by topic with a '## ' header per topic, and finish with a study checklist.",
  });

  // The guide is saved as another note in the same notebook, so it is
  // searchable and can itself be practised from.
  let embedding: number[] | null = null;
  try {
    embedding = await generateEmbedding(summary.summary.slice(0, 8000));
  } catch (error) {
    console.warn("[notebooks/generate] Embedding failed:", error);
  }

  const { data: note, error } = await supabase
    .from("notes")
    .insert({
      user_id: user.id,
      notebook_id: notebook.id,
      course_id: notebook.course_id,
      title: `${notebook.title} — study guide`,
      content: summary.summary,
      source_type: "manual" as const,
      file_type: "md" as const,
      word_count: summary.summary.trim().split(/\s+/).length,
      is_processed: true,
      embedding: embedding ? `[${embedding.join(",")}]` : null,
    })
    .select("id, title")
    .single();

  if (error) {
    console.error("[notebooks/generate] Could not save the guide:", error);
    return NextResponse.json({ error: "Could not save that study guide." }, { status: 500 });
  }

  return NextResponse.json({ noteId: note.id, title: note.title, content: summary.summary });
}
