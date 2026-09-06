import { redirect } from "next/navigation";
import { createClient } from "@/backend/supabase/server";
import { Header } from "@/frontend/components/layout/Header";
import { Sidebar } from "@/frontend/components/layout/Sidebar";
import { MobileNav } from "@/frontend/components/layout/MobileNav";
import { DashboardClientWrapper } from "@/frontend/components/layout/DashboardClientWrapper";
import { getUserPlan } from "@/backend/billing/limits";
import { isAdminIdentity } from "@/backend/admin/access";
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

  const [
    { data: onboarding },
    { data: canvasConn },
    { data: pendingCanvasAgreement },
    { data: profile },
  ] = await Promise.all([
    supabase.from("user_onboarding").select("completed").eq("user_id", user.id).maybeSingle(),
    supabase.from("lms_connections").select("id").eq("user_id", user.id).eq("is_active", true).limit(1).maybeSingle(),
    supabase
      .from("lms_connections")
      .select("id, canvas_domain")
      .eq("user_id", user.id)
      .eq("platform", "canvas")
      .eq("is_active", false)
      .contains("metadata", { canvas_connection_agreement: { status: "pending" } })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id, email, full_name, avatar_url, grade_level, school_name, timezone, preferred_subjects, role, preferences, created_at, updated_at")
      .eq("id", user.id)
      .maybeSingle<Profile>(),
  ]);

  // Effective plan (falls back to "free" if billing columns are missing) —
  // used to hide the Upgrade tab for Pro subscribers.
  const plan = await getUserPlan(user.id);
  const isAdmin = isAdminIdentity({ id: user.id, email: user.email });

  // Suppress banner once any LMS is connected (user has already onboarded their classes)
  const showOnboardingBanner = !onboarding?.completed && !canvasConn;

  return (
    <div className="min-h-screen bg-background text-foreground" data-dashboard-shell data-notion-workspace-shell>
      <Sidebar profile={profile ?? null} plan={plan} isAdmin={isAdmin} />
      <div className="min-h-screen md:pl-60">
        <Header title="Smartlearn" description="Your courses, notes, practice tests, and study sets — all in one place." isAdmin={isAdmin} />
        {/* Legacy .app-container (chain-summit.css) is deliberately NOT used here:
            its `padding` shorthand zeroed the top padding and capped width at
            1200px, silently overriding these utilities. */}
        <main className="workspace-main w-full px-4 pb-28 pt-8 sm:px-6 md:pb-16 lg:px-8">
        <div className="workspace-column workspace-column--wide">
        <DashboardClientWrapper pendingCanvasAgreement={pendingCanvasAgreement ?? null}>
          {showOnboardingBanner ? (
            <div className="onboarding-callout mb-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <strong className="block text-sm font-semibold">Finish setting up</strong>
                  <p className="mt-1 text-sm text-[var(--ink-muted)]">
                    Connect your classes, upload notes, and generate your first plan.
                  </p>
                </div>
                <a className="callout-action w-fit" href="/onboarding">Connect my classes</a>
              </div>
            </div>
          ) : null}
          {children}
        </DashboardClientWrapper>
        </div>
        </main>
      </div>
      <MobileNav plan={plan} isAdmin={isAdmin} />
    </div>
  );
}
