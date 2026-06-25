# Agentic Outreach

Chat-driven lead discovery, outreach drafting, approvals, sending, reply handling, follow-ups, and suppression enforcement.

## Local start

Requirements: Node.js 20+, Python 3.12, Docker Desktop, and npm.

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env
cp apps/worker/.env.example apps/worker/.env
cd apps/worker && python3.12 -m venv venv && venv/bin/pip install -e . && cd ../..
npm install
npm run dev:all
```

Open `http://localhost:3000` and sign in with `INTERNAL_USERNAME` and `INTERNAL_PASSWORD`. The local stack starts PostgreSQL on port 5433, Redis on 6379, the web app on 3000, the worker API on 8000, and an RQ consumer.

`MOCK_MODE=true` runs deterministic lead discovery without external provider credentials. `GMAIL_MOCK_MODE=true` is allowed only outside production.

## Verification

With the local stack running:

```bash
npm run build:web
npm run lint:web
npm run test:all
npm run db:migrate
```

The test suite covers command planning, queue execution, signed worker webhooks, lead deduplication, suppression, policy decisions, draft creation, send idempotency, follow-up scheduling, encryption, and replay protection.

## Real providers

For live lead discovery set `MOCK_MODE=false`, configure an LLM provider key in `apps/worker/.env`, and set `ACTIVE_MODEL`. Search and scraping remain bounded by `MAX_SITES_PER_JOB`, `MAX_PAGES_PER_SITE`, concurrency, and timeout settings.

For Gmail, create a Google OAuth web client and set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and the exact `GOOGLE_REDIRECT_URI` in `apps/web/.env`. Set a 32-byte token key as 64 hexadecimal characters in `GOOGLE_TOKEN_ENCRYPTION_KEY`. OAuth requests Gmail modify/send permissions so the system can send and classify replies.

## Production requirements

- Use managed PostgreSQL and Redis; apply migrations with `npm run db:migrate`.
- Set unique, high-entropy values for `WEBHOOK_SECRET`, `INTERNAL_AUTH_SECRET`, `INTERNAL_API_KEY`, and the Google token key.
- Set `MOCK_MODE=false` and `GMAIL_MOCK_MODE=false`.
- Run the Next.js app, worker API, and at least one RQ worker as separate supervised services.
- Terminate TLS at the platform/load balancer and use HTTPS callback and webhook URLs.
- Restrict internal API and worker network access. Rotate secrets if exposed.

## Safety model

AI proposes plans and content. Deterministic backend rules decide whether a lead can be stored, queued, sent, or followed up. Unsubscribes and suppression entries are hard stops; queued sends and follow-ups are cancelled immediately.
