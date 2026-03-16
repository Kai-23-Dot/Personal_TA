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

  const dashboardLinks = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Practice", href: "/practice" },
    { label: "Notes", href: "/notes" },
    { label: "Chat", href: "/chat" },
    { label: "Settings", href: "/settings" },
  ];

  return (
    <PersonalTABackdrop>
      <PersonalTAHeader links={dashboardLinks} showSignIn={false} />
      <main className="app-container" style={{ paddingTop: "120px" }}>{children}</main>
      <PersonalTAFooter />
    </PersonalTABackdrop>
  );
}
