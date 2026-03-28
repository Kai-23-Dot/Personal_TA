"use client";

import { useState, useEffect } from "react";

export default function FocusPage() {
  const [seconds, setSeconds] = useState(1500);
  const [running, setRunning] = useState(false);
  const [task, setTask] = useState("");

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return (
    <section className="section" style={{ minHeight: "70vh" }}>
      <h2 className="animate-on-scroll">Focus Mode</h2>
      <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "600px", margin: "0 auto" }}>
        <div className="contact-form-column" style={{ textAlign: "center" }}>
          <input
            type="text"
            placeholder="What are you focusing on?"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            style={{ textAlign: "center" }}
          />
          <div style={{ fontSize: "3rem", marginTop: "1.5rem", color: "var(--light)" }}>
            {minutes}:{secs.toString().padStart(2, "0")}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem", marginTop: "1.5rem" }}>
            <button className="btn btn-secondary" onClick={() => setRunning((v) => !v)}>
              {running ? "Pause" : "Start"}
            </button>
            <button className="btn btn-secondary" onClick={() => setSeconds(1500)}>
              Reset
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
