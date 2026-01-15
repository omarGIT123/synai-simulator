export type TaskStatus = "queued" | "running" | "completed" | "failed";
export type TaskPhase = "cpu" | "io";

export type ResourceCurve = {
  base: number;
  peak: number;
  variance: number;
};

export type FailureType =
  | "pressure"
  | "timeout"
  | "starvation"
  | "load_shed"
  | "random";

export type ExecutionProfile = {
  meanDuration: number;
  cpuCurve: ResourceCurve;
  ramCurve: ResourceCurve;
};

export type Task = {
  id: string;
  value: number;
  deadline: number;
  execution: ExecutionProfile;
  createdAt: number;
  startedAt?: number;
  expectedEndAt?: number;
  progress: number;
  phase: TaskPhase;
  jitter?: number;
  currentRAM?: number;
  failureProbability: number;
  failureReason?: string;
  failureType?: FailureType;
  maxQueueTime?: number;
  status: TaskStatus;
  finishedAt?: number; // Timestamp when the task is finished (completed or failed)
};
