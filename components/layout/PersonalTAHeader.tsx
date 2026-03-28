"use client";

import Link from "next/link";

type NavLink = {
  label: string;
  href: string;
};

type PersonalTAHeaderProps = {
  links: NavLink[];
  showSignIn?: boolean;
  signInHref?: string;
  showSignOut?: boolean;
  signOutHref?: string;
};

import { usePathname } from "next/navigation";

export function PersonalTAHeader({
  links,
  showSignIn = true,
  signInHref = "/login",
  showSignOut = false,
  signOutHref = "/logout",
}: PersonalTAHeaderProps) {
  const pathname = usePathname();
  return (
    <header>
      <nav>
        <Link href="/" className="logo">
          <svg className="logo-icon" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <polygon
              points="50,5 85,25 85,65 50,85 15,65 15,25"
              fill="none"
              stroke="url(#gradientStroke)"
              strokeWidth="2"
            />
            <circle cx="50" cy="30" r="4" fill="#00ffff" />
            <circle cx="35" cy="45" r="4" fill="#ff00ff" />
            <circle cx="65" cy="45" r="4" fill="#ff00ff" />
            <circle cx="35" cy="65" r="4" fill="#00ffff" />
            <circle cx="65" cy="65" r="4" fill="#00ffff" />
            <circle cx="50" cy="55" r="5" fill="#7c3aed" />
            <line x1="50" y1="30" x2="35" y2="45" stroke="#00ffff" strokeWidth="1" opacity="0.5" />
            <line x1="50" y1="30" x2="65" y2="45" stroke="#00ffff" strokeWidth="1" opacity="0.5" />
            <line x1="35" y1="45" x2="50" y2="55" stroke="#ff00ff" strokeWidth="1" opacity="0.5" />
            <line x1="65" y1="45" x2="50" y2="55" stroke="#ff00ff" strokeWidth="1" opacity="0.5" />
            <line x1="50" y1="55" x2="35" y2="65" stroke="#7c3aed" strokeWidth="1" opacity="0.5" />
            <line x1="50" y1="55" x2="65" y2="65" stroke="#7c3aed" strokeWidth="1" opacity="0.5" />
            <defs>
              <linearGradient id="gradientStroke" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{ stopColor: "#00ffff", stopOpacity: 1 }} />
                <stop offset="50%" style={{ stopColor: "#ff00ff", stopOpacity: 1 }} />
                <stop offset="100%" style={{ stopColor: "#7c3aed", stopOpacity: 1 }} />
              </linearGradient>
            </defs>
          </svg>
          <span className="logo-text">PersonalTA</span>
        </Link>

        <ul className="nav-links">
          {links.map((link) => (
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

        {showSignIn ? (
          <div className="nav-cta">
            <Link href={signInHref} className="btn btn-primary">
              Sign In
            </Link>
          </div>
        ) : null}
        {showSignOut ? (
          <div className="nav-cta">
            <Link href={signOutHref} className="btn btn-secondary">
              Sign Out
            </Link>
          </div>
        ) : null}

        <button className="mobile-menu" type="button" aria-label="Toggle navigation">
          <span></span>
          <span></span>
          <span></span>
        </button>
      </nav>

      <div className="mobile-nav" id="mobileNav">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className={pathname === link.href ? "active" : undefined}>
            {link.label}
          </Link>
        ))}
        {showSignIn ? <Link href={signInHref}>Sign In</Link> : null}
        {showSignOut ? <Link href={signOutHref}>Sign Out</Link> : null}
      </div>
    </header>
  );
}
