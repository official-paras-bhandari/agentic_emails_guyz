import { LEAD_STATUSES, type LeadStatus } from "./enums";

export { LEAD_STATUSES, type LeadStatus };

export function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === "string" && LEAD_STATUSES.includes(value as LeadStatus);
}

export const TERMINAL_LEAD_STATUSES = new Set<LeadStatus>([
  "replied",
  "unsubscribed",
  "bounced",
  "blocked",
  "duplicate",
]);
