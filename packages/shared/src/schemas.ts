import { JOB_STATUSES } from "./enums";
import type { CommandPlan } from "./command-types";

export function assertCommandPlan(value: unknown): asserts value is CommandPlan {
  if (!value || typeof value !== "object") throw new TypeError("Command plan must be an object");
  const plan = value as Partial<CommandPlan>;
  if (typeof plan.allowed !== "boolean") throw new TypeError("Command plan.allowed must be boolean");
  if (typeof plan.goal !== "string" || !plan.goal.trim()) throw new TypeError("Command plan.goal is required");
  if (!['scrape_leads', 'find_businesses'].includes(String(plan.intent))) throw new TypeError("Unsupported command intent");
  if (!plan.parameters || typeof plan.parameters !== "object") throw new TypeError("Command parameters are required");
}

export function isJobStatus(value: unknown): value is (typeof JOB_STATUSES)[number] {
  return typeof value === "string" && JOB_STATUSES.includes(value as (typeof JOB_STATUSES)[number]);
}
