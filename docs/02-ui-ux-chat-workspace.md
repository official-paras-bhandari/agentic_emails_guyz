# Chat workspace

The primary entry point is `/chat`. A command creates a session, a persisted plan, a job, and live progress records. Supporting screens expose leads, campaigns, drafts awaiting approval, follow-ups, jobs, audit records, Google connection state, and the suppression list.

Production routes require a signed internal session. API clients may instead use the configured internal API key and an explicit workspace identifier.
