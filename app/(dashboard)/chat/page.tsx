"use client";

import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { useChat } from "ai/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Paperclip, X } from "lucide-react";

export default function ChatPage() {
  const sessionId = useMemo(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return String(Date.now());
  }, []);

  const [attachments, setAttachments] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, input, handleInputChange, handleSubmit, append, isLoading } = useChat({
    api: "/api/chat",
    body: { sessionId },
  });

  const CHIPS = [
    "Help me study for my next exam",
    "What assignments are due this week?",
    "Quiz me on a topic from my courses",
    "Explain a concept I'm struggling with",
  ];

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Revoke object URLs when previews change to avoid memory leaks
  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  const addFiles = useCallback((files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    setAttachments((prev) => [...prev, ...images]);
    setPreviewUrls((prev) => [...prev, ...images.map((f) => URL.createObjectURL(f))]);
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const imageFiles = Array.from(e.clipboardData.items)
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean) as File[];
    if (imageFiles.length === 0) return;
    e.preventDefault();
    addFiles(imageFiles);
  }, [addFiles]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    addFiles(Array.from(e.target.files));
    e.target.value = "";
  }, [addFiles]);

  const removeAttachment = useCallback((idx: number) => {
    URL.revokeObjectURL(previewUrls[idx]);
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
    setPreviewUrls((prev) => prev.filter((_, i) => i !== idx));
  }, [previewUrls]);

  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!input.trim() && attachments.length === 0) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handleSubmit(e, { experimental_attachments: attachments.length > 0 ? attachments : undefined } as any);
      setAttachments([]);
      setPreviewUrls([]);
    },
    [handleSubmit, input, attachments],
  );

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
        {/* ── Message list ── */}
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
              <p style={{ fontSize: "2rem", marginBottom: "0.75rem", color: "#e6edf8", fontWeight: 600, lineHeight: 1.2 }}>
                How can I help?
              </p>
              <p style={{ color: "#9aa8bf", marginBottom: "1.5rem" }}>
                Ask anything about your classes, notes, assignments, or exam prep.
                Paste a screenshot with <kbd style={{ background: "rgba(148,163,184,0.15)", borderRadius: "4px", padding: "1px 5px", fontSize: "0.8em" }}>Ctrl+V</kbd> or use the attach button.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "center" }}>
                {CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => append({ role: "user", content: chip })}
                    disabled={isLoading}
                    style={{
                      padding: "0.45rem 0.9rem",
                      borderRadius: "999px",
                      border: "1px solid rgba(125,211,252,0.25)",
                      background: "rgba(125,211,252,0.06)",
                      color: "#7dd3fc",
                      fontSize: "0.82rem",
                      cursor: "pointer",
                      transition: "background 0.15s, border-color 0.15s",
                      whiteSpace: "nowrap",
                    }}
                    onMouseOver={(e) => { (e.currentTarget.style.background = "rgba(125,211,252,0.14)"); (e.currentTarget.style.borderColor = "rgba(125,211,252,0.45)"); }}
                    onMouseOut={(e) => { (e.currentTarget.style.background = "rgba(125,211,252,0.06)"); (e.currentTarget.style.borderColor = "rgba(125,211,252,0.25)"); }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", paddingBottom: "0.5rem" }}>
              {messages.map((message) => {
                const isUser = message.role === "user";
                // experimental_attachments typed as any since SDK type varies
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const imageAttachments: any[] = (message as any).experimental_attachments?.filter(
                  (a: any) => a.contentType?.startsWith("image/"),
                ) ?? [];

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
                    {/* Attached images */}
                    {imageAttachments.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: message.content ? "0.6rem" : 0 }}>
                        {imageAttachments.map((att: any, i: number) => (
                          <img
                            key={i}
                            src={att.url}
                            alt={att.name ?? "screenshot"}
                            style={{
                              maxWidth: "100%",
                              maxHeight: "360px",
                              borderRadius: "10px",
                              objectFit: "contain",
                              border: "1px solid rgba(56, 189, 248, 0.25)",
                            }}
                          />
                        ))}
                      </div>
                    )}
                    {message.content && (
                      <div className="md-content chat-readable" style={{ margin: 0, color: "#e6edf8" }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                );
              })}

              {isLoading && (
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
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── Input form ── */}
        <form onSubmit={onSubmit} style={{ position: "sticky", bottom: 0 }}>
          {/* Pending attachment previews */}
          {attachments.length > 0 && (
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
              {attachments.map((file, i) => (
                <div key={i} style={{ position: "relative" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrls[i]}
                    alt={file.name}
                    style={{
                      width: "72px",
                      height: "72px",
                      objectFit: "cover",
                      borderRadius: "8px",
                      border: "1px solid rgba(56, 189, 248, 0.5)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    aria-label="Remove attachment"
                    style={{
                      position: "absolute",
                      top: "-6px",
                      right: "-6px",
                      width: "18px",
                      height: "18px",
                      borderRadius: "50%",
                      background: "#1e293b",
                      border: "1px solid rgba(148, 163, 184, 0.4)",
                      color: "#94a3b8",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 0,
                    }}
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              gap: "0.6rem",
              padding: "0.7rem",
              borderRadius: "14px",
              background: "rgba(12, 18, 32, 0.94)",
              border: "1px solid rgba(148, 163, 184, 0.28)",
              boxShadow: "0 14px 42px rgba(1, 6, 19, 0.45)",
            }}
          >
            {/* Attach button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach screenshot (or paste with Ctrl+V)"
              style={{
                alignSelf: "end",
                width: "44px",
                height: "44px",
                borderRadius: "10px",
                border: "1px solid rgba(148, 163, 184, 0.28)",
                background: attachments.length > 0
                  ? "rgba(56, 189, 248, 0.18)"
                  : "rgba(148, 163, 184, 0.10)",
                color: attachments.length > 0 ? "#38bdf8" : "#9aa8bf",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Paperclip size={18} />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={handleFileChange}
            />

            <textarea
              value={input}
              onChange={handleInputChange}
              onPaste={handlePaste}
              placeholder="Message Conlearn... (paste screenshot with Ctrl+V)"
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
              disabled={isLoading || (!input.trim() && attachments.length === 0)}
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
