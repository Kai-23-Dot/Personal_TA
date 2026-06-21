import type { Metadata } from "next";
import { ConlearnBackdrop } from "@/frontend/components/layout/ConlearnBackdrop";
import { ConlearnHeader } from "@/frontend/components/layout/ConlearnHeader";
import { ConlearnFooter } from "@/frontend/components/layout/ConlearnFooter";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Read Conlearn's terms of service — usage guidelines, subscriptions, and policy updates.",
};

const navLinks = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Website", href: "/website" },
  { label: "Privacy", href: "/privacy" },
];

export default function TermsPage() {
  return (
    <ConlearnBackdrop>
      <ConlearnHeader links={navLinks} showSignIn />
      <section className="section" style={{ paddingTop: "120px" }}>
        <h1 className="animate-on-scroll">Terms of Service</h1>
        <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "0 auto" }}>
          <div className="contact-form-column">
            <h2 className="contact-form-title">Coming soon</h2>
            <p style={{ color: "var(--gray)" }}>
              This page will describe usage guidelines, subscriptions, and policy updates.
            </p>
          </div>
        </div>
      </section>
      <ConlearnFooter />
    </ConlearnBackdrop>
  );
}
