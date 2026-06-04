import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { Toaster } from "sonner";
import "./globals.css";
import "./chain-summit.css";

export const metadata: Metadata = {
  title: {
    default: "PersonalTA.ai — Your AI Teaching Assistant",
    template: "%s | PersonalTA.ai",
  },
  description:
    "An AI-powered personal teaching assistant that syncs with your school platforms, tracks your assignments, and helps you study smarter.",
  keywords: ["AI tutor", "study planner", "homework help", "Google Classroom", "Canvas LMS"],
  authors: [{ name: "PersonalTA.ai" }],
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
      <body className="min-h-screen antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          disableTransitionOnChange
        >
          {children}
          <Script src="/personalta-ui.js" strategy="lazyOnload" />
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
