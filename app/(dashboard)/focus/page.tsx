"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Pause, Play, RotateCcw, CheckCircle2 } from "lucide-react";

// ── Mode presets ─────────────────────────────────────────────────────────────

const MODES = [
  { label: "Focus",       seconds: 25 * 60, color: "#818cf8" }, // violet
  { label: "Short break", seconds:  5 * 60, color: "#34d399" }, // emerald
  { label: "Long break",  seconds: 15 * 60, color: "#38bdf8" }, // sky
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
        stroke="rgba(255,255,255,0.06)"
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
  const [task, setTask] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);

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
            body: JSON.stringify({ studyBlockId: null }),
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
  }, [running, modeIdx]);

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
      <div className="mb-10 flex items-center gap-1 rounded-2xl border border-white/8 bg-white/4 p-1 backdrop-blur">
        {MODES.map((m, i) => (
          <button
            key={m.label}
            onClick={() => switchMode(i)}
            disabled={running}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 disabled:opacity-40 ${
              modeIdx === i
                ? "bg-white/10 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
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
              <p className="text-lg font-semibold text-white">Done!</p>
              {modeIdx === 0 && (
                <p className="text-xs text-slate-400">{sessionCount} session{sessionCount !== 1 ? "s" : ""} today</p>
              )}
            </>
          ) : (
            <>
              <span
                className="font-mono text-6xl font-semibold tracking-tight text-white tabular-nums"
                style={{ textShadow: `0 0 40px ${mode.color}44` }}
              >
                {minutesDisplay}:{secsDisplay}
              </span>
              {task && (
                <p className="mt-1 max-w-[180px] truncate text-center text-xs font-medium text-slate-400">
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
        className="mt-8 w-full max-w-xs rounded-xl border border-white/10 bg-white/4 px-4 py-2.5 text-center text-sm text-white placeholder-slate-500 outline-none transition focus:border-white/20 focus:bg-white/6"
      />

      {/* Controls */}
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={reset}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
          aria-label="Reset"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        <button
          onClick={toggleRunning}
          disabled={completed}
          className="flex h-16 w-16 items-center justify-center rounded-full border text-white shadow-lg transition-all duration-200 disabled:opacity-40 hover:scale-105 active:scale-95"
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
      <p className="mt-8 text-xs text-slate-600">
        {running
          ? "Stay focused — you've got this."
          : completed
          ? "Take a break, then start the next session."
          : "Press play to begin your session."}
      </p>
    </div>
  );
}
