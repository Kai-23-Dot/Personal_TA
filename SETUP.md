# Smartlearn setup and deployment

## 1. Configure the environment

Copy `.env.example` to `.env.local`. The build runs `npm run validate:env`; Vercel builds enforce the core production variables.

Core services:

- Supabase URL, anon key, and service-role key
- OpenAI API key for text, vision, audio transcription, and embeddings
- public application URL
- Vercel Cron secret
- Stripe secret, price, and webhook signing secret
- a server-only owner allowlist (`ADMIN_EMAILS` and/or `ADMIN_USER_IDS`)

LMS credentials are optional in pairs. Configure only the integrations you expose in production. Canvas personal access tokens work without Canvas OAuth credentials. Custom Canvas OAuth domains outside `*.instructure.com` must be listed in `CANVAS_ALLOWED_DOMAINS`.

## 2. Apply the database

Use a fresh Supabase project or link the CLI to the intended project, then apply every migration in `supabase/migrations/`:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npm run db:push
```

Do not paste only `001_initial.sql`; later migrations contain required constraints, RLS fixes, storage policies, Canvas connection support, and production hardening. Migration 014 creates the private `notes` bucket and restricts each object path to its owning user.

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

Create three recurring monthly Stripe prices and configure their ids:

- Plus ($4.99) as `STRIPE_PLUS_PRICE_ID`;
- Pro ($19.99) as `STRIPE_PRO_PRICE_ID`;
- Max ($29.99) as `STRIPE_MAX_PRICE_ID`.

Configure the webhook endpoint:

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
cancellation, plan changes between all three prices, payment-method updates,
and invoice history, then preview it with
a test customer. Keep each environment's secret key, price, webhook secret, and
portal configuration in the same Stripe mode.

## 6. Configure transactional billing email

Create a Resend account, verify a sending domain or subdomain, and create an API
key. Configure:

- `RESEND_API_KEY` with the server-only API key;
- `RESEND_FROM_EMAIL` with a branded sender such as
  `Smartlearn <billing@updates.your-domain.com>`;
- optionally, `RESEND_REPLY_TO` with a monitored support inbox.

Smartlearn queues upgrade and downgrade confirmations atomically with each Stripe
plan change. Delivery uses the Stripe event id as an idempotency key, so webhook
retries do not send duplicate messages.

## 7. Deploy

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

## Owner analytics

The private `/admin` workspace is denied by default. Add the owner's normalized
email to `ADMIN_EMAILS`, or preferably their immutable Supabase user UUID to
`ADMIN_USER_IDS`. Both variables are server-only, accept comma-separated values,
and must never use a `NEXT_PUBLIC_` prefix. Non-allowlisted users receive a 404
from both the page and `/api/admin/overview` even if they guess the URL.

Stripe revenue, subscriptions, balance transactions, fees, refunds, and balances
use `STRIPE_SECRET_KEY`. Exact organization-wide OpenAI tokens, requests, model
usage, and cost line items require a separate organization Admin API key in
`OPENAI_ADMIN_KEY`; the normal project `OPENAI_API_KEY` cannot read those admin
endpoints. Without it, the dashboard uses Smartlearn's local cost-weighted metering
as an explicitly labeled estimate.

## Operational notes

- The debug and synthetic retrieval-evaluation endpoints return 404 in production.
- LMS access and refresh tokens are server-only but currently stored in the database; restrict dashboard access and rotate tokens after suspected exposure.
- Sync work is bounded per cron invocation. Monitor partial results and provider failures in server logs.
- Keep Supabase point-in-time recovery or scheduled backups enabled before applying migrations.
