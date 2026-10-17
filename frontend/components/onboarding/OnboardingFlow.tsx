"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, Check, FileText, GraduationCap, Search, Users, Video, MessageCircle, Globe, CalendarDays, Star, Loader2, type LucideIcon } from "lucide-react";
import { CanvasConnectionWizard } from "./CanvasConnectionWizard";
import "./onboarding.css";

const sources: [string, string, string, LucideIcon][] = [
  ["friends", "Friends or family", "Personal recommendation", Users],
  ["school", "Teacher or school", "In the classroom", GraduationCap],
  ["google", "Google", "Search engine", Search],
  ["youtube", "YouTube", "Videos & tutorials", Video],
  ["instagram", "Instagram", "Social media", Globe],
  ["tiktok", "TikTok", "Social media", Video],
  ["reddit", "Reddit", "Community", MessageCircle],
  ["discord", "Discord", "Community", MessageCircle],
  ["ai", "ChatGPT or another AI", "AI recommendation", Search],
  ["other", "Somewhere else", "Your own discovery", Globe],
];
const intentions: [string, string, string, LucideIcon][] = [
  ["learning", "Understand my classes", "Break down tough concepts and learn at my own pace.", BookOpen],
  ["exams", "Prepare for exams", "Practice what I know and see what needs more work.", GraduationCap],
  ["planning", "Stay on top of school", "Keep assignments, deadlines, and study time organized.", CalendarDays],
  ["notes", "Make better study notes", "Turn class materials into notes I can actually use.", FileText],
];
const reviews = [
  { name: "Emily R.", role: "High school student", initials: "ER", quote: "I used to spend more time figuring out what to study than actually studying. Having my notes and assignments together makes starting so much easier." },
  { name: "Liam T.", role: "College student", initials: "LT", quote: "The practice questions help me notice what I don’t understand before a test. It feels a lot more useful than just rereading my notes." },
  { name: "Maya S.", role: "AP student", initials: "MS", quote: "With a few different classes to keep up with, seeing what’s due in one place is exactly what I needed for my Sunday planning." },
];

type Props = { initialSteps: Record<string, boolean>; connected: boolean; pendingConnection?: { id: string; domain: string | null } };

export function OnboardingFlow({ initialSteps, connected, pendingConnection }: Props) {
  const router = useRouter();
  const [steps, setSteps] = useState(initialSteps);
  const [stage, setStage] = useState(initialSteps.introComplete || connected || pendingConnection ? 3 : initialSteps.discoveryComplete ? 2 : initialSteps.welcomeComplete ? 1 : 0);
  const [canvasStep, setCanvasStep] = useState(pendingConnection ? 4 : 0);
  const ready = connected;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); window.scrollTo(0, 0); }, [stage]);
  const currentStep = ready ? 8 : stage === 3 ? canvasStep + 4 : stage + 1;

  async function save(next: Record<string, boolean>, finish = false) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/onboarding", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ steps: next, completed: finish }) });
      if (!response.ok) throw new Error("We couldn’t save your progress. Please try again.");
      setSteps(next);
      if (finish) { router.replace("/dashboard"); router.refresh(); }
      else setStage((value) => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Please try again."); }
    finally { setBusy(false); }
  }
  function selectSource(id: string) {
    setSteps((current) => ({ ...current, ...Object.fromEntries(sources.map(([key]) => [`source_${key}`, key === id])) }));
  }
  const titles = ["A little less stress. A lot more learning.", "How did you hear about Smartlearn?", "Why are you using Smartlearn?"];
  const subtitles = ["Your classes, notes, and next steps. Finally in one place.", "Choose the place that first brought you here.", "Choose everything you’d like help with. We’ll take it from here."];
  return (
    <div className="sl-onboarding">
      <header className="sl-onboarding-header">
        <div>{stage > 0 && stage < 3 ? <button className="sl-back" aria-label="Go back" disabled={busy} onClick={() => setStage(stage - 1)}><ArrowLeft size={20} /></button> : <span className="sl-wordmark">Smartlearn<span>.</span></span>}</div>
        <div className="sl-progress" role="progressbar" aria-label="Account setup" aria-valuemin={0} aria-valuemax={8} aria-valuenow={currentStep}><span style={{ width: `${currentStep / 8 * 100}%` }} /></div>
        <span className="sl-step">Step {currentStep} of 8</span>
      </header>
      <main className={`sl-onboarding-main ${stage === 0 ? "sl-welcome" : ""}`}>
        {stage < 3 ? <>
          <div className="sl-intro"><p className="sl-eyebrow">{stage === 0 ? "WELCOME TO SMARTLEARN" : "LET’S MAKE THIS YOURS"}</p><h1 ref={heading} tabIndex={-1}>{titles[stage]}</h1><p>{subtitles[stage]}</p></div>
          {stage === 0 ? <>
            <div className="sl-reviews">{reviews.map((review, index) => <figure className="sl-review" key={review.name}>
              <div className="sl-stars" aria-label="Example five-star rating">{Array.from({ length: 5 }, (_, i) => <Star key={i} size={17} fill="currentColor" aria-hidden="true" />)}</div>
              <blockquote>“{review.quote}”</blockquote><figcaption><span className={`sl-avatar sl-avatar-${index}`}>{review.initials}</span><span><strong>{review.name}</strong><small>{review.role}</small></span></figcaption>
            </figure>)}</div>
            <p className="sl-sample-note">Illustrative student stories — sample reviews, not verified testimonials.</p>
          </> : <div className={`sl-options ${stage === 2 ? "sl-intentions" : ""}`} role="group" aria-label={titles[stage]}>
            {(stage === 1 ? sources : intentions).map(([id, title, description, Icon]) => {
              const key = `${stage === 1 ? "source" : "intent"}_${id}`;
              const selected = Boolean(steps[key]);
              return <button key={id} className="sl-option" aria-pressed={selected} disabled={busy} onClick={() => stage === 1 ? selectSource(id) : setSteps((current) => ({ ...current, [key]: !current[key] }))}>
                <span className="sl-option-icon"><Icon size={23} aria-hidden="true" /></span><span className="sl-option-copy"><strong>{title}</strong><small>{description}</small></span><span className="sl-choice" aria-hidden="true">{selected && <Check size={14} />}</span>
              </button>;
            })}
          </div>}
          <div className="sl-actions"><button className="sl-continue" disabled={busy || (stage === 1 && !sources.some(([id]) => steps[`source_${id}`])) || (stage === 2 && !intentions.some(([id]) => steps[`intent_${id}`]))} onClick={() => save({ ...steps, [stage === 0 ? "welcomeComplete" : stage === 1 ? "discoveryComplete" : "introComplete"]: true })}>{busy ? <Loader2 className="animate-spin" size={20} /> : <>{stage === 0 ? "Get started" : "Continue"}<ArrowRight size={20} /></>}</button></div>
        </> : <div className="sl-canvas">
          <p className="sl-eyebrow">YOUR CLASSES, CONNECTED</p>
          {ready ? <><h1 ref={heading} tabIndex={-1}>You’re ready to learn.</h1><p>Your Canvas classes are connected. Your workspace is ready for you.</p><button className="sl-continue" disabled={busy} onClick={() => save({ ...steps, connectLms: true }, true)}>{busy ? "Saving…" : "Go to dashboard"}<ArrowRight size={20} /></button></> : <CanvasConnectionWizard onboarding finishing={busy} onFinish={() => save({ ...steps, connectLms: true }, true)} onStepChange={setCanvasStep} pendingConnection={pendingConnection} onConnected={() => { setSteps((current) => ({ ...current, connectLms: true }));  }} />}
          {!ready && canvasStep === 0 && <div className="sl-canvas-links"><button className="sl-back" onClick={() => setStage(2)}><ArrowLeft size={16} /> Back</button><button className="sl-skip" disabled={busy} onClick={() => save({ ...steps, canvasSkipped: true }, true)}>Set up Canvas later</button></div>}
        </div>}
        {error && <p className="sl-error" role="alert">{error}</p>}
      </main>
    </div>
  );
}
