"use client";

import { usePathname } from "next/navigation";
import { useChat } from "ai/react";
import { useRef, useEffect, useState } from "react";
import { MessageCircle, X, Send } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { usePageContent } from "@/frontend/contexts/page-context";
import { buildAssistantRequestContext } from "@/frontend/lib/assistantScreenContext";

const PAGE_CONTEXTS: Record<string, string> = {
  "/dashboard": "The student is on the main Dashboard page, which shows upcoming assignments due this week, course overview, and recommended practice topics.",
  "/assignments": "The student is on the Assignments page, which lists all their assignments with due dates, types (quiz, exam, project, homework), and AI summaries.",
  "/courses": "The student is on the Courses page, which shows all their connected courses from Canvas or Google Classroom.",
  "/notes": "The student is on the Notes page, where they can build AI study guides from their course materials.",
  "/practice": "The student is on the Practice page, where they can generate and take practice quizzes and tests on course topics.",
  "/flashcards": "The student is on the Flashcards page, where they can generate AI flashcards for spaced-repetition study.",
  "/grades": "The student is on the Grades page, which shows their grades and performance across courses.",
  "/chat": "The student is on the Chat page, their main conversation interface with their AI Teaching Assistant.",
  "/settings": "The student is on the Settings page, for managing their account, connected LMS platforms, and preferences.",
};

function getPageContext(pathname: string): string {
  if (PAGE_CONTEXTS[pathname]) return PAGE_CONTEXTS[pathname];
  for (const [path, ctx] of Object.entries(PAGE_CONTEXTS)) {
    if (pathname.startsWith(path + "/")) return ctx;
  }
  return "The student is browsing their Smartlearn dashboard.";
}

export function GlobalAssistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [sessionId] = useState(() => uuidv4());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const pathnameContext = getPageContext(pathname);
  const screenContent = usePageContent();

  // Full context: page description + actual visible content (if any page provides it)
  const fullContext = buildAssistantRequestContext(pathnameContext, screenContent);

  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
    api: "/api/chat/context",
    body: { sessionId, context: fullContext },
  });

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close AI Assistant" : "Open AI Assistant"}
        className="fixed bottom-[88px] right-4 z-40 flex h-13 w-13 items-center justify-center rounded-full border border-border bg-surface-1 text-primary shadow-md transition-[transform,background-color,border-color] duration-150 hover:border-primary/40 hover:bg-surface-2 active:scale-95 motion-reduce:transition-none md:bottom-8"
        style={{ height: "52px", width: "52px" }}
      >
        {open ? (
          <X className="h-5 w-5" />
        ) : (
          <MessageCircle className="h-5 w-5" />
        )}
      </button>

      {/* Panel */}
      <div
        style={{
          transition: "opacity 0.22s ease, transform 0.22s ease",
          opacity: open ? 1 : 0,
          transform: open ? "translateY(0) scale(1)" : "translateY(12px) scale(0.97)",
          pointerEvents: open ? "auto" : "none",
        }}
        className="fixed bottom-[160px] right-4 z-40 flex w-[min(340px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-lg motion-reduce:transition-none md:bottom-28 md:w-[380px]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">AI Assistant</p>
            <p className="text-[11px] text-muted-foreground">
              {screenContent ? "Current screen context connected" : "Aware of your current page"}
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close AI Assistant panel"
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex min-h-[180px] max-h-[340px] flex-col gap-3 overflow-y-auto p-4 scroll-smooth">
          {messages.length === 0 ? (
            <p className="mt-6 px-4 text-center text-xs leading-relaxed text-muted-foreground">
              Ask anything about your courses, assignments, or learning progress. I know what page you&apos;re on.
            </p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "rounded-br-sm bg-primary/15 text-foreground"
                      : "rounded-bl-sm bg-surface-2 text-foreground"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-start">
              <div className="rounded-lg rounded-bl-sm bg-surface-2 px-3 py-2.5">
                <div className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms] motion-reduce:animate-none" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms] motion-reduce:animate-none" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms] motion-reduce:animate-none" />
                </div>
              </div>
            </div>
          )}
          {error && (
            <p className="px-2 py-1 text-center text-xs text-danger">
              Something went wrong. Please try again.
            </p>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 border-t border-border p-3"
        >
          <input
            value={input}
            onChange={handleInputChange}
            placeholder="Ask anything..."
            className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={isLoading || !input.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </>
  );
}
