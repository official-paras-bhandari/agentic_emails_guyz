# Delivery status

Implemented: chat planning, durable queue execution, signed events, bounded discovery, deduplication, lead and campaign APIs, versioned drafts, approvals, policy-controlled send queue, Gmail OAuth/send/reply sync, four-step follow-ups, suppression, audit, memory, production auth, migrations, local infrastructure, and automated acceptance tests.

Environment-dependent acceptance remains for each deployment: authorize a real Google account, run one live provider-backed scrape, configure HTTPS callbacks, and verify platform monitoring/backups. These checks require deployment credentials and cannot be completed in credential-free mock mode.
