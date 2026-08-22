"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";

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

import { usePathname } from "next/navigation";

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
  const primaryAction = actionLabel && actionHref
    ? { label: actionLabel, href: actionHref }
    : showSignIn
      ? { label: "Sign in", href: signInHref }
      : null;

  return (
    <header className="premium-public-header">
      <nav className="premium-public-nav">
        <Link href="/" className="logo public-logo">
          <Image src="/smartlearn-logo.png" alt="Smartlearn" width={28} height={28} className="object-contain" />
          <span className="logo-text">SMARTLEARN</span>
        </Link>

        <ul className="nav-links">
          {publicNavLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={pathname === link.href ? "active" : undefined}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        {primaryAction ? (
          <div className="nav-cta">
            <Link href={primaryAction.href} className="btn btn-primary" onClick={() => setMobileOpen(false)}>
              {primaryAction.label}
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </div>
        ) : null}
        {showSignOut ? (
          <div className="nav-cta">
            <Link href={signOutHref} className="btn btn-secondary" onClick={() => setMobileOpen(false)}>
              Sign Out
            </Link>
          </div>
        ) : null}

        <button
          className={`mobile-menu ${mobileOpen ? "active" : ""}`}
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={mobileOpen}
          aria-controls="mobileNav"
          onClick={() => setMobileOpen((open) => !open)}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      </nav>

      <div className={`mobile-nav ${mobileOpen ? "active" : ""}`} id="mobileNav">
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
        {primaryAction ? <Link href={primaryAction.href} onClick={() => setMobileOpen(false)}>{primaryAction.label}</Link> : null}
        {showSignOut ? <Link href={signOutHref} onClick={() => setMobileOpen(false)}>Sign Out</Link> : null}
      </div>
    </header>
  );
}
