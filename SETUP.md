# Smartlearn setup and deployment

## 1. Configure the environment

Copy `.env.example` to `.env.local`. The build runs `npm run validate:env`; Vercel builds enforce the core production variables.

Core services:

- Supabase URL, anon key, and service-role key
- OpenAI API key
- Sarvam API key for audio transcription
- public application URL
- Vercel Cron secret
- Stripe secret, price, and webhook signing secret

LMS credentials are optional in pairs. Configure only the integrations you expose in production. Canvas personal access tokens work without Canvas OAuth credentials. Custom Canvas OAuth domains outside `*.instructure.com` must be listed in `CANVAS_ALLOWED_DOMAINS`.

## 2. Apply the database

Use a fresh Supabase project or link the CLI to the intended project, then apply every migration in `supabase/migrations/`:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npm run db:push
```

Do not paste only `001_initial.sql`; later migrations contain required constraints, RLS fixes, storage policies, Canvas connection support, and production hardening. Migration 015 creates the private `notes` bucket and restricts each object path to its owning user.

For local Supabase:

```bash
npx supabase start
npm run db:reset
```

## 3. Configure authentication

In Supabase Authentication:

- set the site URL to the production `NEXT_PUBLIC_APP_URL`;
- allow `/callback` on local and production origins;
- enable desired Supabase OAuth providers;
- optionally enable Cloudflare Turnstile and put its site key in the app.

Application OAuth callback:

```text
https://YOUR_APP/callback
```

## 4. Configure LMS providers

Google:

- enable Google Classroom and Google Drive APIs;
- register `https://YOUR_APP/api/lms/google`;
- add the client ID and secret.

Canvas:

- request a developer key from the institution;
- register `https://YOUR_APP/api/lms/canvas`;
- add custom institutional domains to `CANVAS_ALLOWED_DOMAINS`.

Microsoft:

- register `https://YOUR_APP/api/lms/microsoft`;
- grant the education roster/assignment permissions used by the app plus offline access.

Infinite Campus OAuth credentials are optional when using its token-based connection.

Use least-privilege scopes at each provider. Rotate credentials immediately if any secret has ever appeared in logs, source control, screenshots, or support messages.

## 5. Configure Stripe

Create the recurring Pro price referenced by `STRIPE_PRO_PRICE_ID`. Configure the webhook endpoint:

```text
https://YOUR_APP/api/billing/webhook
```

Subscribe it only to these events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `customer.subscription.paused`
- `customer.subscription.resumed`

Store that endpoint's signing secret as `STRIPE_WEBHOOK_SECRET`. In both Stripe
test mode and live mode, configure the customer portal with subscription
cancellation, payment-method updates, and invoice history, then preview it with
a test customer. Keep each environment's secret key, price, webhook secret, and
portal configuration in the same Stripe mode.

## 6. Deploy

Add the variables from `.env.example` to Vercel and deploy. `vercel.json` runs an authenticated daily GET request to `/api/sync`; Vercel supplies `Authorization: Bearer $CRON_SECRET`.

Before promotion:

```bash
npm ci
npm run validate:env -- --strict
npm run lint
npx tsc --noEmit
npm test
npm run build
```

After promotion, perform a smoke test with a non-admin account: sign up/sign in, connect Canvas, sync one course, import a PDF and PPTX, generate and submit a practice session, verify analytics, and complete a Stripe test checkout/webhook cycle.

## Operational notes

- The debug and synthetic retrieval-evaluation endpoints return 404 in production.
- LMS access and refresh tokens are server-only but currently stored in the database; restrict dashboard access and rotate tokens after suspected exposure.
- Sync work is bounded per cron invocation. Monitor partial results and provider failures in server logs.
- Keep Supabase point-in-time recovery or scheduled backups enabled before applying migrations.
