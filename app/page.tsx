"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  Brain,
  CalendarCheck2,
  FileSearch,
  ImageIcon,
  Layers3,
  PlugZap,
  Sparkles,
} from "lucide-react";
import { ConlearnFooter } from "@/frontend/components/layout/ConlearnFooter";

/* ─── Product showcase (macOS window) ──────────────────────────── */
// Drop a screenshot at /public/app-preview.png and it appears automatically.
function AppShowcase() {
  const [hasImage, setHasImage] = useState(true);

  return (
    <section className="showcase-section" aria-label="Product preview">
      <div className="showcase-heading premium-rise">
        <span className="premium-eyebrow">A look inside</span>
        <h2>Your whole semester, in one calm view.</h2>
        <p>Courses, assignments, and AI practice — organized the moment you connect Canvas.</p>
      </div>

      <div className="showcase-window">
        <div className="showcase-titlebar">
          <div className="showcase-lights">
            <span className="showcase-dot red" />
            <span className="showcase-dot amber" />
            <span className="showcase-dot green" />
          </div>
          <div className="showcase-address">conlearn.app/dashboard</div>
        </div>

        <div className="showcase-body">
          {hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/app-preview.png"
              alt="Conlearn dashboard preview"
              className="showcase-img"
              onError={() => setHasImage(false)}
            />
          ) : (
            <div className="showcase-placeholder">
              <div className="showcase-placeholder-frame">
                <div>
                  <div className="showcase-placeholder-icon">
                    <ImageIcon className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <p className="showcase-placeholder-title">Add your Conlearn screenshot</p>
                  <p className="showcase-placeholder-hint">
                    Save a screenshot of the app as <code>app-preview.png</code> in the{" "}
                    <code>/public</code> folder and it appears here automatically.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ─── Data ─────────────────────────────────────────────────────── */

const features = [
  {
    icon: Layers3,
    title: "Canvas sync that stays organized",
    description:
      "Pull courses, modules, assignments, files, pages, and due dates into one calm workspace.",
    details: [
      "Auto-imports every active course",
      "Assignments with live due dates",
      "Modules, pages & files in one place",
      "Re-syncs so nothing goes stale",
    ],
  },
  {
    icon: FileSearch,
    title: "Course material extraction",
    description:
      "Turn slides, PDFs, notes, and Canvas pages into clean study context for every class.",
    details: [
      "Reads slides, PDFs & docs",
      "Pulls text from Canvas pages",
      "Vision AI for diagrams & formulas",
      "Clean study context per class",
    ],
  },
  {
    icon: Brain,
    title: "Source-grounded practice tests",
    description:
      "Generate quizzes from the exact content your teacher shared, not generic internet summaries.",
    details: [
      "Questions from your real materials",
      "Adaptive difficulty as you go",
      "Quiz, flashcard & mixed modes",
      "Instant explanations for every answer",
    ],
  },
  {
    icon: CalendarCheck2,
    title: "Study flow for busy weeks",
    description:
      "See what matters next, filter by course, and build focused review sessions faster.",
    details: [
      "AI-ranked what-to-study-next",
      "Filter everything by course",
      "Grade-impact prioritization",
      "Weekly plan built around you",
    ],
  },
  {
    icon: BookOpenCheck,
    title: "AI-powered review",
    description:
      "Turn weak spots into targeted review sessions, flashcards, and study guides.",
    details: [
      "Pinpoints your weak topics",
      "Spaced-repetition flashcards",
      "Auto-generated study guides",
      "Exam-readiness predictions",
    ],
  },
  {
    icon: Sparkles,
    title: "Personalized studying",
    description:
      "Study from the courses, assignments, and materials that matter to your schedule.",
    details: [
      "Scoped to your own courses",
      "Adapts to your progress",
      "A focus timer for deep work",
      "Your materials, not the internet's",
    ],
  },
];

const workflow = [
  {
    icon: PlugZap,
    title: "Connect Canvas",
    description:
      "Sign in once and Conlearn pulls your active courses, assignments, modules, pages, and files.",
  },
  {
    icon: FileSearch,
    title: "Conlearn finds your course content",
    description:
      "The app organizes slides, notes, pages, due dates, and learning materials by course.",
  },
  {
    icon: Brain,
    title: "Generate practice tests and study smarter",
    description:
      "Create focused quizzes and guides from what you are actually learning in class.",
  },
];

/* ─── Page ─────────────────────────────────────────────────────── */

export default function HomePage() {
  return (
    <div className="landing-root">
      {/* ══════════════════════════════════════════════════════════
          HERO — full-viewport Spline 3D bg, content bottom-left
          ══════════════════════════════════════════════════════════ */}
      <section className="hero-section">

        {/* Hero background */}
        <div className="hero-spline-bg hero-spline-fallback" aria-hidden="true" />

        {/* Dark overlay so text stays readable */}
        <div className="hero-overlay" aria-hidden="true" />

        {/* Fixed navbar — floats over everything */}
        <nav className="landing-nav" aria-label="Site navigation">
          <Link href="/" className="landing-logo">
            <Image src="/conlearn-logo.png" alt="Conlearn" width={28} height={28} className="object-contain" />
            <span>Conlearn</span>
          </Link>

          <ul className="landing-nav-items">
            <li>
              <a href="#features" className="landing-nav-link">Features</a>
            </li>
            <li>
              <a href="#workflow" className="landing-nav-link">How it works</a>
            </li>
            <li>
              <a href="/about" className="landing-nav-link">About</a>
            </li>
            <li>
              <a href="/contact" className="landing-nav-link">Contact</a>
            </li>
          </ul>

          <Link href="/signup" className="landing-signup-btn">
            Get Started
          </Link>
        </nav>

        {/* Two-column hero grid */}
        <div className="hero-grid">
          {/* Left — eyebrow + title + taglines */}
          <div className="hero-left">
            <p
              className="hero-eyebrow hero-animate"
              style={{ animationDelay: "0.1s" }}
            >
              AI Teaching Assistant
            </p>
            <h1
              className="hero-title hero-animate"
              style={{ animationDelay: "0.2s" }}
            >
              Power <span className="hero-title-accent">AI</span>
            </h1>
            <p
              className="hero-subheading hero-animate"
              style={{ animationDelay: "0.4s" }}
            >
              Your AI Teaching Assistant.
            </p>
            <p
              className="hero-subtitle hero-animate"
              style={{ animationDelay: "0.55s" }}
            >
              Connect Canvas, find your class materials, and generate practice tests based on what
              you&apos;re actually learning — all in one workspace.
            </p>
          </div>

          {/* Right — CTA card */}
          <div className="hero-right">
            <div
              className="hero-cta-card hero-animate"
              style={{ animationDelay: "0.65s" }}
            >
              <div className="hero-actions">
                <Link href="/settings/setup/canvas" className="hero-cta-btn">
                  Connect Canvas <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <a href="#workflow" className="hero-ghost-btn">
                  See how it works
                </a>
              </div>
              <p className="hero-trust">
                AI-powered · Syncs with Canvas · Built for students
              </p>
            </div>
          </div>
        </div>
      </section>


      {/* ══════════════════════════════════════════════════════════
          BELOW-HERO — features, workflow, CTA (unchanged)
          ══════════════════════════════════════════════════════════ */}
      <div className="landing-below-hero">

        {/* Product showcase — macOS window */}
        <AppShowcase />

        {/* Features */}
        <section id="features" className="premium-section">
          <div className="premium-section-header">
            <span className="premium-eyebrow">What Conlearn does</span>
            <h2>A smoother way to turn class content into practice.</h2>
            <p>
              Everything is designed around the real classes, deadlines, and materials students
              already use.
            </p>
          </div>
          <div className="premium-feature-grid">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <article key={feature.title} className="premium-feature-card liquid-glass premium-reveal animate-on-scroll">
                  <div className="premium-feature-icon">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                  <ul className="premium-feature-details">
                    {feature.details.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </section>

        {/* Workflow */}
        <section id="workflow" className="premium-section premium-split">
          <div className="premium-rise">
            <span className="premium-eyebrow">Simple flow</span>
            <h2>How Conlearn works.</h2>
            <p>
              Conlearn keeps the workflow intentionally simple: connect Canvas, let the app find
              your real materials, then generate practice that matches your courses.
            </p>
            <Link href="/settings/setup/canvas" className="btn btn-primary mt-6">
              Connect Canvas
            </Link>
          </div>
          <div className="premium-steps">
            {workflow.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="premium-step">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div className="premium-step-copy">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    <strong>{step.title}</strong>
                    <p>{step.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

      </div>

      <ConlearnFooter />
    </div>
  );
}
