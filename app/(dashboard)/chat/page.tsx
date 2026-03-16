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
    <section className="section">
      <h2 className="animate-on-scroll">TA Chat</h2>
      <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "0 auto" }}>
        <div className="contact-form-column">
          <h3 className="contact-form-title">Ask PersonalTA anything</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", minHeight: "320px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {messages.length === 0 ? (
                <p style={{ color: "var(--gray)" }}>Ask a question about your notes, assignments, or upcoming tests.</p>
              ) : null}
              {messages.map((message) => (
                <div key={message.id} style={{
                  alignSelf: message.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "80%",
                  background: message.role === "user" ? "rgba(0, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.08)",
                  padding: "0.8rem 1rem",
                  borderRadius: "12px",
                  color: "var(--light)",
                }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                </div>
              ))}
            </div>
            <form className="contact-form" onSubmit={handleSubmit}>
              <div className="form-field">
                <label htmlFor="chat">Your question</label>
                <textarea
                  id="chat"
                  placeholder="Explain photosynthesis from my notes..."
                  value={input}
                  onChange={handleInputChange}
                  rows={4}
                />
              </div>
              <button type="submit" className="contact-submit-btn" disabled={isLoading}>
                {isLoading ? "Thinking..." : "Send"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
