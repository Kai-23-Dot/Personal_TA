import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BookOpenCheck,
  Brain,
  CalendarCheck2,
  Clock3,
  FileSearch,
  Layers3,
  PlugZap,
  Sparkles,
} from "lucide-react";
import { SmartlearnFooter } from "@/frontend/components/layout/SmartlearnFooter";
import { SmartlearnHeader } from "@/frontend/components/layout/SmartlearnHeader";
import { createClient } from "@/backend/supabase/server";

/* ─── Product showcase (code-native preview) ──────────────────── */
function AppShowcase() {
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
          <div className="showcase-address">smartlearn.app/dashboard</div>
        </div>

        <div className="showcase-body">
          <div className="showcase-product-preview" aria-label="Smartlearn workflow preview">
            <aside className="showcase-preview-sidebar">
              <div className="showcase-preview-brand">
                <Image src="/smartlearn-logo.png" alt="" width={24} height={24} />
                <span>Smartlearn</span>
              </div>
              {[
                ["01", "Courses"],
                ["02", "Notes"],
                ["03", "Practice"],
                ["04", "Review"],
              ].map(([number, label], index) => (
                <div
                  className={`showcase-preview-nav${index === 0 ? " active" : ""}`}
                  key={label}
                >
                  <span>{number}</span>
                  {label}
                </div>
              ))}
            </aside>
            <div className="showcase-preview-main">
              <div className="showcase-preview-copy">
                <span className="showcase-preview-kicker">Your study workspace</span>
                <h3>From course material to focused practice.</h3>
                <p>Connect, organize, and study from the sources your class actually uses.</p>
              </div>
              <div className="showcase-preview-flow">
                {[
                  ["Connect Canvas", "Discover courses, modules, pages, and files."],
                  ["Build context", "Extract and organize readable instructional material."],
                  ["Practice", "Generate grounded questions with source references."],
                ].map(([title, description], index) => (
                  <article key={title}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <h4>{title}</h4>
                      <p>{description}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
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
      "Sign in once and Smartlearn pulls your active courses, assignments, modules, pages, and files.",
  },
  {
    icon: FileSearch,
    title: "Smartlearn finds your course content",
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

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="landing-root">
      <SmartlearnHeader
        showSignIn={!user}
        actionLabel={user ? "Open workspace" : undefined}
        actionHref={user ? "/dashboard" : undefined}
      />
      <main>
      {/* ══════════════════════════════════════════════════════════
          HERO — editorial copy + live learning intelligence console
          ══════════════════════════════════════════════════════════ */}
      <section className="hero-section">
        <div className="hero-spline-bg hero-spline-fallback" aria-hidden="true" />
        <div className="hero-overlay" aria-hidden="true" />

        <div className="hero-grid">
          <div className="hero-left">
            <h1
              className="hero-title hero-animate"
              style={{ animationDelay: "0.12s" }}
            >
              Move through your semester <span className="hero-title-accent">with clarity.</span>
            </h1>
            <p
              className="hero-subtitle hero-animate"
              style={{ animationDelay: "0.28s" }}
            >
              Smartlearn connects Canvas, coursework, deadlines, and performance into one clear workspace—so
              every study session starts with purpose.
            </p>

            <div className="hero-actions hero-animate" style={{ animationDelay: "0.4s" }}>
              <Link href={user ? "/dashboard" : "/signup"} className="hero-cta-btn">
                {user ? "Open my workspace" : "Build my workspace"} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <a href="#workflow" className="hero-ghost-btn">
                Explore the system <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>

            <dl className="hero-metrics hero-animate" style={{ animationDelay: "0.52s" }}>
              <div><dt>01</dt><dd>One connected workspace</dd></div>
              <div><dt>24/7</dt><dd>Study signals online</dd></div>
              <div><dt>Zero</dt><dd>Generic practice</dd></div>
            </dl>
          </div>

          <div className="hero-right hero-animate" style={{ animationDelay: "0.48s" }} aria-label="Smartlearn learning intelligence preview">
            <div className="hero-console">
              <div className="hero-console-head">
                <div>
                  <span className="console-overline">LIVE PRIORITY SIGNAL</span>
                  <strong>Your next study move</strong>
                </div>
                <span className="console-live"><i /> CANVAS SYNCED</span>
              </div>

              <div className="hero-signal-flow" aria-label="Signals used to build the recommendation">
                <div className="hero-signal-card">
                  <BookOpenCheck aria-hidden="true" />
                  <span>Course</span>
                  <strong>Calculus II</strong>
                </div>
                <ArrowRight className="hero-signal-arrow" aria-hidden="true" />
                <div className="hero-signal-card">
                  <Clock3 aria-hidden="true" />
                  <span>Next deadline</span>
                  <strong>Tomorrow</strong>
                </div>
                <ArrowRight className="hero-signal-arrow" aria-hidden="true" />
                <div className="hero-signal-card is-plan">
                  <Sparkles aria-hidden="true" />
                  <span>Next action</span>
                  <strong>42 min review</strong>
                </div>
              </div>

              <div className="hero-recommendation">
                <div className="hero-recommendation-copy">
                  <span className="console-overline">RECOMMENDED FOCUS</span>
                  <strong>Review integration techniques</strong>
                  <p>Recent practice accuracy is lower here, and the topic appears on tomorrow&apos;s quiz.</p>
                </div>
                <div className="hero-mastery">
                  <div>
                    <span>Current mastery</span>
                    <strong>68%</strong>
                  </div>
                  <div className="hero-mastery-track" aria-label="Current mastery: 68 percent">
                    <span style={{ width: "68%" }} />
                  </div>
                </div>
              </div>

              <div className="console-command">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <span><strong>Start targeted practice</strong><small>8 questions · adapts as you answer</small></span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>

        <div className="hero-edge-label" aria-hidden="true">SMARTLEARN / SYSTEM 2.0</div>
      </section>


      {/* ══════════════════════════════════════════════════════════
          BELOW-HERO — product preview, features, and workflow
          ══════════════════════════════════════════════════════════ */}
      <div className="landing-below-hero">

        {/* Product showcase — macOS window */}
        <AppShowcase />

        {/* Features */}
        <section id="features" className="premium-section">
          <div className="premium-section-header">
            <span className="premium-eyebrow">What Smartlearn does</span>
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
            <h2>How Smartlearn works.</h2>
            <p>
              Smartlearn keeps the workflow intentionally simple: connect Canvas, let the app find
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

      </main>
      <SmartlearnFooter />
    </div>
  );
}
