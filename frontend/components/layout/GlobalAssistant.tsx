"use client";

import { usePathname } from "next/navigation";
import { useChat } from "ai/react";
import { useRef, useEffect, useState } from "react";
import { MessageCircle, X, Send } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { usePageContent } from "@/frontend/contexts/page-context";

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
  return "The student is browsing their Conlearn dashboard.";
}

export function GlobalAssistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [sessionId] = useState(() => uuidv4());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const pathnameContext = getPageContext(pathname);
  const screenContent = usePageContent();

  // Full context: page description + actual visible content (if any page provides it)
  const fullContext = screenContent
    ? `${pathnameContext}\n\nCURRENT SCREEN CONTENT:\n${screenContent}`
    : pathnameContext;

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
        aria-label="Open AI Assistant"
        className="fixed bottom-[88px] right-4 z-40 flex h-13 w-13 items-center justify-center rounded-full border border-sky-400/30 bg-[rgba(9,12,24,0.9)] shadow-[0_0_24px_rgba(56,189,248,0.15)] backdrop-blur transition-all hover:border-sky-400/50 hover:shadow-[0_0_32px_rgba(56,189,248,0.25)] active:scale-95 md:bottom-8"
        style={{ height: "52px", width: "52px" }}
      >
        {open ? (
          <X className="h-5 w-5 text-sky-300" />
        ) : (
          <MessageCircle className="h-5 w-5 text-sky-300" />
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
        className="fixed bottom-[160px] right-4 z-40 flex w-[340px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[rgba(9,12,24,0.97)] shadow-2xl backdrop-blur md:bottom-28 md:w-[380px]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-white">AI Assistant</p>
            <p className="text-[11px] text-slate-500">Aware of your current page</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/5 hover:text-slate-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex min-h-[180px] max-h-[340px] flex-col gap-3 overflow-y-auto p-4 scroll-smooth">
          {messages.length === 0 ? (
            <p className="mt-6 text-center text-xs text-slate-500 leading-relaxed px-4">
              Ask anything about your courses, assignments, or study plan. I know what page you&apos;re on.
            </p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "rounded-br-sm bg-sky-500/20 text-sky-100"
                      : "rounded-bl-sm bg-white/5 text-slate-200"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-white/5 px-3 py-2.5">
                <div className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
          {error && (
            <p className="text-center text-xs text-red-400 px-2 py-1">
              Something went wrong. Please try again.
            </p>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 border-t border-white/8 p-3"
        >
          <input
            value={input}
            onChange={handleInputChange}
            placeholder="Ask anything..."
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-sky-400/30 focus:bg-sky-500/5 transition-colors"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/20 text-sky-300 transition hover:bg-sky-500/30 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </>
  );
}
