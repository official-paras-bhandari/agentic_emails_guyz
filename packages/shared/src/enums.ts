export const JOB_STATUSES = [
  "queued",
  "running",
  "cancellation_requested",
  "cancelled",
  "completed",
  "failed",
] as const;

export const LEAD_STATUSES = [
  "new",
  "drafted",
  "approved",
  "queued",
  "contacted",
  "replied",
  "unsubscribed",
  "bounced",
  "blocked",
  "duplicate",
] as const;

export const REPLY_CLASSIFICATIONS = [
  "interested",
  "not_interested",
  "unsubscribe",
  "bounce",
  "out_of_office",
  "other",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type ReplyClassification = (typeof REPLY_CLASSIFICATIONS)[number];
