import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  eq: vi.fn(),
  getUser: vi.fn(),
  or: vi.fn(),
  order: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/backend/supabase/server", () => ({
  createClient: vi.fn(async () => {
    const query = {
      eq: mocks.eq,
      or: mocks.or,
      order: mocks.order,
      select: mocks.select,
      then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
        return Promise.resolve(resolve({ data: [], error: null }));
      },
    };
    mocks.eq.mockReturnValue(query);
    mocks.or.mockReturnValue(query);
    mocks.order.mockReturnValue(query);
    mocks.select.mockReturnValue(query);
    return {
      auth: { getUser: mocks.getUser },
      from: vi.fn(() => query),
    };
  }),
}));

import { GET } from "@/app/api/assignments/route";

describe("active assignments route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("uses an inner course join and excludes assignments from inactive courses", async () => {
    const response = await GET(new NextRequest("http://localhost/api/assignments"));

    expect(response.status).toBe(200);
    expect(mocks.select).toHaveBeenCalledWith(
      "*, course:courses!inner(id, name, color, is_active)"
    );
    expect(mocks.eq).toHaveBeenCalledWith("course.is_active", true);
  });
});
