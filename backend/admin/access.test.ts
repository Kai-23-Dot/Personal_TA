import { afterEach, describe, expect, it } from "vitest";
import { isAdminIdentity } from "./access";

const originalIds = process.env.ADMIN_USER_IDS;
const originalEmails = process.env.ADMIN_EMAILS;

afterEach(() => {
  if (originalIds === undefined) delete process.env.ADMIN_USER_IDS;
  else process.env.ADMIN_USER_IDS = originalIds;
  if (originalEmails === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = originalEmails;
});

describe("admin access", () => {
  it("defaults to denying every account", () => {
    delete process.env.ADMIN_USER_IDS;
    delete process.env.ADMIN_EMAILS;
    expect(isAdminIdentity({ id: "owner", email: "owner@example.com" })).toBe(false);
  });

  it("allows an explicitly configured user id", () => {
    process.env.ADMIN_USER_IDS = "another-id, owner-id";
    expect(isAdminIdentity({ id: "owner-id", email: "other@example.com" })).toBe(true);
  });

  it("normalizes an explicitly configured email", () => {
    process.env.ADMIN_EMAILS = " Owner@Example.com ";
    expect(isAdminIdentity({ id: "other-id", email: "owner@example.com" })).toBe(true);
  });

  it("rejects an account outside both allowlists", () => {
    process.env.ADMIN_USER_IDS = "owner-id";
    process.env.ADMIN_EMAILS = "owner@example.com";
    expect(isAdminIdentity({ id: "student-id", email: "student@example.com" })).toBe(false);
  });
});
