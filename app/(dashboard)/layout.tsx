import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import type { Profile } from "@/types";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url, grade_level, school_name, timezone, preferred_subjects, role, preferences, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle<Profile>();

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
    <div className="min-h-screen bg-background text-foreground" data-dashboard-shell>
      <Sidebar profile={profile ?? null} />
      <div className="min-h-screen md:pl-64">
        <Header title="Workspace" description="Find your courses, notes, practice tests, and study sets quickly." />
        <main className="app-container pb-28 pt-5 md:pb-10">
        {!onboarding?.completed ? (
          <div className="mb-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <strong className="text-sm text-emerald-100">Finish onboarding</strong>
                <p className="mt-1 text-sm text-muted-foreground">
                Connect your classes, upload notes, and generate your first plan.
              </p>
              </div>
              <a className="btn btn-primary w-fit" href="/onboarding">Go to onboarding</a>
            </div>
          </div>
        ) : null}
        {children}
        </main>
      </div>
      <div role="navigation" aria-label="Mobile workspace navigation" className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-5 gap-1 rounded-2xl border border-white/10 bg-[#0b1110]/95 p-2 shadow-2xl backdrop-blur md:hidden">
        {dashboardLinks.slice(0, 5).map((link) => (
          <Link key={link.href} href={link.href} className="rounded-xl px-2 py-2 text-center text-[11px] font-medium text-muted-foreground transition hover:bg-white/5 hover:text-foreground">
            {link.label.replace("Assignments", "Tasks")}
          </Link>
        ))}
      </div>
    </div>
  );
}
