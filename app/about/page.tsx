import type { Metadata } from "next";
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
      <section className="section" style={{ paddingTop: "120px" }}>
        <h1 className="animate-on-scroll">About Smartlearn</h1>
        <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "0 auto" }}>
          <div className="contact-form-column">
            <h2 className="contact-form-title">Coming soon</h2>
            <p style={{ color: "var(--gray)" }}>
              This page will share our mission, team, and the story behind Smartlearn.
            </p>
          </div>
        </div>
      </section>
      <SmartlearnFooter />
    </SmartlearnBackdrop>
  );
}
