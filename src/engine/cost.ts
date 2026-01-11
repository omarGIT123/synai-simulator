import { Task } from "../core/task";
import { SystemState } from "../core/state";
import { POLICIES } from "./policy";

export type CostBreakdown = {
  starvation: number;
  lateness: number;
  failureRisk: number;
  instability: number;
  total: number;
};

export function computeTaskCost(task: Task, state: SystemState): CostBreakdown {
  const policy = POLICIES[state.policy];
  const now = state.time;
  const pressure = state.metrics.pressure;

  // --- Starvation ---
  const waitingTime = task.startedAt === undefined ? now - task.createdAt : 0;

  const starvation = waitingTime * policy.starvationWeight;

  // --- Lateness ---
  const latenessTime = Math.max(0, now - task.deadline);

  const lateness = latenessTime * policy.latenessWeight;

  // --- Failure Risk (expected loss) ---
  const failureRisk = task.failureProbability * pressure * policy.failureWeight;

  // --- System Instability ---
  const instability = pressure * pressure * policy.instabilityWeight;

  const total = starvation + lateness + failureRisk + instability;

  return {
    starvation,
    lateness,
    failureRisk,
    instability,
    total,
  };
}
