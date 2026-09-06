import Image from "next/image";
import Link from "next/link";

export function SmartlearnFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="site-footer-inner">
          <Link href="/" className="wordmark" aria-label="Smartlearn home">
            <Image
              src="/smartlearn-logo.png"
              alt=""
              width={20}
              height={20}
              className="object-contain"
            />
            Smartlearn
          </Link>

          <nav className="footer-links" aria-label="Footer navigation">
            <Link href="/contact">Contact</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </nav>
        </div>

        <div className="footer-fine">
          <p>© 2026 Smartlearn. Built to help students learn with clarity.</p>
          {/* Third-party trademark notices. */}
          <p>
            Canvas® is a registered trademark of Instructure, Inc. Google
            Classroom™ is a trademark of Google LLC. Smartlearn is not
            affiliated with, sponsored by, or endorsed by either. All other
            trademarks are the property of their respective owners.
          </p>
        </div>
      </div>
    </footer>
  );
}
