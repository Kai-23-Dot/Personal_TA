import type { Metadata } from "next";
import { ConlearnBackdrop } from "@/frontend/components/layout/ConlearnBackdrop";
import { ConlearnHeader } from "@/frontend/components/layout/ConlearnHeader";
import { ConlearnFooter } from "@/frontend/components/layout/ConlearnFooter";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the Conlearn team — support, office hours, and partnership inquiries.",
};

const navLinks = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Website", href: "/website" },
  { label: "Privacy", href: "/privacy" },
];

export default function ContactPage() {
  return (
    <ConlearnBackdrop>
      <ConlearnHeader links={navLinks} showSignIn />
      <section className="section" style={{ paddingTop: "120px" }}>
        <h1 className="animate-on-scroll">Contact us</h1>
        <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "0 auto" }}>
          <div className="contact-form-column">
            <h2 className="contact-form-title">Coming soon</h2>
            <p style={{ color: "var(--gray)" }}>
              This page will include support channels, office hours, and partnership inquiries.
            </p>
          </div>
        </div>
      </section>
      <ConlearnFooter />
    </ConlearnBackdrop>
  );
}
