import { redirect } from "next/navigation";
import { createClient } from "@/backend/supabase/server";
import { DashboardClientWrapper } from "@/frontend/components/layout/DashboardClientWrapper";
import { WorkspaceShell } from "@/frontend/components/layout/WorkspaceShell";
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
    supabase.from("lms_connections").select("id, last_synced_at").eq("user_id", user.id).eq("platform", "canvas").eq("is_active", true).limit(1).maybeSingle(),
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
    <WorkspaceShell
      profile={profile ?? null}
      plan={plan}
      isAdmin={isAdmin}
      canvasConnection={canvasConn ?? null}
    >
      <DashboardClientWrapper pendingCanvasAgreement={pendingCanvasAgreement ?? null}>
        {showOnboardingBanner ? (
          <div className="mb-6 rounded-lg border border-sky-400/20 bg-sky-500/[0.08] p-4" data-notion-surface>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <strong className="text-sm text-sky-100">Finish onboarding</strong>
                <p className="mt-1 text-sm text-muted-foreground">
                  Connect your classes, upload notes, and create your first study set.
                </p>
              </div>
              <a className="btn btn-primary w-fit" href="/onboarding">Go to onboarding</a>
            </div>
          </div>
        ) : null}
        {children}
      </DashboardClientWrapper>
    </WorkspaceShell>
  );
}
