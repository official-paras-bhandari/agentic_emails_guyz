# Database model

Prisma owns the PostgreSQL schema and migrations. Workspace-scoped models cover sessions, messages, commands, plans, jobs, agent logs, leads and sources, campaigns, draft versions, send queue records, sent email, replies, follow-ups, suppressions, Google credentials, memory, and audit events.

Database constraints enforce critical idempotency: source URL per lead, draft version numbers, send queue keys, sent queue records, Gmail reply message IDs, follow-up steps, and suppression keys. Production deployments use `npm run db:migrate`; `db:push` is local-development only.
