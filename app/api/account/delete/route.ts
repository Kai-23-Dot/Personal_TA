import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/backend/supabase/server";
import { stripe } from "@/backend/billing/stripe";

type StorageEntry = { name: string; id?: string | null };

async function listStorageFiles(
  serviceClient: ReturnType<typeof createServiceClient>,
  path: string
): Promise<string[]> {
  const { data, error } = await serviceClient.storage.from("notes").list(path, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw error;

  const files: string[] = [];
  for (const entry of (data ?? []) as StorageEntry[]) {
    const entryPath = path ? `${path}/${entry.name}` : entry.name;
    if (entry.id) files.push(entryPath);
    else files.push(...(await listStorageFiles(serviceClient, entryPath)));
  }
  return files;
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const serviceClient = createServiceClient();
  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    console.error("[account/delete] Could not load billing profile:", profileError);
    return NextResponse.json({ error: "Account deletion could not be started." }, { status: 500 });
  }

  // Remove uploaded note files, which live outside the relational cascade.
  try {
    const files = await listStorageFiles(serviceClient, user.id);
    if (files.length > 0) {
      const { error } = await serviceClient.storage.from("notes").remove(files);
      if (error) throw error;
    }
  } catch (error) {
    console.error("[account/delete] Could not remove note files:", error);
    return NextResponse.json({ error: "Account deletion could not remove stored files." }, { status: 500 });
  }

  // Removing the Stripe customer cancels its subscriptions and deletes billing data.
  if (profile?.stripe_customer_id && process.env.STRIPE_SECRET_KEY) {
    try {
      await stripe.customers.del(profile.stripe_customer_id);
    } catch (error) {
      console.error("[account/delete] Could not remove Stripe customer:", error);
      return NextResponse.json({ error: "Account deletion could not remove billing data." }, { status: 500 });
    }
  }

  const { error } = await serviceClient.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("[account/delete] Could not delete auth user:", error);
    return NextResponse.json({ error: "Account deletion failed. Nothing was deleted from the account." }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const cookie of cookieHeader.split(";")) {
    const name = cookie.split("=", 1)[0]?.trim();
    if (name?.startsWith("sb-")) response.cookies.set(name, "", { maxAge: 0, path: "/" });
  }
  return response;
}
