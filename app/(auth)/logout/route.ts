import { redirect } from "next/navigation";
import { createClient } from "@/backend/supabase/server";

export async function GET() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
