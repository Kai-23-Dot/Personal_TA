import type { Metadata } from "next";
import { ConlearnBackdrop } from "@/components/layout/ConlearnBackdrop";
import { ConlearnHeader } from "@/components/layout/ConlearnHeader";
import { ConlearnFooter } from "@/components/layout/ConlearnFooter";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Read Conlearn's privacy policy — how student data is collected, stored, and protected.",
};

const navLinks = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Website", href: "/website" },
  { label: "Terms", href: "/terms" },
];

export default function PrivacyPage() {
  return (
    <ConlearnBackdrop>
      <ConlearnHeader links={navLinks} showSignIn />
      <section className="section" style={{ paddingTop: "120px" }}>
        <h1 className="animate-on-scroll">Privacy Policy</h1>
        <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "0 auto" }}>
          <div className="contact-form-column">
            <h2 className="contact-form-title">Coming soon</h2>
            <p style={{ color: "var(--gray)" }}>
              This page will outline how student data is collected, stored, and protected.
            </p>
          </div>
        </div>
      </section>
      <ConlearnFooter />
    </ConlearnBackdrop>
  );
}
