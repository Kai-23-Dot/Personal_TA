"use client";

import { useMemo } from "react";
import { useChat } from "ai/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function ChatPage() {
  const sessionId = useMemo(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return String(Date.now());
  }, []);

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: "/api/chat",
    body: { sessionId },
  });

  return (
    <section className="section" style={{ paddingTop: "1.25rem" }}>
      <div
        style={{
          maxWidth: "960px",
          margin: "0 auto",
          minHeight: "calc(100vh - 210px)",
          display: "grid",
          gridTemplateRows: "1fr auto",
          gap: "1rem",
        }}
      >
        <div
          style={{
            border: "1px solid rgba(148, 163, 184, 0.24)",
            borderRadius: "16px",
            background: "rgba(15, 22, 38, 0.72)",
            padding: "1rem",
            overflowY: "auto",
          }}
        >
          {messages.length === 0 ? (
            <div style={{ maxWidth: "600px", margin: "12vh auto 0", textAlign: "center" }}>
              <h2 style={{ fontSize: "2rem", marginBottom: "0.75rem", color: "#e6edf8" }}>How can I help?</h2>
              <p style={{ color: "#9aa8bf" }}>
                Ask anything about your classes, notes, assignments, or exam prep.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", paddingBottom: "0.5rem" }}>
              {messages.map((message) => {
                const isUser = message.role === "user";
                return (
                  <div
                    key={message.id}
                    style={{
                      alignSelf: isUser ? "flex-end" : "flex-start",
                      maxWidth: "min(82%, 760px)",
                      borderRadius: "14px",
                      padding: "0.85rem 1rem",
                      background: isUser
                        ? "linear-gradient(135deg, rgba(34, 211, 238, 0.22), rgba(99, 102, 241, 0.28))"
                        : "rgba(255, 255, 255, 0.06)",
                      border: isUser
                        ? "1px solid rgba(56, 189, 248, 0.42)"
                        : "1px solid rgba(148, 163, 184, 0.22)",
                    }}
                  >
                    <div className="md-content chat-readable" style={{ margin: 0, color: "#e6edf8" }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                    </div>
                  </div>
                );
              })}
              {isLoading ? (
                <div
                  style={{
                    alignSelf: "flex-start",
                    borderRadius: "14px",
                    padding: "0.7rem 0.9rem",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(148, 163, 184, 0.2)",
                    color: "#9aa8bf",
                    fontSize: "0.9rem",
                  }}
                >
                  Thinking...
                </div>
              ) : null}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} style={{ position: "sticky", bottom: 0 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: "0.6rem",
              padding: "0.7rem",
              borderRadius: "14px",
              background: "rgba(12, 18, 32, 0.94)",
              border: "1px solid rgba(148, 163, 184, 0.28)",
              boxShadow: "0 14px 42px rgba(1, 6, 19, 0.45)",
            }}
          >
            <textarea
              value={input}
              onChange={handleInputChange}
              placeholder="Message PersonalTA..."
              rows={1}
              style={{
                resize: "vertical",
                minHeight: "44px",
                maxHeight: "220px",
                padding: "0.7rem 0.85rem",
                borderRadius: "10px",
                border: "1px solid rgba(148, 163, 184, 0.28)",
                background: "rgba(148, 163, 184, 0.12)",
                color: "#e6edf8",
                caretColor: "#e6edf8",
              }}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="btn btn-primary"
              style={{ minWidth: "96px", alignSelf: "end" }}
            >
              {isLoading ? "..." : "Send"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
