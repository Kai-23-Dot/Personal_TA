import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  Brain,
  CalendarCheck2,
  Clock3,
  FileText,
  PlugZap,
  Target,
} from "lucide-react";
import { SmartlearnFooter } from "@/frontend/components/layout/SmartlearnFooter";
import { SmartlearnHeader } from "@/frontend/components/layout/SmartlearnHeader";
import { createClient } from "@/backend/supabase/server";

/* What the product does. Six capabilities, stated plainly — the icons name the
   thing rather than decorate it, and each one matches the icon that surface
   carries inside the app. */
const features = [
  {
    icon: PlugZap,
    title: "Canvas sync that stays organized",
    description:
      "Pull courses, modules, assignments, files, pages, and due dates into one calm workspace.",
  },
  {
    icon: FileText,
    title: "Course material extraction",
    description:
      "Turn slides, PDFs, notes, and Canvas pages into clean study context for every class.",
  },
  {
    icon: Target,
    title: "Source-grounded practice tests",
    description:
      "Generate quizzes from the exact content your teacher shared, not generic internet summaries.",
  },
  {
    icon: CalendarCheck2,
    title: "Study flow for busy weeks",
    description:
      "See what matters next, filter by course, and build focused review sessions faster.",
  },
  {
    icon: Brain,
    title: "AI-powered review",
    description:
      "Turn weak spots into targeted review sessions, flashcards, and study guides.",
  },
  {
    icon: BookOpenCheck,
    title: "Personalized studying",
    description:
      "Study from the courses, assignments, and materials that matter to your schedule.",
  },
];

/* A real sequence — you cannot practise before the course is read, and the
   course cannot be read before Canvas is connected — so these are numbered. */
const steps = [
  {
    title: "Connect Canvas",
    description:
      "Sign in once and Smartlearn pulls your active courses, assignments, modules, pages, and files.",
  },
  {
    title: "Smartlearn finds your course content",
    description:
      "The app organizes slides, notes, pages, due dates, and learning materials by course.",
  },
  {
    title: "Generate practice tests and study smarter",
    description:
      "Create focused quizzes and guides from what you are actually learning in class.",
  },
];

/* The card the hero is built around: Smartlearn having already decided what to
   study next. It is the product's whole claim in one object, which is why it
   sits beside the headline rather than under it. */
function LiveSignal() {
  return (
    <div className="signal" aria-label="A preview of Smartlearn's next study move">
      <div className="signal-head">
        <span className="signal-eyebrow">Live priority signal</span>
        <span className="signal-synced">Canvas synced</span>
      </div>
      <p className="signal-title">Your next study move</p>

      <div className="signal-steps">
        <div className="signal-step">
          <BookOpenCheck aria-hidden="true" />
          <p className="signal-step-label">Course</p>
          <p className="signal-step-value">Calculus II</p>
        </div>
        <div className="signal-step">
          <Clock3 aria-hidden="true" />
          <p className="signal-step-label">Next deadline</p>
          <p className="signal-step-value">Tomorrow</p>
        </div>
        <div className="signal-step">
          <Target aria-hidden="true" />
          <p className="signal-step-label">Next action</p>
          <p className="signal-step-value">42 min review</p>
        </div>
      </div>

      <div className="signal-focus">
        <p className="signal-focus-eyebrow">Recommended focus</p>
        <p className="signal-focus-title">Review integration techniques</p>
        <p>
          Recent practice accuracy is lower here, and the topic appears on
          tomorrow&apos;s quiz.
        </p>

        <div className="signal-mastery">
          <span>Current mastery</span>
          <strong>68%</strong>
        </div>
        <div
          className="signal-track"
          role="img"
          aria-label="Current mastery: 68 percent"
        >
          <div className="signal-fill" style={{ width: "68%" }} />
        </div>
      </div>

      <Link className="signal-cta" href="/practice">
        <Target aria-hidden="true" />
        <span>
          <span className="signal-cta-title">Start targeted practice</span>
          <span className="signal-cta-sub">8 questions, adapting as you answer</span>
        </span>
        <ArrowRight className="signal-cta-arrow" aria-hidden="true" />
      </Link>
    </div>
  );
}

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const primaryHref = user ? "/dashboard" : "/signup";
  const primaryLabel = user ? "Open my workspace" : "Start with my courses";

  return (
    <div className="page-shell" data-public-shell>
      <SmartlearnHeader isSignedIn={Boolean(user)} />

      <main>
        <section className="wrap masthead">
          <div className="masthead-grid">
            <div>
              <h1>
                Move through your semester{" "}
                <span className="accent">with clarity.</span>
              </h1>
              <p className="lede">
                Smartlearn connects Canvas, coursework, deadlines, and
                performance into one clear workspace — so every study session
                starts with purpose.
              </p>

              <div className="cta-row">
                <Link className="cta" href={primaryHref}>
                  {primaryLabel}
                </Link>
                <Link className="cta-quiet" href="#how-it-works">
                  Explore the system
                </Link>
              </div>

              <div className="proof">
                <div>
                  <p className="proof-figure">01</p>
                  <p className="proof-label">One connected workspace</p>
                </div>
                <div>
                  <p className="proof-figure">24/7</p>
                  <p className="proof-label">Study signals online</p>
                </div>
                <div>
                  <p className="proof-figure">Zero</p>
                  <p className="proof-label">Generic practice</p>
                </div>
              </div>
            </div>

            <LiveSignal />
          </div>
        </section>

        <section className="wrap band">
          <h2>What Smartlearn does</h2>
          <p className="section-lede">
            Connect, organize, and study from the sources your class actually
            uses.
          </p>

          <div className="feature-grid">
            {features.map(({ icon: Icon, title, description }) => (
              <article className="feature" key={title}>
                <Icon aria-hidden="true" />
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="wrap band" id="how-it-works">
          <h2>How Smartlearn works</h2>
          <p className="section-lede">
            Three steps, and the first one is the only setup you do.
          </p>

          <div className="steps">
            {steps.map(({ title, description }) => (
              <div className="step" key={title}>
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="wrap closing">
          <h2>Your whole semester, in one calm view.</h2>
          <p className="section-lede">
            Courses, assignments, and practice — organized the moment you
            connect Canvas.
          </p>
          <div className="cta-row">
            <Link className="cta" href={primaryHref}>
              {primaryLabel}
            </Link>
          </div>
        </section>
      </main>

      <SmartlearnFooter />
    </div>
  );
}
