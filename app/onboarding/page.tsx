import { redirect } from "next/navigation";
import { createClient } from "@/backend/supabase/server";
import { OnboardingFlow } from "@/frontend/components/onboarding/OnboardingFlow";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Fonboarding");
  const [{ data: onboarding }, { data: connections }] = await Promise.all([
    supabase.from("user_onboarding").select("steps, completed").eq("user_id", user.id).maybeSingle(),
    supabase.from("lms_connections").select("id, canvas_domain, is_active, metadata").eq("user_id", user.id).eq("platform", "canvas"),
  ]);
  if (onboarding?.completed) redirect("/dashboard");
  const pending = connections?.find((connection) => connection.metadata?.canvas_connection_agreement?.status === "pending");
  return <OnboardingFlow initialSteps={onboarding?.steps ?? {}} connected={Boolean(connections?.some((connection) => connection.is_active))} pendingConnection={pending ? { id: pending.id, domain: pending.canvas_domain } : undefined} />;
}
