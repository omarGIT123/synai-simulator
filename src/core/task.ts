export type TaskStatus = "queued" | "running" | "completed" | "failed";
export type TaskPhase = "cpu" | "io";

export type ResourceCurve = {
  base: number;
  peak: number;
  variance: number;
};

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

  failureProbability: number;
  status: TaskStatus;
};
