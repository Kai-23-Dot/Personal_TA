"use client";

import { useState, useEffect } from "react";
import { Pause, Play, RotateCcw, CheckCircle2 } from "lucide-react";
import { usePersistentState } from "@/frontend/hooks/usePersistentState";

// ── Mode presets ─────────────────────────────────────────────────────────────

// The three colours encode which mode is running, so they stay distinct — but
// they are drawn from the workspace palette rather than the old dark-theme
// pastels, which were near-invisible on paper. Each clears 3:1 on white, the
// WCAG 1.4.11 bar for a meaningful non-text graphic.
const MODES = [
  { label: "Focus",       seconds: 25 * 60, color: "var(--blue)" }, // workspace blue
  { label: "Short break", seconds:  5 * 60, color: "#047857" }, // green
  { label: "Long break",  seconds: 15 * 60, color: "#b45309" }, // amber
] as const;

type Mode = (typeof MODES)[number];

// ── Circular progress ring ────────────────────────────────────────────────────

const RADIUS = 120;
const STROKE = 8;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ProgressRing({
  progress,
  color,
  label,
}: {
  progress: number; // 0–1
  color: string;
  label: string;
}) {
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  return (
    <svg
      width={300}
      height={300}
      viewBox="0 0 300 300"
      className="absolute inset-0 -rotate-90"
      aria-label={label}
    >
      {/* Track */}
      <circle
        cx={150}
        cy={150}
        r={RADIUS}
        fill="none"
        stroke="var(--rule)"
        strokeWidth={STROKE}
      />
      {/* Progress */}
      <circle
        cx={150}
        cy={150}
        r={RADIUS}
        fill="none"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={dashOffset}
        style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.16,1,0.3,1), stroke 0.4s ease" }}
      />
      {/* Subtle outer glow ring */}
      <circle
        cx={150}
        cy={150}
        r={RADIUS + STROKE + 6}
        fill="none"
        stroke={color}
        strokeWidth={1}
        opacity={0.12}
        strokeDasharray={CIRCUMFERENCE * 1.1}
        strokeDashoffset={CIRCUMFERENCE * 1.1 * (1 - progress)}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.16,1,0.3,1), stroke 0.4s ease" }}
      />
    </svg>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function FocusPage() {
  const [modeIdx, setModeIdx] = useState(0);
  const [seconds, setSeconds] = useState(MODES[0].seconds);
  const [running, setRunning] = useState(false);
  // Persisted so what you're focusing on (and today's count) survives exit.
  const [task, setTask] = usePersistentState("smartlearn:focus:task", "");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [sessionCount, setSessionCount] = usePersistentState("smartlearn:focus:sessionCount", 0);

  const mode: Mode = MODES[modeIdx];
  const totalSeconds = mode.seconds;
  const progress = seconds / totalSeconds;

  const minutesDisplay = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secsDisplay = (seconds % 60).toString().padStart(2, "0");

  // Switch mode
  function switchMode(idx: number) {
    if (running) return;
    setModeIdx(idx);
    setSeconds(MODES[idx].seconds);
    setCompleted(false);
  }

  // Start/pause
  async function toggleRunning() {
    if (completed) return;

    if (!running) {
      // Start a focus session in DB only for the Focus mode
      if (modeIdx === 0 && !sessionId) {
        try {
          const res = await fetch("/api/focus", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });
          const data = await res.json();
          if (data?.session?.id) setSessionId(data.session.id);
        } catch {
          // Non-critical
        }
      }
    }
    setRunning((v) => !v);
  }

  // Reset
  function reset() {
    setRunning(false);
    setSeconds(totalSeconds);
    setCompleted(false);
    setSessionId(null);
  }

  // Tick
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          setRunning(false);
          setCompleted(true);
          if (modeIdx === 0) setSessionCount((c) => c + 1);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, modeIdx, setSessionCount]);

  // Save completed focus session
  useEffect(() => {
    if (!completed || !sessionId) return;
    fetch("/api/focus", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, status: "completed" }),
    }).catch(() => {});
  }, [completed, sessionId]);

  // Ambient glow colors per mode
  const glowStyle = {
    boxShadow: `0 0 120px -20px ${mode.color}28, 0 0 60px -30px ${mode.color}18`,
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl flex-col items-center justify-center px-4 pb-16 pt-8">

      {/* Mode tabs */}
      <div className="card mb-10 flex items-center gap-1 p-1 backdrop-blur">
        {MODES.map((m, i) => (
          <button
            key={m.label}
            onClick={() => switchMode(i)}
            disabled={running}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 disabled:opacity-40 ${
              modeIdx === i
                ? "bg-[var(--paper)] text-[var(--ink)] shadow-sm"
                : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
            style={modeIdx === i ? { color: m.color } : {}}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Timer ring */}
      <div
        className="relative flex h-[300px] w-[300px] items-center justify-center rounded-full"
        style={glowStyle}
      >
        <ProgressRing
          progress={progress}
          color={mode.color}
          label={`${minutesDisplay}:${secsDisplay} remaining`}
        />

        {/* Centre content */}
        <div className="relative z-10 flex flex-col items-center gap-1 select-none">
          {completed ? (
            <>
              <CheckCircle2 className="h-10 w-10 mb-1" style={{ color: mode.color }} />
              <p className="text-lg font-semibold text-[var(--ink)]">Done!</p>
              {modeIdx === 0 && (
                <p className="text-xs text-[var(--ink-muted)]">{sessionCount} session{sessionCount !== 1 ? "s" : ""} today</p>
              )}
            </>
          ) : (
            <>
              <span
                className="font-mono text-6xl font-semibold tracking-tight text-[var(--ink)] tabular-nums"
                style={{ textShadow: `0 0 40px ${mode.color}44` }}
              >
                {minutesDisplay}:{secsDisplay}
              </span>
              {task && (
                <p className="mt-1 max-w-[180px] truncate text-center text-xs font-medium text-[var(--ink-muted)]">
                  {task}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Task label */}
      <input
        type="text"
        placeholder="What are you focusing on?"
        value={task}
        onChange={(e) => setTask(e.target.value)}
        maxLength={60}
        className="card mt-8 w-full max-w-xs px-4 py-2.5 text-center text-sm text-[var(--ink)] placeholder-slate-500 outline-none transition focus: focus:bg-[var(--wash-hover)]"
      />

      {/* Controls */}
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={reset}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--rule)] bg-[var(--paper)] text-[var(--ink-muted)] transition hover:border-[var(--rule)] hover:bg-[var(--wash-hover)] hover:text-[var(--ink)]"
          aria-label="Reset"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        <button
          onClick={toggleRunning}
          disabled={completed}
          className="flex h-16 w-16 items-center justify-center rounded-full border text-[var(--ink)] shadow-none transition-all duration-200 disabled:opacity-40 hover:scale-105 active:scale-95"
          style={{
            background: `${mode.color}22`,
            borderColor: `${mode.color}55`,
            boxShadow: running ? `0 0 24px ${mode.color}44` : "none",
          }}
          aria-label={running ? "Pause" : "Start"}
        >
          {running
            ? <Pause className="h-6 w-6" fill="currentColor" />
            : <Play  className="h-6 w-6 translate-x-0.5" fill="currentColor" />
          }
        </button>

        {/* Session dots */}
        <div className="flex h-11 w-11 items-center justify-center">
          <div className="flex flex-wrap gap-1 w-6 justify-center">
            {Array.from({ length: Math.min(sessionCount, 4) }).map((_, i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: MODES[0].color }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Hint */}
      <p className="mt-8 text-xs text-[var(--ink-muted)]">
        {running
          ? "Stay focused — you've got this."
          : completed
          ? "Take a break, then start the next session."
          : "Press play to begin your session."}
      </p>
    </div>
  );
}
