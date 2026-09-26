"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Library, Link2, Plus, Video } from "lucide-react";
import { courseTone } from "@/frontend/lib/course-tone";
import { useWorkspaceRefresh } from "@/frontend/lib/workspace-events";

type Notebook = {
  id: string;
  title: string;
  description: string | null;
  courseId: string | null;
  courseName: string | null;
  sourceCount: number;
  updatedAt: string;
};

type Course = { id: string; name: string };

export default function NotebooksPage() {
  const router = useRouter();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [notebooksRes, coursesRes] = await Promise.all([
        fetch("/api/notebooks"),
        fetch("/api/courses"),
      ]);
      const notebooksData = await notebooksRes.json().catch(() => []);
      const coursesData = await coursesRes.json().catch(() => []);
      setNotebooks(Array.isArray(notebooksData) ? notebooksData : []);
      setCourses(
        Array.isArray(coursesData)
          ? coursesData
          : Array.isArray(coursesData?.courses)
            ? coursesData.courses
            : []
      );
    } catch {
      setError("Could not load your notebooks.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useWorkspaceRefresh(["notes", "sync"], () => void load());

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || creating) return;

    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/notebooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          courseId: courseId || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not create that notebook.");
      // Straight into the new notebook — the next thing anyone wants to do is
      // add a source to it.
      router.push(`/notebooks/${data.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create that notebook.");
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] pb-20">
      <header className="mb-6 border-b border-[var(--rule)] pb-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center text-[var(--ink-faint)]">
              <Library className="h-7 w-7" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="page-title">Notebooks</h1>
              <p className="page-lede">
                Gather PDFs, slides, recordings and links in one place, then turn
                them into a study guide, a practice test, or flashcards.
              </p>
            </div>
          </div>

          {!formOpen ? (
            <button type="button" className="btn btn-primary" onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New notebook
            </button>
          ) : null}
        </div>
      </header>

      {formOpen ? (
        <form className="card card-body mb-6" onSubmit={handleCreate}>
          <h2 className="card-title">New notebook</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-[var(--ink)]">Name</span>
              <input
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Organic chemistry final"
                maxLength={120}
                className="h-9 rounded-[4px] border border-[var(--control-border)] bg-[var(--paper)] px-3 text-sm text-[var(--ink)] outline-none"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-[var(--ink)]">Course (optional)</span>
              <select
                value={courseId}
                onChange={(event) => setCourseId(event.target.value)}
                className="h-9 rounded-[4px] border border-[var(--control-border)] bg-[var(--paper)] px-2.5 text-sm text-[var(--ink)] outline-none"
              >
                <option value="">Not tied to a course</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary" disabled={!title.trim() || creating}>
                {creating ? "Creating..." : "Create notebook"}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setFormOpen(false);
                  setTitle("");
                  setError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>

          <p className="mt-3 text-[13px] text-[var(--ink-muted)]">
            Attaching a course means practice and flashcards you generate here
            show up alongside that course&apos;s other work.
          </p>

          {error ? (
            <p className="mt-3 text-[13px] text-[var(--danger-ink)]">{error}</p>
          ) : null}
        </form>
      ) : null}

      {loading ? (
        <div className="card card-body text-[13px] text-[var(--ink-muted)]">Loading notebooks...</div>
      ) : notebooks.length === 0 ? (
        <div className="card flex min-h-64 flex-col items-center justify-center p-8 text-center">
          <Library className="h-7 w-7 text-[var(--ink-faint)]" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-[var(--ink)]">No notebooks yet</p>
          <p className="mt-1 max-w-sm text-[13px] leading-6 text-[var(--ink-muted)]">
            A notebook holds the material a course sync does not: a textbook
            chapter, a lecture recording, an article your teacher linked.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-[13px] text-[var(--ink-muted)]">
            <span className="inline-flex items-center gap-1.5"><FileText className="h-4 w-4" aria-hidden="true" /> PDFs and slides</span>
            <span className="inline-flex items-center gap-1.5"><Link2 className="h-4 w-4" aria-hidden="true" /> Web pages</span>
            <span className="inline-flex items-center gap-1.5"><Video className="h-4 w-4" aria-hidden="true" /> Recordings</span>
          </div>
          <button type="button" className="btn btn-primary mt-6" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create your first notebook
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {notebooks.map((notebook) => (
            <Link key={notebook.id} href={`/notebooks/${notebook.id}`} className="card card-body block">
              <div className="flex items-start gap-3">
                <span className="badge-icon" data-course-tone={notebook.courseName ? courseTone(notebook.courseName) : undefined}>
                  <Library aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-[var(--ink)]">{notebook.title}</p>
                  <p className="mt-1 text-[13px] text-[var(--ink-muted)]">
                    {notebook.sourceCount === 0
                      ? "No sources yet"
                      : `${notebook.sourceCount} source${notebook.sourceCount === 1 ? "" : "s"}`}
                  </p>
                </div>
              </div>
              {notebook.courseName ? (
                <span className="course-chip mt-4" data-course-tone={courseTone(notebook.courseName)}>
                  {notebook.courseName}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
