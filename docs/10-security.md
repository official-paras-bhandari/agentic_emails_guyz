# Security controls

- Production pages and APIs require a signed session or internal API key.
- Worker webhooks use timestamped HMAC-SHA256 over the exact raw body, timing-safe comparison, and a five-minute replay window.
- Google tokens use authenticated AES-256-GCM encryption.
- OAuth state is signed and expires.
- Telegram webhooks require a provider secret in production.
- Rate limits cover command, job, send, reply-sync, and unsubscribe endpoints.
- All business records and policy queries are workspace scoped.

Secrets must be unique per environment, stored in the deployment secret manager, and rotated after any exposure. TLS and private service networking are deployment responsibilities.
