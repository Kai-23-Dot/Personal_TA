import type { Metadata } from "next";
import { ConlearnBackdrop } from "@/frontend/components/layout/ConlearnBackdrop";
import { ConlearnHeader } from "@/frontend/components/layout/ConlearnHeader";
import { ConlearnFooter } from "@/frontend/components/layout/ConlearnFooter";

export const metadata: Metadata = {
  title: "Website overview",
  description: "An overview of the Conlearn platform, roadmap, and release milestones.",
};

const navLinks = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "Terms", href: "/terms" },
];

export default function WebsitePage() {
  return (
    <ConlearnBackdrop>
      <ConlearnHeader links={navLinks} showSignIn />
      <section className="section" style={{ paddingTop: "120px" }}>
        <h1 className="animate-on-scroll">Website overview</h1>
        <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "0 auto" }}>
          <div className="contact-form-column">
            <h2 className="contact-form-title">Coming soon</h2>
            <p style={{ color: "var(--gray)" }}>
              This page will outline the platform, roadmap, and release milestones.
            </p>
          </div>
        </div>
      </section>
      <ConlearnFooter />
    </ConlearnBackdrop>
  );
}
