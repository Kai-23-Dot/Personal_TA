import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCanvasCourses } from "./canvas";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Canvas paginated collection retrieval", () => {
  it("follows same-origin Link pagination and combines each page", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { id: 1, name: "Biology", course_code: "BIO", enrollment_term_id: 1 },
          ]),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              Link: '<https://school.instructure.com/api/v1/courses?page=2>; rel="next"',
            },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { id: 2, name: "Chemistry", course_code: "CHEM", enrollment_term_id: 1 },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const courses = await fetchCanvasCourses(
      "school.instructure.com",
      "secret-token"
    );

    expect(courses.map((course) => course.id)).toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer secret-token",
    });
  });

  it("rejects a cross-origin next link before credentials can be sent", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          Link: '<https://attacker.example/steal>; rel="next"',
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchCanvasCourses("school.instructure.com", "secret-token")
    ).rejects.toThrow(/cross-origin/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
