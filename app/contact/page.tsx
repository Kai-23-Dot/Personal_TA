import { PersonalTABackdrop } from "@/components/layout/PersonalTABackdrop";
import { PersonalTAHeader } from "@/components/layout/PersonalTAHeader";
import { PersonalTAFooter } from "@/components/layout/PersonalTAFooter";

const navLinks = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Website", href: "/website" },
  { label: "Privacy", href: "/privacy" },
];

export default function ContactPage() {
  return (
    <PersonalTABackdrop>
      <PersonalTAHeader links={navLinks} showSignIn />
      <section className="section" style={{ paddingTop: "120px" }}>
        <h2 className="animate-on-scroll">Contact Us</h2>
        <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "0 auto" }}>
          <div className="contact-form-column">
            <h3 className="contact-form-title">Coming Soon</h3>
            <p style={{ color: "var(--gray)" }}>
              This page will include support channels, office hours, and partnership inquiries.
            </p>
          </div>
        </div>
      </section>
      <PersonalTAFooter />
    </PersonalTABackdrop>
  );
}
