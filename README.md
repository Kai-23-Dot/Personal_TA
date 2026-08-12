# Conlearn

Conlearn is an AI study assistant built with Next.js 15, Supabase/Postgres, Canvas and other LMS integrations, OpenAI-powered study tools, and Stripe billing.

## Local development

Requirements: Node.js 20+, npm, and a Supabase project (local or hosted).

```bash
npm install
cp .env.example .env.local
npm run db:push
npm run dev
```

Open `http://localhost:3000`. See [SETUP.md](./SETUP.md) for provider configuration, migrations, storage, OAuth callbacks, and deployment.

## Quality gates

```bash
npm run validate:env
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Authenticated browser end-to-end tests require `.env.test` credentials; copy `.env.test.example`:

```bash
npm run test:e2e
```

## Architecture

- `app/` — Next.js pages and API routes
- `backend/` — AI, billing, LMS, retrieval, security, and data utilities
- `frontend/` — reusable UI and client-side helpers
- `supabase/migrations/` — ordered database schema, RLS, storage, and RPC changes
- `types/` — shared application types

Never commit `.env.local`, service-role keys, OAuth secrets, LMS tokens, or test credentials.
