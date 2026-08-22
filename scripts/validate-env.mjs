import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const strict = process.env.VERCEL === "1" || process.argv.includes("--strict");
const required = [
  "CRON_SECRET",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "OPENAI_API_KEY",
  "STRIPE_MAX_PRICE_ID",
  "STRIPE_PLUS_PRICE_ID",
  "STRIPE_PRO_PRICE_ID",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const paired = [
  ["CANVAS_CLIENT_ID", "CANVAS_CLIENT_SECRET"],
  ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  ["INFINITE_CAMPUS_CLIENT_ID", "INFINITE_CAMPUS_CLIENT_SECRET"],
  ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
  ["RESEND_API_KEY", "RESEND_FROM_EMAIL"],
];
const placeholderPattern =
  /^(your-|replace-|changeme|example|sk_test_\.\.\.|whsec_\.\.\.|price_\.\.\.|re_\.\.\.|re_your-)/i;
const errors = [];
const warnings = [];

for (const name of required) {
  const value = process.env[name]?.trim();
  if (!value || placeholderPattern.test(value)) {
    (strict ? errors : warnings).push(`${name} is not configured`);
  }
}

if (!process.env.ADMIN_EMAILS?.trim() && !process.env.ADMIN_USER_IDS?.trim()) {
  (strict ? errors : warnings).push("ADMIN_EMAILS or ADMIN_USER_IDS is not configured");
}

for (const pair of paired) {
  const configured = pair.filter((name) => Boolean(process.env[name]?.trim()));
  if (configured.length === 1) {
    errors.push(`${pair.join(" and ")} must be configured together`);
  }
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL;
if (appUrl) {
  try {
    const parsed = new URL(appUrl);
    if (strict && parsed.protocol !== "https:") {
      errors.push("NEXT_PUBLIC_APP_URL must use HTTPS in production");
    }
  } catch {
    errors.push("NEXT_PUBLIC_APP_URL must be an absolute URL");
  }
}

for (const warning of warnings) console.warn(`[env] Warning: ${warning}`);
if (errors.length > 0) {
  for (const error of errors) console.error(`[env] Error: ${error}`);
  process.exitCode = 1;
} else {
  console.log(`[env] Configuration check passed${strict ? " (strict)" : ""}.`);
}
