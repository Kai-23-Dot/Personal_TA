import type { Metadata } from "next";
import { ConlearnBackdrop } from "@/components/layout/ConlearnBackdrop";
import { ConlearnHeader } from "@/components/layout/ConlearnHeader";
import { ConlearnFooter } from "@/components/layout/ConlearnFooter";

export const metadata: Metadata = {
  title: "About",
  description: "Learn about Conlearn — our mission, team, and the story behind your AI teaching assistant.",
};

const navLinks = [
  { label: "Home", href: "/" },
  { label: "Features", href: "/#features" },
  { label: "Website", href: "/website" },
  { label: "Contact", href: "/contact" },
];

export default function AboutPage() {
  return (
    <ConlearnBackdrop>
      <ConlearnHeader links={navLinks} showSignIn />
      <section className="section" style={{ paddingTop: "120px" }}>
        <h1 className="animate-on-scroll">About Conlearn</h1>
        <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "0 auto" }}>
          <div className="contact-form-column">
            <h2 className="contact-form-title">Coming soon</h2>
            <p style={{ color: "var(--gray)" }}>
              This page will share our mission, team, and the story behind Conlearn.
            </p>
          </div>
        </div>
      </section>
      <ConlearnFooter />
    </ConlearnBackdrop>
  );
}
