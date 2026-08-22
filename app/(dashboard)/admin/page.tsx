import { notFound } from "next/navigation";
import { createClient } from "@/backend/supabase/server";
import { isAdminIdentity } from "@/backend/admin/access";
import { AdminDashboard } from "@/frontend/components/admin/AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminIdentity({ id: user.id, email: user.email })) notFound();

  return <AdminDashboard />;
}
