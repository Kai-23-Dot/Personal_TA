"use client";

import { useEffect, useMemo } from "react";
import { useChat } from "ai/react";
import { Bot, Send } from "lucide-react";
import type { DashboardAssignment } from "@/frontend/components/dashboard/dashboard-types";
import { Button } from "@/frontend/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/frontend/components/ui/dialog";

function descriptionText(description: string | null | undefined) {
  if (!description) return "No instructions available.";
  if (typeof document === "undefined") return description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const parsed = new DOMParser().parseFromString(description, "text/html");
  return (parsed.body.textContent ?? description).replace(/\s+/g, " ").trim();
}

export function AssignmentCoach({ assignment, open, onOpenChange }: { assignment: DashboardAssignment | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const sessionId = useMemo(() => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()), []);
  const context = useMemo(() => assignment ? [
    `Assignment: ${assignment.title}`,
    `Course: ${assignment.course?.name ?? "Unknown"}`,
    `Type: ${assignment.assignment_type ?? "assignment"}`,
    `Instructions: ${descriptionText(assignment.description)}`,
    "ASSIGNMENT COACH MODE (mandatory): Help the student learn without completing graded work. Do not provide a final answer, finished response, completed worksheet, or submission-ready text. Ask what they have tried, give one useful hint or concept explanation at a time, use questions to guide their reasoning, and offer feedback on the student's own attempt.",
  ].join("\n") : "", [assignment]);
  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages } = useChat({ api: "/api/chat/context", body: { sessionId, context } });

  useEffect(() => { setMessages([]); }, [assignment?.id, setMessages]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,44rem)] w-[calc(100%-1rem)] max-w-xl flex-col overflow-hidden rounded-lg p-0 sm:w-[calc(100%-3rem)]">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2"><Bot className="h-4 w-4 text-primary" />{assignment?.title ?? "Assignment coach"}</DialogTitle>
          <DialogDescription>Guidance, explanations, and feedback—not completed work.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4" aria-live="polite">
          {messages.length === 0 ? <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">Tell me where you are stuck and show what you have tried. I can explain the concept, offer a hint, or review your approach.</div> : messages.map((message) => <div key={message.id} className={`max-w-[90%] rounded-lg border px-3 py-2.5 text-sm leading-6 ${message.role === "user" ? "ml-auto border-primary/25 bg-primary/10 text-foreground" : "border-border bg-surface-1 text-foreground"}`}>{typeof message.content === "string" ? message.content : JSON.stringify(message.content)}</div>)}
          {isLoading ? <p className="text-xs text-muted-foreground">Thinking…</p> : null}
        </div>
        <form onSubmit={handleSubmit} className="flex gap-2 border-t border-border p-3 sm:p-4">
          <label className="min-w-0 flex-1"><span className="sr-only">Message the assignment coach</span><input value={input} onChange={handleInputChange} placeholder="Share your attempt or ask for a hint…" className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" /></label>
          <Button type="submit" disabled={isLoading || !input.trim()} className="h-11 px-4"><Send className="h-4 w-4" /><span className="sr-only sm:not-sr-only">Send</span></Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
