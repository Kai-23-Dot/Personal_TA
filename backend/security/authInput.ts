import { z } from "zod";

const captchaTokenSchema = z
  .string()
  .max(4096)
  .nullish()
  .transform((token) => token ?? undefined);

export const signupInputSchema = z
  .object({
    // Null remains accepted for older clients; current clients omit an empty
    // Turnstile value so CAPTCHA-disabled projects work without special cases.
    captchaToken: captchaTokenSchema,
    email: z.string().trim().email().max(254),
    password: z.string().min(8).max(128),
    username: z
      .string()
      .trim()
      .min(3)
      .max(50)
      .regex(/^[\p{L}\p{N} ._'’-]+$/u),
  })
  .strict();

export const loginInputSchema = z
  .object({
    captchaToken: captchaTokenSchema,
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(1024),
  })
  .strict();

export const resendConfirmationInputSchema = z
  .object({
    captchaToken: captchaTokenSchema,
    email: z.string().trim().email().max(254),
  })
  .strict();
