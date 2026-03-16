import { PersonalTABackdrop } from "@/components/layout/PersonalTABackdrop";
import { PersonalTAHeader } from "@/components/layout/PersonalTAHeader";
import { PersonalTAFooter } from "@/components/layout/PersonalTAFooter";

const navLinks = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Website", href: "/website" },
  { label: "Terms", href: "/terms" },
];

export default function PrivacyPage() {
  return (
    <PersonalTABackdrop>
      <PersonalTAHeader links={navLinks} showSignIn />
      <section className="section" style={{ paddingTop: "120px" }}>
        <h2 className="animate-on-scroll">Privacy Policy</h2>
        <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "0 auto" }}>
          <div className="contact-form-column">
            <h3 className="contact-form-title">Coming Soon</h3>
            <p style={{ color: "var(--gray)" }}>
              This page will outline how student data is collected, stored, and protected.
            </p>
          </div>
        </div>
      </section>
      <PersonalTAFooter />
    </PersonalTABackdrop>
  );
}
