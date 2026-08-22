import { describe, expect, it } from "vitest";
import { loginInputSchema, signupInputSchema } from "./authInput";

describe("auth input schemas", () => {
  it.each([undefined, null])(
    "accepts a signup without an active CAPTCHA token (%s)",
    (captchaToken) => {
      const result = signupInputSchema.safeParse({
        username: "Student One",
        email: "student@example.org",
        password: "secure-password",
        ...(captchaToken === undefined ? {} : { captchaToken }),
      });

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.captchaToken).toBeUndefined();
    }
  );

  it.each([undefined, null])(
    "accepts a login without an active CAPTCHA token (%s)",
    (captchaToken) => {
      const result = loginInputSchema.safeParse({
        email: "student@example.org",
        password: "secure-password",
        ...(captchaToken === undefined ? {} : { captchaToken }),
      });

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.captchaToken).toBeUndefined();
    }
  );

  it("rejects unexpected auth fields", () => {
    const result = loginInputSchema.safeParse({
      email: "student@example.org",
      password: "secure-password",
      admin: true,
    });

    expect(result.success).toBe(false);
  });
});
