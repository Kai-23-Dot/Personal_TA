import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/023_unique_usernames.sql"),
  "utf8"
);

describe("unique username database migration", () => {
  it("enforces trimmed, case-insensitive uniqueness", () => {
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX[\s\S]*LOWER\(BTRIM\(username\)\)/i
    );
    expect(migration).toMatch(
      /LOWER\(BTRIM\(username\)\)\s*=\s*LOWER\(BTRIM\(candidate_username\)\)/i
    );
  });

  it("copies signup metadata into the protected username column", () => {
    expect(migration).toMatch(
      /INSERT INTO public\.profiles \(id, email, full_name, username, avatar_url\)/i
    );
    expect(migration).toContain("profiles_username_immutable");
  });
});
