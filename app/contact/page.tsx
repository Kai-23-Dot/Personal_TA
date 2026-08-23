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
      <main className="section" style={{ paddingTop: "120px" }}>
        <h1 className="animate-on-scroll">Contact us</h1>
        <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "0 auto" }}>
          <div className="contact-form-column">
            <h2 className="contact-form-title">Coming soon</h2>
            <p style={{ color: "var(--gray)" }}>
              This page will include support channels, office hours, and partnership inquiries.
            </p>
          </div>
        </div>
      </main>
      <SmartlearnFooter />
    </SmartlearnBackdrop>
  );
}
