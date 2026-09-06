"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";

type SmartlearnHeaderProps = {
  showSignIn?: boolean;
  signInHref?: string;
  showSignOut?: boolean;
  signOutHref?: string;
  actionLabel?: string;
  actionHref?: string;
};

const publicNavLinks = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
] as const;

export function SmartlearnHeader({
  showSignIn = true,
  signInHref = "/login",
  showSignOut = false,
  signOutHref = "/logout",
  actionLabel,
  actionHref,
}: SmartlearnHeaderProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const primaryAction =
    actionLabel && actionHref
      ? { label: actionLabel, href: actionHref }
      : showSignIn
        ? { label: "Sign in", href: signInHref }
        : null;

  return (
    <header className="site-header" data-open={mobileOpen ? "true" : "false"}>
      <div className="wrap site-header-inner">
        <Link href="/" className="wordmark" onClick={() => setMobileOpen(false)}>
          <Image
            src="/smartlearn-logo.png"
            alt=""
            width={22}
            height={22}
            className="object-contain"
          />
          {/* Sentence case: the wordmark was set in tracked-out capitals, which
              reads as template chrome rather than as a name. */}
          Smartlearn
        </Link>

        <ul className="site-nav is-desktop">
          {publicNavLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={pathname === link.href ? "active" : undefined}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="header-actions">
          {primaryAction ? (
            <Link href={primaryAction.href} className="cta is-desktop-inline">
              {primaryAction.label}
            </Link>
          ) : null}
          {showSignOut ? (
            <Link href={signOutHref} className="cta-quiet is-desktop-inline">
              Sign out
            </Link>
          ) : null}

          <button
            className="menu-toggle"
            type="button"
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileOpen}
            aria-controls="mobileNav"
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="mobile-sheet" id="mobileNav">
          <div className="wrap">
            {publicNavLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={pathname === link.href ? "active" : undefined}
              >
                {link.label}
              </Link>
            ))}
            {primaryAction ? (
              <Link href={primaryAction.href} onClick={() => setMobileOpen(false)}>
                {primaryAction.label}
              </Link>
            ) : null}
            {showSignOut ? (
              <Link href={signOutHref} onClick={() => setMobileOpen(false)}>
                Sign out
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </header>
  );
}
