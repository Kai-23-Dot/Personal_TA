import { redirect } from "next/navigation";
import { createClient } from "@/backend/supabase/server";
import { Header } from "@/frontend/components/layout/Header";
import { Sidebar } from "@/frontend/components/layout/Sidebar";
import { MobileNav } from "@/frontend/components/layout/MobileNav";
import { DashboardClientWrapper } from "@/frontend/components/layout/DashboardClientWrapper";
import { getUserPlan } from "@/backend/billing/limits";
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

  const [{ data: onboarding }, { data: canvasConn }, { data: profile }] = await Promise.all([
    supabase.from("user_onboarding").select("completed").eq("user_id", user.id).maybeSingle(),
    supabase.from("lms_connections").select("id").eq("user_id", user.id).eq("is_active", true).limit(1).maybeSingle(),
    supabase
      .from("profiles")
      .select("id, email, full_name, avatar_url, grade_level, school_name, timezone, preferred_subjects, role, preferences, created_at, updated_at")
      .eq("id", user.id)
      .maybeSingle<Profile>(),
  ]);

  // Effective plan (falls back to "free" if billing columns are missing) —
  // used to hide the Upgrade tab for Pro subscribers.
  const plan = await getUserPlan(user.id);

  // Suppress banner once any LMS is connected (user has already onboarded their classes)
  const showOnboardingBanner = !onboarding?.completed && !canvasConn;

  return (
    <div className="min-h-screen bg-background text-foreground" data-dashboard-shell>
      <Sidebar profile={profile ?? null} plan={plan} />
      <div className="min-h-screen md:pl-60">
        <Header title="Conlearn" description="Your courses, notes, practice tests, and study sets — all in one place." />
        <main className="app-container pb-28 pt-16 md:pb-10">
        <DashboardClientWrapper>
          {showOnboardingBanner ? (
            <div className="mb-5 rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <strong className="text-sm text-sky-100">Finish onboarding</strong>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Connect your classes, upload notes, and generate your first plan.
                  </p>
                </div>
                <a className="btn btn-primary w-fit" href="/onboarding">Go to onboarding</a>
              </div>
            </div>
          ) : null}
          {children}
        </DashboardClientWrapper>
        </main>
      </div>
      <MobileNav plan={plan} />
    </div>
  );
}
