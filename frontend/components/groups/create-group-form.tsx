"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { Textarea } from "@/frontend/components/ui/textarea";
import {
  MeetingSlotBuilder,
  emptySlot,
  slotsAreValid,
  type MeetingSlotDraft,
} from "./meeting-slot-builder";

type Course = { id: string; name: string };

const SELECT_CLASS =
  "flex h-9 w-full items-center rounded-md border border-input bg-background/50 px-3 py-1 text-sm shadow-sm transition-all duration-200 ease-smooth-out hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring/60";

function tomorrowUtc(): string {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

/**
 * Goal-bound group creation. Unlike a generic "new group" form, this one
 * refuses to create an open-ended hangout: a goal, a target end date, and at
 * least one recurring meeting slot are required before submit unlocks.
 */
export function CreateGroupForm({
  onCreated,
  onClose,
}: {
  onCreated: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [goal, setGoal] = useState("");
  const [targetEndDate, setTargetEndDate] = useState("");
  const [courseId, setCourseId] = useState("");
  const [slots, setSlots] = useState<MeetingSlotDraft[]>([emptySlot()]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/courses")
      .then((r) => r.json())
      .then((data) => { if (mounted) setCourses(Array.isArray(data) ? data : []); })
      .catch(() => { if (mounted) setCourses([]); });
    return () => { mounted = false; };
  }, []);

  const valid =
    name.trim().length > 0 &&
    goal.trim().length > 0 &&
    targetEndDate >= tomorrowUtc() &&
    slotsAreValid(slots);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || undefined,
        courseId: courseId || null,
        goal: goal.trim(),
        targetEndDate,
        meetings: slots,
      }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok) {
      setError(data?.error ?? "Failed to create group");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    onClose();
    await onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 mb-6 space-y-4 rounded-xl border border-sky-400/20 bg-white/3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Create a goal-bound group</p>
        <button type="button" onClick={onClose} aria-label="Close create form" className="text-muted-foreground transition-colors hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="groupName">Group name *</Label>
          <Input
            id="groupName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="AP Chem crunch squad"
            maxLength={80}
            required
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="groupCourse">Course (optional)</Label>
          <select
            id="groupCourse"
            className={SELECT_CLASS}
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            <option value="">No course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="groupGoal">Goal — what will this group finish? *</Label>
        <Textarea
          id="groupGoal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder='e.g. "Finish units 5-7 review before the final"'
          maxLength={500}
          rows={2}
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="groupTargetDate">Target end date *</Label>
          <Input
            id="groupTargetDate"
            type="date"
            value={targetEndDate}
            min={tomorrowUtc()}
            onChange={(e) => setTargetEndDate(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="groupDescription">Description (optional)</Label>
          <Input
            id="groupDescription"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Anything members should know"
            maxLength={500}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Recurring meetings — at least one *</Label>
        <MeetingSlotBuilder slots={slots} onChange={setSlots} />
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <Button type="submit" disabled={submitting || !valid}>
        {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Create group
      </Button>
    </form>
  );
}
