import type { Metadata } from "next";
import { SmartlearnBackdrop } from "@/frontend/components/layout/SmartlearnBackdrop";
import { SmartlearnHeader } from "@/frontend/components/layout/SmartlearnHeader";
import { SmartlearnFooter } from "@/frontend/components/layout/SmartlearnFooter";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the Smartlearn team — support, office hours, and partnership inquiries.",
};

export default function ContactPage() {
  return (
    <SmartlearnBackdrop>
      <SmartlearnHeader showSignIn />
      <main className="wrap band">
        <div className="prose">
          <h1>Contact us</h1>
          <p className="lede">
            Questions about your account, a bug to report, or a partnership to
            discuss — all of it reaches the same place.
          </p>
          <h2>Email</h2>
          <p>
            Write to <a href="mailto:support@smartlearn.app">support@smartlearn.app</a>.
            We answer during the school week, usually within a day.
          </p>
          <h2>Reporting a problem</h2>
          <p>
            Tell us the page you were on and what you expected to happen. If it
            involves a course that did not sync, include the course name — it
            makes the sync log much faster to read.
          </p>
        </div>
      </main>
      <SmartlearnFooter />
    </SmartlearnBackdrop>
  );
}
