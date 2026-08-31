"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command as CommandPrimitive } from "cmdk";
import {
  BookOpen,
  Brain,
  CalendarCheck,
  FileText,
  Layers3,
  Loader2,
  Search,
  Timer,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/frontend/components/ui/dialog";
import { accountNavItems, workspaceNavGroups } from "@/frontend/lib/nav-items";

type SearchRecord = Record<string, unknown>;
type CommandEntry = {
  id: string;
  label: string;
  description?: string;
  href: string;
  icon: LucideIcon;
  keywords?: string[];
};

const primaryActions: CommandEntry[] = [
  { id: "action-practice", label: "Create practice", description: "Generate a test from course material", href: "/practice", icon: Brain, keywords: ["quiz", "test"] },
  { id: "action-flashcards", label: "Create flashcards", description: "Build or continue a study deck", href: "/flashcards", icon: Layers3, keywords: ["deck", "review"] },
  { id: "action-review", label: "Review due work", description: "Open the combined review queue", href: "/review", icon: CalendarCheck, keywords: ["weak", "due"] },
  { id: "action-focus", label: "Start a focus session", description: "Open the distraction-free timer", href: "/focus", icon: Timer, keywords: ["timer", "pomodoro"] },
];

function rows(value: unknown): SearchRecord[] {
  return Array.isArray(value) ? value.filter((item): item is SearchRecord => Boolean(item) && typeof item === "object") : [];
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function WorkspaceCommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const loadedRef = useRef(false);
  const loadingRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [courseEntries, setCourseEntries] = useState<CommandEntry[]>([]);
  const [assignmentEntries, setAssignmentEntries] = useState<CommandEntry[]>([]);
  const [noteEntries, setNoteEntries] = useState<CommandEntry[]>([]);

  const navigationEntries = useMemo<CommandEntry[]>(() => [
    ...workspaceNavGroups.flatMap((group) => group.items),
    ...accountNavItems,
  ].map((item) => ({
    id: `navigation-${item.href}`,
    label: item.label,
    description: "Workspace page",
    href: item.href,
    icon: item.icon,
  })), []);

  useEffect(() => {
    if (!open || loadedRef.current || loadingRef.current) return;
    let active = true;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch("/api/courses").then((response) => response.ok ? response.json() : []),
      fetch("/api/assignments").then((response) => response.ok ? response.json() : []),
      fetch("/api/notes/list").then((response) => response.ok ? response.json() : []),
    ])
      .then(([courses, assignments, notes]) => {
        if (!active) return;
        setCourseEntries(rows(courses).slice(0, 40).map((course) => ({
          id: `course-${textValue(course.id)}`,
          label: textValue(course.name) || "Untitled course",
          description: [textValue(course.section), textValue(course.teacher_name)].filter(Boolean).join(" · ") || "Course",
          href: `/courses/${encodeURIComponent(textValue(course.id))}`,
          icon: BookOpen,
        })));
        setAssignmentEntries(rows(assignments).slice(0, 80).map((assignment) => {
          const joinedCourse = assignment.course && typeof assignment.course === "object" && !Array.isArray(assignment.course)
            ? assignment.course as SearchRecord
            : null;
          return {
            id: `assignment-${textValue(assignment.id)}`,
            label: textValue(assignment.title) || "Untitled assignment",
            description: textValue(joinedCourse?.name) || "Assignment",
            href: `/assignments?assignmentId=${encodeURIComponent(textValue(assignment.id))}`,
            icon: CalendarCheck,
          };
        }));
        setNoteEntries(rows(notes).slice(0, 60).map((note) => ({
          id: `note-${textValue(note.id)}`,
          label: textValue(note.title) || textValue(note.file_name) || "Untitled note",
          description: [textValue(note.unit_name), textValue(note.file_type)].filter(Boolean).join(" · ") || "Note or course material",
          href: `/notes?noteId=${encodeURIComponent(textValue(note.id))}`,
          icon: FileText,
        })));
        loadedRef.current = true;
      })
      .catch(() => {
        if (active) setError("Workspace records could not be loaded. Navigation and actions are still available.");
      })
      .finally(() => {
        loadingRef.current = false;
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    const invalidate = () => { loadedRef.current = false; };
    window.addEventListener("smartlearn:sync-complete", invalidate);
    return () => window.removeEventListener("smartlearn:sync-complete", invalidate);
  }, []);

  function select(entry: CommandEntry) {
    onOpenChange(false);
    router.push(entry.href);
  }

  function group(label: string, entries: CommandEntry[]) {
    if (!entries.length) return null;
    return (
      <CommandPrimitive.Group heading={label} className="px-2 py-1 text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:font-medium">
        {entries.map((entry) => {
          const Icon = entry.icon;
          return (
            <CommandPrimitive.Item
              key={entry.id}
              value={[entry.label, entry.description, ...(entry.keywords ?? [])].filter(Boolean).join(" ")}
              onSelect={() => select(entry)}
              className="flex min-h-11 cursor-default select-none items-center gap-3 rounded-md px-2.5 py-2 text-sm text-foreground outline-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
            >
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{entry.label}</span>
                {entry.description ? <span className="block truncate text-xs text-muted-foreground">{entry.description}</span> : null}
              </span>
            </CommandPrimitive.Item>
          );
        })}
      </CommandPrimitive.Group>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[12vh] w-[calc(100%-1rem)] max-w-2xl translate-y-0 overflow-hidden rounded-lg p-0 shadow-lg data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 motion-reduce:animate-none sm:w-[calc(100%-3rem)] [&>button]:hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Search Smartlearn</DialogTitle>
          <DialogDescription>Search pages, courses, assignments, notes, and study actions.</DialogDescription>
        </DialogHeader>
        <CommandPrimitive role="search" aria-label="Search Smartlearn" label="Search Smartlearn" loop className="bg-card text-foreground">
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <CommandPrimitive.Input
              autoFocus
              aria-label="Search workspace"
              placeholder="Search courses, assignments, notes, or actions…"
              className="h-14 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden rounded border border-border bg-surface-1 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">Esc</kbd>
          </div>
          <CommandPrimitive.List className="max-h-[min(65vh,32rem)] overflow-y-auto p-1.5">
            {loading ? (
              <CommandPrimitive.Loading className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading workspace…
              </CommandPrimitive.Loading>
            ) : null}
            <CommandPrimitive.Empty className="px-4 py-10 text-center text-sm text-muted-foreground">No matching workspace item.</CommandPrimitive.Empty>
            {error ? <p className="mx-2 my-2 rounded-md border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">{error}</p> : null}
            {group("Actions", primaryActions)}
            {group("Navigation", navigationEntries)}
            {group("Courses", courseEntries)}
            {group("Assignments", assignmentEntries)}
            {group("Notes & materials", noteEntries)}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}
