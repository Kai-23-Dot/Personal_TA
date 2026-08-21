import type { Metadata } from "next";
import { SmartlearnBackdrop } from "@/frontend/components/layout/SmartlearnBackdrop";
import { SmartlearnHeader } from "@/frontend/components/layout/SmartlearnHeader";
import { SmartlearnFooter } from "@/frontend/components/layout/SmartlearnFooter";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Read Smartlearn's privacy policy — how student data is collected, stored, and protected.",
};

const navLinks = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Website", href: "/website" },
  { label: "Terms", href: "/terms" },
];

export default function PrivacyPage() {
  return (
    <SmartlearnBackdrop>
      <SmartlearnHeader links={navLinks} showSignIn />
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
      <SmartlearnFooter />
    </SmartlearnBackdrop>
  );
}
