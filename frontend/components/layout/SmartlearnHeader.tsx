"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";

type SmartlearnHeaderProps = {
  showSignIn?: boolean;
  signInHref?: string;
  showSignOut?: boolean;
  signOutHref?: string;
  actionLabel?: string;
  actionHref?: string;
  /**
   * Whether the visitor is signed in, when the page already knows.
   *
   * Pages that are server-rendered anyway (the landing page fetches the user to
   * pick its hero CTA) pass this so the button is right in the first paint.
   * Static pages — about, contact, privacy, terms — leave it undefined and the
   * header resolves it on the client instead, which keeps those pages static.
   */
  isSignedIn?: boolean;
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
  isSignedIn,
}: SmartlearnHeaderProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sessionSignedIn, setSessionSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    // The server already answered this; no need to ask again.
    if (isSignedIn !== undefined) return;

    // Supabase's SSR client stores the session in a non-httpOnly cookie named
    // sb-<project-ref>-auth-token, so its presence answers "is someone signed
    // in" without importing the Supabase client — which would otherwise add
    // ~55kB to every public page for the sake of one button label.
    //
    // Cookie presence is a heuristic: a stale session still leaves one behind.
    // That is the right trade here, because the only consequence is the button
    // reading "Open workspace" and middleware bouncing a dead session to the
    // login screen — exactly where that visitor needed to go anyway.
    const read = () =>
      setSessionSignedIn(
        document.cookie.split(";").some((c) => /^\s*sb-.+-auth-token/.test(c))
      );

    read();

    // Re-check when the tab regains focus, so signing out elsewhere corrects it.
    window.addEventListener("focus", read);
    document.addEventListener("visibilitychange", read);
    return () => {
      window.removeEventListener("focus", read);
      document.removeEventListener("visibilitychange", read);
    };
  }, [isSignedIn]);

  const signedIn = isSignedIn ?? sessionSignedIn;

  // An explicit action wins: the sign-in screen offers "Create account" and the
  // sign-up screen offers "Sign in", and neither should be overridden.
  const primaryAction =
    actionLabel && actionHref
      ? { label: actionLabel, href: actionHref }
      : signedIn
        ? { label: "Open workspace", href: "/dashboard" }
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
