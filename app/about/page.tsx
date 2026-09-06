import type { Metadata } from "next";
import Link from "next/link";
import { SmartlearnBackdrop } from "@/frontend/components/layout/SmartlearnBackdrop";
import { SmartlearnHeader } from "@/frontend/components/layout/SmartlearnHeader";
import { SmartlearnFooter } from "@/frontend/components/layout/SmartlearnFooter";

export const metadata: Metadata = {
  title: "About",
  description: "Learn about Smartlearn — our mission, team, and the story behind your AI teaching assistant.",
};

export default function AboutPage() {
  return (
    <SmartlearnBackdrop>
      <SmartlearnHeader showSignIn />
      <main className="wrap band">
        <div className="prose">
          <h1>About Smartlearn</h1>
          <p className="lede">
            Smartlearn turns the courses, deadlines and materials you already
            have into the next thing worth studying.
          </p>
          <h2>Why we built it</h2>
          <p>
            Course material is scattered across modules, slide decks, PDFs and
            announcements. Knowing what to study next means piecing that
            together every week. Smartlearn does the piecing, so a study session
            starts at the work instead of the search.
          </p>
          <h2>Who we are</h2>
          <p>
            More about the team is on the way. In the meantime you can{" "}
            <Link href="/contact">get in touch</Link> — we read everything.
          </p>
        </div>
      </main>
      <SmartlearnFooter />
    </SmartlearnBackdrop>
  );
}
