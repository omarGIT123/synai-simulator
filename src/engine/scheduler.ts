import { SystemState } from "../core/state";
import { computeTaskCost } from "./cost";
import { sampleUsage, slowdownFactor } from "./execution";
import { RNG } from "./random";

const MAX_PRESSURE = 1.2;

export function schedule(
  state: SystemState,
  dt: number,
  rng: RNG
): SystemState {
  const now = state.time;

  const queued = state.tasks.filter((t) => t.status === "queued");

  // ---- Load shedding ----
  if (state.metrics.pressure > MAX_PRESSURE && queued.length > 0) {
    const worst = queued
      .map((t) => ({ t, cost: computeTaskCost(t, state).total }))
      .sort((a, b) => b.cost - a.cost)[0].t;

    worst.status = "failed";
  }

  // ---- Admission control ----
  const sortedQueued = queued
    .map((t) => ({ t, cost: computeTaskCost(t, state).total }))
    .sort((a, b) => a.cost - b.cost);

  for (const { t } of sortedQueued) {
    const cpu = sampleUsage(t.execution.cpuCurve, rng);
    const ram = sampleUsage(t.execution.ramCurve, rng);

    if (
      state.metrics.cpuPressure + cpu / state.resources.totalCPU > 1 ||
      state.metrics.ramPressure + ram / state.resources.totalRAM > 1
    ) {
      continue;
    }

    t.status = "running";
    t.startedAt = now;
    t.expectedEndAt = now + t.execution.meanDuration;
  }

  // ---- Execute running tasks ----
  const running = state.tasks.filter((t) => t.status === "running");
  const cpuTasks = running.filter((t) => t.phase === "cpu");
  const cpuPerTask =
    cpuTasks.length > 0 ? state.resources.totalCPU / cpuTasks.length : 0;

  for (const t of running) {
    const slow = slowdownFactor(state.metrics.pressure);

    if (t.phase === "cpu") {
      t.progress +=
        ((cpuPerTask / state.resources.totalCPU) *
          (dt / t.execution.meanDuration)) /
        slow;
    } else {
      t.progress += 0.3 * (dt / t.execution.meanDuration);
    }

    // Correlated failure
    if (rng() < t.failureProbability * state.metrics.pressure) {
      t.status = "failed";
      continue;
    }

    if (t.progress >= 1) {
      t.status = "completed";
    }

    // Phase switching (async illusion)
    if (rng() < 0.15) {
      t.phase = t.phase === "cpu" ? "io" : "cpu";
    }
  }

  return state;
}
