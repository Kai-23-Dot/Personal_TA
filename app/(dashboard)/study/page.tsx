import { redirect } from "next/navigation";

/**
 * The generated scheduling feature is intentionally retired while it is rebuilt.
 * Keep this redirect so bookmarks and old notifications fail safely instead
 * of stranding signed-in users on a dead route.
 */
export default function RetiredStudyPlannerPage() {
  redirect("/dashboard");
}
