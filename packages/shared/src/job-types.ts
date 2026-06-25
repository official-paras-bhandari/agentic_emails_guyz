import type { JobStatus } from "./enums";

export interface WorkerCommandRequest {
  workspace_id: string;
  command_id: string;
  job_id: string;
  message: string;
  mock_mode?: boolean;
  user_id?: string;
}

export interface JobSummary {
  id: string;
  workspaceId: string;
  status: JobStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  error?: string | null;
}
