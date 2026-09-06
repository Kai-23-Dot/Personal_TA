import type { ReactNode } from "react";

type SmartlearnBackdropProps = {
  children: ReactNode;
};

/**
 * The shell every public page sits in.
 *
 * It carries `data-public-shell`, which is what applies the paper palette and
 * the public styles in app/notion-public.css — one place, so about, contact,
 * privacy, terms and the auth screens all pick up the theme without each
 * needing to opt in.
 *
 * The animated "neural network" and particle layers that used to live here are
 * gone: they were built for the dark canvas, they moved without anyone asking
 * them to, and they said nothing about coursework.
 */
export function SmartlearnBackdrop({ children }: SmartlearnBackdropProps) {
  return (
    <div className="page-shell" data-public-shell>
      {children}
    </div>
  );
}
