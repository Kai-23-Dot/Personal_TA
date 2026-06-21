import Link from "next/link";
import { Users } from "lucide-react";
import { EmptyState } from "@/frontend/components/ui/empty-state";
import { createClient } from "@/backend/supabase/server";

type StudyGroupRow = {
  id: string;
  name: string;
  description: string | null;
  invite_code: string;
  created_at: string;
  course: { name: string } | { name: string }[] | null;
};

function courseName(course: StudyGroupRow["course"]) {
  if (Array.isArray(course)) return course[0]?.name ?? null;
  return course?.name ?? null;
}

export default async function GroupsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user!.id);

  const groupIds = (memberships ?? []).map((membership) => membership.group_id);

  const { data: groups } = groupIds.length
    ? await supabase
        .from("study_groups")
        .select("id, name, description, invite_code, created_at, course:courses(name)")
        .in("id", groupIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const { data: memberRows } = groupIds.length
    ? await supabase.from("group_members").select("group_id").in("group_id", groupIds)
    : { data: [] };

  const memberCounts = new Map<string, number>();
  for (const row of memberRows ?? []) {
    memberCounts.set(row.group_id, (memberCounts.get(row.group_id) ?? 0) + 1);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-6">
      <section className="mb-8 rounded-3xl border border-sky-400/15 bg-[rgba(12,15,27,0.82)] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.28)]">
        <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-sky-300/25 bg-sky-400/10 px-3 py-1 text-xs font-medium text-sky-100">
          <Users className="h-3.5 w-3.5" /> Collaboration
        </p>
        <h2 className="text-3xl font-semibold tracking-tight text-white">Study groups</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">
          Groups you belong to, organized around your synced courses.
        </p>
      </section>

      {(groups ?? []).length === 0 ? (
        <EmptyState
          icon={Users}
          title="No study groups yet"
          description="Create or join a group to collaborate around your real synced courses."
          action={<Link href="/courses" className="btn btn-primary">View courses</Link>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {((groups ?? []) as unknown as StudyGroupRow[]).map((group) => (
            <div key={group.id} className="rounded-2xl border border-white/10 bg-[rgba(9,12,24,0.74)] p-5 shadow-[0_8px_40px_rgba(1,6,20,0.35)]">
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-sky-300/25 bg-sky-400/10 text-sm font-semibold text-sky-100">
                  {group.name.slice(0, 2).toUpperCase()}
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300">
                  {memberCounts.get(group.id) ?? 0} member{memberCounts.get(group.id) === 1 ? "" : "s"}
                </span>
              </div>
              <h2 className="mt-5 text-lg font-semibold text-white">{group.name}</h2>
              <p className="mt-1 text-sm text-slate-400">{courseName(group.course) ?? "No course linked"}</p>
              {group.description ? <p className="mt-4 text-sm text-slate-300">{group.description}</p> : null}
              <p className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-400">
                Invite code: <span className="font-mono text-slate-200">{group.invite_code}</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
