"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";

type NavLink = {
  label: string;
  href: string;
};

type ConlearnHeaderProps = {
  links: NavLink[];
  showSignIn?: boolean;
  signInHref?: string;
  showSignOut?: boolean;
  signOutHref?: string;
};

import { usePathname } from "next/navigation";

export function ConlearnHeader({
  links,
  showSignIn = true,
  signInHref = "/login",
  showSignOut = false,
  signOutHref = "/logout",
}: ConlearnHeaderProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <header className="premium-public-header">
      <nav className="premium-public-nav">
        <Link href="/" className="logo">
          <Image src="/conlearn-logo.png" alt="Conlearn" width={36} height={36} className="object-contain" />
          <span className="logo-text">Conlearn</span>
        </Link>

        <ul className="nav-links">
          {links.map((link) => (
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

        {showSignIn ? (
          <div className="nav-cta">
            <Link href={signInHref} className="btn btn-primary" onClick={() => setMobileOpen(false)}>
              Sign In
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
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setMobileOpen(false)}
            className={pathname === link.href ? "active" : undefined}
          >
            {link.label}
          </Link>
        ))}
        {showSignIn ? <Link href={signInHref} onClick={() => setMobileOpen(false)}>Sign In</Link> : null}
        {showSignOut ? <Link href={signOutHref} onClick={() => setMobileOpen(false)}>Sign Out</Link> : null}
      </div>
    </header>
  );
}
