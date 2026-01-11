import { SystemState } from "../core/state";
import { computeTaskCost } from "./cost";
import { slowdownFactor } from "./execution";
import { RNG } from "./random";
import { sampleUsage } from "./execution";

const MAX_PRESSURE = 1.2;

function phaseFailureMultiplier(phase: "cpu" | "io") {
  return phase === "io" ? 1.6 : 1.0;
}

export function schedule(
  state: SystemState,
  dt: number,
  rng: RNG
): SystemState {
  const now = state.time;

  /* =========================================================
     1. STARVATION FAILURE (queued too long, under pressure)
     ========================================================= */

  for (const t of state.tasks) {
    if (
      t.status === "queued" &&
      t.maxQueueTime !== undefined &&
      now - t.createdAt > t.maxQueueTime &&
      state.metrics.pressure > 1
    ) {
      t.status = "failed";
      t.failureType = "starvation";
      t.failureReason =
        "Starvation: task waited too long in queue under pressure";
    }
  }

  const queued = state.tasks.filter((t) => t.status === "queued");

  /* =========================================================
     2. LOAD SHEDDING (system protection)
     ========================================================= */

  if (state.metrics.pressure > MAX_PRESSURE && queued.length > 0) {
    const worst = queued
      .map((t) => ({ t, cost: computeTaskCost(t, state).total }))
      .sort((a, b) => b.cost - a.cost)[0].t;

    worst.status = "failed";
    worst.failureType = "load_shed";
    worst.failureReason = "Load shed: system pressure exceeded safe threshold";
  }

  /* =========================================================
     3. ADMISSION CONTROL (concurrency-limited)
     ========================================================= */

  const queuedWithCost = state.tasks
    .filter((t) => t.status === "queued")
    .map((t) => ({ t, cost: computeTaskCost(t, state).total }));

  let sortedQueued;

  switch (state.policy) {
    case "THROUGHPUT":
      // favor cheap tasks → maximize completions
      sortedQueued = queuedWithCost.sort((a, b) => a.cost - b.cost);
      break;

    case "FAIRNESS":
      // favor oldest tasks
      sortedQueued = queuedWithCost.sort(
        (a, b) => a.t.createdAt - b.t.createdAt
      );
      break;

    case "BALANCED":
    default:
      // mix age + cost
      sortedQueued = queuedWithCost.sort(
        (a, b) =>
          0.5 * (a.cost - b.cost) + 0.5 * (a.t.createdAt - b.t.createdAt)
      );
  }

  let runningCount = state.tasks.filter((t) => t.status === "running").length;

  for (const { t } of sortedQueued) {
    if (runningCount >= state.config.maxConcurrentTasks) break;

    t.status = "running";
    t.startedAt = now;
    t.expectedEndAt = now + t.execution.meanDuration;

    t.currentRAM = sampleUsage(t.execution.ramCurve, rng);

    runningCount++;
  }

  /* =========================================================
     4. EXECUTE RUNNING TASKS
     ========================================================= */

  const running = state.tasks.filter((t) => t.status === "running");

  /* ---------- CPU SHARING ---------- */
  const cpuTasks = running.filter((t) => t.phase === "cpu");
  const cpuPerTask =
    cpuTasks.length > 0 ? state.resources.totalCPU / cpuTasks.length : 0;

  /* ---------- RAM ACCUMULATION ---------- */
  let totalUsedRAM = 0;
  for (const t of running) {
    if (t.currentRAM !== undefined) {
      totalUsedRAM += t.currentRAM;
    }
  }

  state.metrics.ramPressure = totalUsedRAM / state.resources.totalRAM;

  /* ---------- EXECUTION LOOP ---------- */
  for (const t of running) {
    const cpuSlow = slowdownFactor(state.metrics.cpuPressure);

    if (t.phase === "cpu") {
      t.progress +=
        ((cpuPerTask / state.resources.totalCPU) *
          (dt / t.execution.meanDuration)) /
        cpuSlow;
    } else {
      const ramSlow = 1 + Math.max(0, state.metrics.ramPressure - 1);

      t.progress += (0.3 * dt) / t.execution.meanDuration / ramSlow;
    }

    /* ---------- TIMEOUT FAILURE ---------- */
    if (t.deadline !== undefined && t.startedAt !== undefined) {
      const effectiveDeadline =
        t.deadline * Math.max(1, state.metrics.pressure);

      if (now - t.startedAt > effectiveDeadline && state.metrics.pressure > 1) {
        t.status = "failed";
        t.failureType = "timeout";
        t.failureReason = "Deadline exceeded under sustained pressure";
        continue;
      }
    }

    /* ---------- PRESSURE-CORRELATED FAILURE ---------- */
    const runTime = t.startedAt !== undefined ? now - t.startedAt : 0;

    const fatigueMultiplier = 1 + Math.min(runTime / 10, 1);

    const lambda =
      t.failureProbability *
      phaseFailureMultiplier(t.phase) *
      fatigueMultiplier *
      state.metrics.pressure;

    const perTickRisk = 1 - Math.exp(-lambda * dt);

    if (rng() < perTickRisk) {
      t.status = "failed";
      t.failureType = "pressure";
      t.failureReason = `Execution failure (λ=${lambda.toFixed(3)})`;
      continue;
    }

    /* ---------- COMPLETION ---------- */
    if (t.progress >= 1) {
      t.status = "completed";
    }

    /* ---------- ASYNC ILLUSION ---------- */
    if (rng() < 0.15) {
      t.phase = t.phase === "cpu" ? "io" : "cpu";
    }
  }

  return state;
}
