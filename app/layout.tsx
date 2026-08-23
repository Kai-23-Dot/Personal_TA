import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { ThemeProvider } from "@/frontend/components/providers/ThemeProvider";
import { Toaster } from "sonner";
import "./globals.css";
import "./chain-summit.css";
import "./hero.css";
import "./future-ui.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://smartlearn.app"),
  title: {
    default: "Smartlearn — Your AI Teaching Assistant",
    template: "%s | Smartlearn",
  },
  description:
    "An AI-powered personal teaching assistant that syncs with your school platforms, tracks your assignments, and helps you study smarter.",
  keywords: ["AI tutor", "course assistant", "homework help", "Google Classroom", "Canvas LMS"],
  authors: [{ name: "Smartlearn" }],
  openGraph: {
    title: "Smartlearn — Operational intelligence for your semester",
    description: "Turn courses, deadlines, class materials, and performance signals into the next best study action.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Smartlearn learning intelligence" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Smartlearn — Operational intelligence for your semester",
    description: "Turn courses, deadlines, class materials, and performance signals into the next best study action.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0a0a0f" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0f" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased font-sora">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          disableTransitionOnChange
        >
          {children}
          <Script src="/smartlearn-ui.js" strategy="lazyOnload" />
          <Toaster
            position="bottom-right"
            toastOptions={{
              classNames: {
                toast: "bg-card border-border text-foreground",
                description: "text-muted-foreground",
                actionButton: "bg-primary text-primary-foreground",
                cancelButton: "bg-muted text-muted-foreground",
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
