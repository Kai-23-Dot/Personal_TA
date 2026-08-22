import Image from "next/image";
import Link from "next/link";

export function SmartlearnFooter() {
  return (
    <footer className="smartlearn-footer">
      <div className="footer-content">
        <div className="footer-primary">
          <Link href="/" className="footer-brand-link" aria-label="Smartlearn home">
            <Image src="/smartlearn-logo.png" alt="" width={30} height={30} className="object-contain" />
            <span className="footer-brand">SMARTLEARN</span>
          </Link>
          <nav className="footer-nav" aria-label="Footer navigation">
            <Link href="/contact">Contact</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </nav>
        </div>

        <div className="footer-meta">
          <p>© 2026 Smartlearn. All rights reserved.</p>
          <p>Built to help students learn with clarity.</p>
        </div>

        {/* Legal / third-party trademark notices */}
        <div className="footer-legal">
          <p>
            Canvas® is a registered trademark of Instructure, Inc. Smartlearn is not affiliated with, sponsored by, or endorsed by Instructure, Inc.
          </p>
          <p>
            Google Classroom™ is a trademark of Google LLC. Smartlearn is not affiliated with, sponsored by, or endorsed by Google LLC.
          </p>
          <p>
            All other trademarks, product names, and company names or logos referenced herein are the property of their respective owners.
          </p>
        </div>
      </div>
    </footer>
  );
}
