import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deactivateMissingCanvasCourses } from "@/backend/lms/deactivateMissingCanvasCourses";

function createSupabaseMock() {
  const not = vi.fn();
  const query = {
    update: vi.fn(),
    eq: vi.fn(),
    not,
    then(resolve: (result: { error: null }) => unknown) {
      return Promise.resolve(resolve({ error: null }));
    },
  };
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.not.mockReturnValue(query);
  const from = vi.fn(() => query);

  return { supabase: { from } as unknown as SupabaseClient, from, query, not };
}

describe("deactivateMissingCanvasCourses", () => {
  it("deactivates all cached courses when Canvas has no active courses", async () => {
    const { supabase, from, query, not } = createSupabaseMock();

    await deactivateMissingCanvasCourses(supabase, {
      userId: "user-1",
      connectionId: "connection-1",
      activePlatformIds: [],
    });

    expect(from).toHaveBeenCalledWith("courses");
    expect(query.update).toHaveBeenCalledWith({ is_active: false });
    expect(query.eq).toHaveBeenCalledWith("connection_id", "connection-1");
    expect(not).not.toHaveBeenCalled();
  });

  it("keeps active Canvas courses and deactivates only missing ones", async () => {
    const { supabase, not } = createSupabaseMock();

    await deactivateMissingCanvasCourses(supabase, {
      userId: "user-1",
      connectionId: "connection-1",
      activePlatformIds: [101, 202],
    });

    expect(not).toHaveBeenCalledWith("platform_id", "in", "(101,202)");
  });
});
