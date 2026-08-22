# Smartlearn security

Smartlearn uses layered controls because no application-level check can stop a
volumetric distributed denial-of-service attack on its own.

## Implemented controls

- Vercel's always-on platform firewall provides network and application-layer
  DDoS mitigation before requests reach the deployment.
- Middleware authenticates protected routes, blocks cross-site browser
  mutations, bounds request bodies, and applies per-IP and per-user abuse limits.
- Authentication endpoints have stricter limits for login, signup, OAuth, and
  password-reset attempts.
- AI routes enforce billing allowances, bounded histories, inline-image type and
  size allowlists, and reject remote attachment URLs.
- Security headers include CSP, HSTS, frame denial, MIME sniffing prevention,
  restrictive permissions, and no-store API caching.
- Supabase tables use row-level security. Service-role access is server-only and
  API routes using it must explicitly verify the current user and resource access.
- Upload and Canvas URL validation use explicit size/type/domain safeguards.
- Stripe webhooks require a valid Stripe signature; cron sync requires its secret.

The in-application rate limiter is intentionally a second line of defense. It is
best-effort per warm serverless instance, while Vercel's firewall handles
distributed traffic at the edge.

## Operational response

During an active attack:

1. Review the Vercel project's Firewall traffic and events.
2. Enable Attack Challenge Mode temporarily:

   ```sh
   vercel firewall attack-mode enable
   ```

3. Add or tighten an edge WAF rate-limit rule for the attacked route. Rate-limit
   pricing and legitimate shared-network users should be reviewed first.
4. Inspect Supabase, Stripe, and AI-provider usage for abnormal activity and
   revoke exposed sessions or keys.
5. Disable challenge mode after traffic normalizes:

   ```sh
   vercel firewall attack-mode disable
   ```

Keep Vercel spend alerts and provider budget alerts enabled. Rotate production
secrets periodically and immediately after suspected exposure. Never commit
`.env` files, service-role keys, webhook secrets, OAuth secrets, or LMS tokens.

## Reporting a vulnerability

Do not open a public issue containing exploit details or user data. Use the
repository's private GitHub security-advisory flow and include reproduction
steps, affected endpoints, and the expected impact.
