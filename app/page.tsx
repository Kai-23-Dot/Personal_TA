import Link from "next/link";
import Image from "next/image";
import {
  BookOpenCheck,
  Brain,
  CalendarCheck2,
  ClipboardList,
  FileText,
  Layers,
  PlugZap,
  Target,
  Timer,
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

/* The hero's proof is the product. This is the workspace's own shell — same
   rail, same rows, same type — drawn at rest so the page shows what signing in
   actually gets you rather than describing it. */
function WorkspacePreview() {
  return (
    <div className="preview" aria-label="A preview of the Smartlearn workspace">
      <div className="preview-bar">
        <span className="preview-dot" />
        <span className="preview-dot" />
        <span className="preview-dot" />
        <span className="preview-address">smartlearn.app/dashboard</span>
      </div>

      <div className="preview-body">
        <aside className="preview-rail">
          <div className="preview-brand">
            <Image src="/smartlearn-logo.png" alt="" width={18} height={18} />
            Smartlearn
          </div>
          <div className="preview-nav active">
            <ClipboardList aria-hidden="true" />
            Assignments
          </div>
          <div className="preview-nav">
            <FileText aria-hidden="true" />
            Notes
          </div>
          <div className="preview-nav">
            <Target aria-hidden="true" />
            Practice
          </div>
          <div className="preview-nav">
            <Layers aria-hidden="true" />
            Flashcards
          </div>
          <div className="preview-nav">
            <Timer aria-hidden="true" />
            Focus
          </div>
        </aside>

        <div className="preview-main">
          <p className="preview-title">Due this week</p>

          <div style={{ marginTop: "14px" }}>
            <div className="preview-row">
              <span className="course-dot" data-course-tone="1" />
              Integration by parts — problem set
              <span className="preview-meta">Calculus II · Tomorrow</span>
            </div>
            <div className="preview-row">
              <span className="course-dot" data-course-tone="2" />
              Chapter 6 quiz
              <span className="preview-meta">Principles of Management · Fri</span>
            </div>
            <div className="preview-row">
              <span className="course-dot" data-course-tone="3" />
              Analytical reading — Federalist No. 10
              <span className="preview-meta">U.S. Government · Mon</span>
            </div>
          </div>

          <div className="preview-callout">
            <strong style={{ fontSize: "14px" }}>Review integration techniques</strong>
            <p>
              Recent practice accuracy is lower here, and the topic appears on
              tomorrow&apos;s quiz.
            </p>
          </div>
        </div>
      </div>
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
      <SmartlearnHeader />

      <main>
        <section className="wrap masthead">
          <h1>From course material to focused practice.</h1>
          <p className="lede">
            Smartlearn connects Canvas, coursework, deadlines, and performance
            into one workspace — so every study session starts with what
            actually matters next.
          </p>

          <div className="cta-row">
            <Link className="cta" href={primaryHref}>
              {primaryLabel}
            </Link>
            <Link className="cta-quiet" href="#how-it-works">
              See how it works
            </Link>
          </div>

          <WorkspacePreview />
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
