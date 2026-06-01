import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PersonalTABackdrop } from "@/components/layout/PersonalTABackdrop";
import { PersonalTAHeader } from "@/components/layout/PersonalTAHeader";
import { PersonalTAFooter } from "@/components/layout/PersonalTAFooter";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: onboarding } = await supabase
    .from("user_onboarding")
    .select("completed")
    .eq("user_id", user.id)
    .maybeSingle();

  const dashboardLinks = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Assignments", href: "/assignments" },
    { label: "Practice", href: "/practice" },
    { label: "Notes", href: "/notes" },
    { label: "Flashcards", href: "/flashcards" },
    { label: "Review", href: "/review" },
    { label: "Focus", href: "/focus" },
    { label: "Chat", href: "/chat" },
    { label: "Settings", href: "/settings" },
  ];

  return (
    <PersonalTABackdrop>
      <PersonalTAHeader links={dashboardLinks} showSignIn={false} showSignOut />
      <main className="app-container" style={{ paddingTop: "120px" }}>
        {!onboarding?.completed ? (
          <div className="contact-info-section" style={{ marginBottom: "1.5rem" }}>
            <div className="contact-form-column">
              <strong>Finish onboarding</strong>
              <p style={{ color: "var(--gray)" }}>
                Connect your classes, upload notes, and generate your first plan.
              </p>
              <a className="btn btn-primary" href="/onboarding">Go to onboarding</a>
            </div>
          </div>
        ) : null}
        {children}
      </main>
      <PersonalTAFooter />
    </PersonalTABackdrop>
  );
}
