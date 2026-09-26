"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Image as ImageIcon,
  Layers,
  Library,
  Link2,
  Loader2,
  Music,
  Target,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import { courseTone } from "@/frontend/lib/course-tone";
import { notifyWorkspaceChanged } from "@/frontend/lib/workspace-events";

type Source = {
  id: string;
  title: string;
  kind: string;
  url: string | null;
  fileName: string | null;
  fileType: string | null;
  wordCount: number;
  createdAt: string;
};

type Notebook = {
  id: string;
  title: string;
  description: string | null;
  courseId: string | null;
  courseName: string | null;
  sources: Source[];
};

/** Mirrors the extensions backend/utils/uploadValidation.ts accepts. */
const ACCEPTED =
  ".pdf,.docx,.pptx,.txt,.md,.png,.jpg,.jpeg,.gif,.mp3,.m4a,.wav,.webm";

function SourceIcon({ source }: { source: Source }) {
  const Icon =
    source.kind === "youtube" || source.fileType === "video"
      ? Video
      : source.kind === "url"
        ? Link2
        : source.fileType === "audio"
          ? Music
          : source.fileType === "image"
            ? ImageIcon
            : FileText;
  return (
    <span className="badge-icon">
      <Icon aria-hidden="true" />
    </span>
  );
}

export default function NotebookDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const notebookId = params.id;

  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkValue, setLinkValue] = useState("");
  const [busy, setBusy] = useState<null | "link" | "file" | "study_guide" | "practice" | "flashcards">(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string; hint?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/notebooks/${notebookId}`);
    if (res.status === 404) {
      router.replace("/notebooks");
      return;
    }
    const data = await res.json().catch(() => null);
    if (data?.id) setNotebook(data);
    setLoading(false);
  }, [notebookId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function importLink(event: React.FormEvent) {
    event.preventDefault();
    const url = linkValue.trim();
    if (!url || busy) return;

    setBusy("link");
    setMessage(null);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage({ tone: "bad", text: data?.error ?? "That link could not be imported.", hint: data?.hint });
        return;
      }
      setLinkValue("");
      setMessage({ tone: "ok", text: `Added “${data.source.title}”.` });
      notifyWorkspaceChanged("notes");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function importFiles(files: FileList | null) {
    if (!files || files.length === 0 || busy) return;
    setBusy("file");
    setMessage(null);

    let added = 0;
    const failures: string[] = [];

    // One at a time: each upload extracts text and embeds it, and running them
    // together would make a slow request slower and the failures harder to
    // attribute to a file.
    for (const file of Array.from(files)) {
      const body = new FormData();
      body.append("file", file);
      body.append("notebookId", notebookId);
      try {
        const res = await fetch("/api/notes/upload", { method: "POST", body });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success !== false) added += 1;
        else failures.push(`${file.name}: ${data?.error ?? "could not be read"}`);
      } catch {
        failures.push(`${file.name}: upload failed`);
      }
    }

    setMessage(
      failures.length === 0
        ? { tone: "ok", text: `Added ${added} file${added === 1 ? "" : "s"}.` }
        : { tone: "bad", text: failures.join(" · ") }
    );
    if (added > 0) notifyWorkspaceChanged("notes");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setBusy(null);
    await load();
  }

  async function removeSource(sourceId: string) {
    const res = await fetch(`/api/notes/${sourceId}`, { method: "DELETE" });
    if (res.ok) {
      notifyWorkspaceChanged("notes");
      await load();
    }
  }

  async function generate(type: "study_guide" | "practice" | "flashcards") {
    if (busy) return;
    setBusy(type);
    setMessage(null);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage({ tone: "bad", text: data?.error ?? "That could not be generated." });
        return;
      }

      if (type === "practice" && data?.sessionId) {
        router.push(`/practice/session?sessionId=${data.sessionId}`);
        return;
      }
      if (type === "flashcards") {
        notifyWorkspaceChanged("flashcards");
        setMessage({ tone: "ok", text: "Flashcards created. Open Flashcards to study them." });
        return;
      }

      notifyWorkspaceChanged("notes");
      setMessage({ tone: "ok", text: "Study guide added to this notebook." });
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <div className="card card-body text-[13px] text-[var(--ink-muted)]">Loading notebook...</div>;
  }
  if (!notebook) return null;

  const hasSources = notebook.sources.length > 0;

  return (
    <div className="mx-auto max-w-[1100px] pb-20">
      <Link
        href="/notebooks"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All notebooks
      </Link>

      <header className="mb-6 border-b border-[var(--rule)] pb-6">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center text-[var(--ink-faint)]">
            <Library className="h-7 w-7" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="page-title">{notebook.title}</h1>
            <p className="page-lede">
              {hasSources
                ? `${notebook.sources.length} source${notebook.sources.length === 1 ? "" : "s"}. Smartlearn reads all of them when it builds anything here.`
                : "Add a PDF, a recording, or a link to get started."}
            </p>
            {notebook.courseName ? (
              <span className="course-chip mt-3" data-course-tone={courseTone(notebook.courseName)}>
                {notebook.courseName}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.5fr)]">
        <div className="grid gap-4">
          {/* ── Add a source ───────────────────────────────────────────── */}
          <section className="card card-body">
            <h2 className="card-title">Add a source</h2>
            <p className="card-subtitle">
              PDFs, slides, documents, images, and audio or video recordings.
              Or paste a link to an article or a YouTube video.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ACCEPTED}
                  className="sr-only"
                  id="notebook-file"
                  onChange={(event) => void importFiles(event.target.files)}
                />
                <label
                  htmlFor="notebook-file"
                  className="flex h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-[var(--control-border)] bg-[var(--paper-sunken)] text-center text-[13px] text-[var(--ink-muted)] transition-colors hover:bg-[var(--wash-hover)]"
                >
                  {busy === "file" ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                      Reading your files...
                    </>
                  ) : (
                    <>
                      <Upload className="h-5 w-5" aria-hidden="true" />
                      Choose files
                      <span className="text-[12px] text-[var(--ink-faint)]">PDF, DOCX, PPTX, TXT, MD, images, audio</span>
                    </>
                  )}
                </label>
              </div>

              <form onSubmit={importLink} className="flex flex-col justify-center gap-2">
                <label htmlFor="notebook-link" className="text-[13px] font-medium text-[var(--ink)]">
                  Paste a link
                </label>
                <input
                  id="notebook-link"
                  value={linkValue}
                  onChange={(event) => setLinkValue(event.target.value)}
                  placeholder="https://... or a YouTube link"
                  className="h-9 rounded-[4px] border border-[var(--control-border)] bg-[var(--paper)] px-3 text-sm text-[var(--ink)] outline-none"
                />
                <button type="submit" className="btn" disabled={!linkValue.trim() || busy !== null}>
                  {busy === "link" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Reading the page...
                    </>
                  ) : (
                    "Import link"
                  )}
                </button>
              </form>
            </div>

            {message ? (
              <div
                className={`mt-4 rounded-[8px] px-3.5 py-3 text-[13px] ${
                  message.tone === "ok"
                    ? "bg-[var(--success-bg)] text-[var(--success-ink)]"
                    : "bg-[var(--danger-bg)] text-[var(--danger-ink)]"
                }`}
              >
                <p>{message.text}</p>
                {message.hint ? <p className="mt-1 opacity-90">{message.hint}</p> : null}
              </div>
            ) : null}
          </section>

          {/* ── Sources ────────────────────────────────────────────────── */}
          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title">Sources</h2>
                <p className="card-subtitle">Everything Smartlearn reads for this notebook.</p>
              </div>
            </div>

            {!hasSources ? (
              <div className="card-body text-[13px] text-[var(--ink-muted)]">
                Nothing here yet. Add a file or a link above.
              </div>
            ) : (
              <ul className="divide-y divide-[var(--rule)]">
                {notebook.sources.map((source) => (
                  <li key={source.id} className="flex items-center gap-3 px-5 py-3.5">
                    <SourceIcon source={source} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-[var(--ink)]">{source.title}</p>
                      <p className="mt-0.5 truncate text-[12px] text-[var(--ink-muted)]">
                        {source.wordCount > 0 ? `${source.wordCount.toLocaleString()} words` : "No text extracted"}
                        {source.url ? ` · ${new URL(source.url).hostname}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeSource(source.id)}
                      aria-label={`Remove ${source.title}`}
                      className="shrink-0 rounded-[4px] p-1.5 text-[var(--ink-faint)] transition-colors hover:bg-[var(--wash-hover)] hover:text-[var(--danger-ink)]"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ── Generate ─────────────────────────────────────────────────── */}
        <section className="card card-body h-fit">
          <h2 className="card-title">Make something</h2>
          <p className="card-subtitle">Built from every source in this notebook.</p>

          <div className="mt-4 grid gap-2">
            {([
              { type: "study_guide", label: "Study guide", note: "One organised summary", icon: FileText },
              { type: "practice", label: "Practice test", note: "Questions from these sources", icon: Target },
              { type: "flashcards", label: "Flashcards", note: "A deck to review", icon: Layers },
            ] as const).map(({ type, label, note, icon: Icon }) => (
              <button
                key={type}
                type="button"
                onClick={() => void generate(type)}
                disabled={!hasSources || busy !== null}
                className="flex w-full items-center gap-3 rounded-[8px] border border-[var(--rule)] bg-[var(--paper)] px-3.5 py-3 text-left transition-colors hover:bg-[var(--wash-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="badge-icon">
                  {busy === type ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Icon aria-hidden="true" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium text-[var(--ink)]">{label}</span>
                  <span className="block text-[12px] text-[var(--ink-muted)]">{note}</span>
                </span>
              </button>
            ))}
          </div>

          {!hasSources ? (
            <p className="mt-3 text-[12px] text-[var(--ink-muted)]">
              Add a source first — there is nothing to build from yet.
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
