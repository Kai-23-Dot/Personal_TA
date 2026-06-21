import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { ThemeProvider } from "@/frontend/components/providers/ThemeProvider";
import { Toaster } from "sonner";
import "./globals.css";
import "./chain-summit.css";
import "./hero.css";

export const metadata: Metadata = {
  title: {
    default: "Conlearn — Your AI Teaching Assistant",
    template: "%s | Conlearn",
  },
  description:
    "An AI-powered personal teaching assistant that syncs with your school platforms, tracks your assignments, and helps you study smarter.",
  keywords: ["AI tutor", "study planner", "homework help", "Google Classroom", "Canvas LMS"],
  authors: [{ name: "Conlearn" }],
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
          href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
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
          <Script src="/conlearn-ui.js" strategy="lazyOnload" />
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
