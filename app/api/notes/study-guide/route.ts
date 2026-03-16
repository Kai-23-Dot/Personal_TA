import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { summarizeNotes } from "@/lib/ai/summarizeNotes";
import type { SummaryType } from "@/types";

export const maxDuration = 90;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { noteIds, summaryStyle = "bullet_points" } = body as {
      noteIds: string[];
      summaryStyle?: SummaryType;
    };

    if (!Array.isArray(noteIds) || noteIds.length === 0) {
      return NextResponse.json({ success: false, error: "noteIds is required" }, { status: 400 });
    }

    const trimmedIds = [...new Set(noteIds)].slice(0, 50);
    const allowedStyles: SummaryType[] = ["bullet_points", "outline", "detailed", "unit_aggregate"];
    const safeStyle = allowedStyles.includes(summaryStyle) ? summaryStyle : "bullet_points";

    const { data: notes, error } = await supabase
      .from("notes")
      .select("id, title, content, course_id, updated_at, course:courses(name)")
      .in("id", trimmedIds)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const validNotes = (notes ?? []).filter((note) => note.content && note.content.trim().length > 0);
    if (validNotes.length === 0) {
      return NextResponse.json({ success: false, error: "No valid notes found to summarize" }, { status: 400 });
    }

    const sortedNotes = [...validNotes].sort((a, b) => {
      const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return bTime - aTime;
    });

    const combinedContent = sortedNotes
      .map((note) => `# ${note.title}\n${note.content}`)
      .join("\n\n");

    const courseName = (sortedNotes[0] as { course?: { name: string } })?.course?.name;

    const { summary } = await summarizeNotes({
      content: combinedContent,
      title: "Study Guide",
      summaryType: "unit_aggregate",
      customInstruction: `Output style: ${safeStyle.replace("_", " ")}. Keep it student-friendly and include a study checklist.`,
      courseName,
    });

    return NextResponse.json({ success: true, summary });
  } catch (err) {
    console.error("[/api/notes/study-guide] Error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
