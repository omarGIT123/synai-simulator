// src/engine/policy.ts
var POLICIES = {
  FAIRNESS: {
    starvationWeight: 2,
    latenessWeight: 0.8,
    failureWeight: 1,
    instabilityWeight: 0.5
  },
  BALANCED: {
    starvationWeight: 0.5,
    latenessWeight: 1,
    failureWeight: 2,
    instabilityWeight: 1
  },
  THROUGHPUT: {
    starvationWeight: 0.1,
    latenessWeight: 1.5,
    failureWeight: 3,
    instabilityWeight: 2
  }
};

// src/engine/metrics.ts
function computeMetrics(state) {
  let usedCPU = 0;
  let usedRAM = 0;
  for (const task of state.tasks) {
    if (task.status === "running") {
      usedCPU += task.execution.cpuCurve.base;
      usedRAM += task.execution.ramCurve.base;
    }
  }
  const cpuPressure = usedCPU / state.resources.totalCPU;
  const ramPressure = usedRAM / state.resources.totalRAM;
  const pressure = Math.max(cpuPressure, ramPressure);
  const queueLength = state.tasks.filter((t) => t.status === "queued").length;
  const failed = state.tasks.filter((t) => t.status === "failed").length;
  const pressurePenalty = Math.min(pressure * 50, 60);
  const queuePenalty = Math.min(queueLength * 3, 25);
  const failurePenalty = Math.min(failed * 5, 40);
  const stabilityIndex = Math.max(
    0,
    Math.round(100 - pressurePenalty - queuePenalty - failurePenalty)
  );
  state.metrics = {
    ...state.metrics,
    cpuPressure,
    ramPressure,
    pressure,
    queueLength,
    completed: state.tasks.filter((t) => t.status === "completed").length,
    failed,
    stabilityIndex
  };
  return state;
}

// src/engine/cost.ts
function computeTaskCost(task, state) {
  const policy = POLICIES[state.policy];
  const now = state.time;
  const pressure = state.metrics.pressure;
  const waitingTime = task.startedAt === void 0 ? now - task.createdAt : 0;
  const starvation = waitingTime * policy.starvationWeight;
  const latenessTime = Math.max(0, now - task.deadline);
  const lateness = latenessTime * policy.latenessWeight;
  const failureRisk = task.failureProbability * pressure * policy.failureWeight;
  const instability = pressure * pressure * policy.instabilityWeight;
  const total = starvation + lateness + failureRisk + instability;
  return {
    starvation,
    lateness,
    failureRisk,
    instability,
    total
  };
}

// src/engine/execution.ts
function sampleUsage(curve, rng) {
  const spread = curve.peak - curve.base;
  const noise = (rng() - 0.5) * 2;
  const usage = curve.base + spread * curve.variance * noise;
  return Math.max(0, usage);
}
function slowdownFactor(pressure) {
  return 1 + pressure * pressure;
}

// src/engine/scheduler.ts
var MAX_PRESSURE = 1.2;
function phaseFailureMultiplier(phase) {
  return phase === "io" ? 1.6 : 1;
}
function schedule(state, dt, rng) {
  const now = state.time;
  for (const t of state.tasks) {
    if (t.status === "queued" && t.maxQueueTime !== void 0 && now - t.createdAt > t.maxQueueTime && state.metrics.pressure > 1) {
      t.status = "failed";
      t.failureType = "starvation";
      t.failureReason = "Starvation: task waited too long in queue under pressure";
    }
  }
  const queued = state.tasks.filter((t) => t.status === "queued");
  if (state.metrics.pressure > MAX_PRESSURE && queued.length > 0) {
    const worst = queued.map((t) => ({ t, cost: computeTaskCost(t, state).total })).sort((a, b) => b.cost - a.cost)[0].t;
    worst.status = "failed";
    worst.failureType = "load_shed";
    worst.failureReason = "Load shed: system pressure exceeded safe threshold";
  }
  const queuedWithCost = state.tasks.filter((t) => t.status === "queued").map((t) => ({ t, cost: computeTaskCost(t, state).total }));
  let sortedQueued;
  switch (state.policy) {
    case "THROUGHPUT":
      sortedQueued = queuedWithCost.sort((a, b) => a.cost - b.cost);
      break;
    case "FAIRNESS":
      sortedQueued = queuedWithCost.sort(
        (a, b) => a.t.createdAt - b.t.createdAt
      );
      break;
    case "BALANCED":
    default:
      sortedQueued = queuedWithCost.sort(
        (a, b) => 0.5 * (a.cost - b.cost) + 0.5 * (a.t.createdAt - b.t.createdAt)
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
  const running = state.tasks.filter((t) => t.status === "running");
  const cpuTasks = running.filter((t) => t.phase === "cpu");
  const cpuPerTask = cpuTasks.length > 0 ? state.resources.totalCPU / cpuTasks.length : 0;
  let totalUsedRAM = 0;
  for (const t of running) {
    if (t.currentRAM !== void 0) {
      totalUsedRAM += t.currentRAM;
    }
  }
  state.metrics.ramPressure = totalUsedRAM / state.resources.totalRAM;
  for (const t of running) {
    const cpuSlow = slowdownFactor(state.metrics.cpuPressure);
    if (t.phase === "cpu") {
      t.progress += cpuPerTask / state.resources.totalCPU * (dt / t.execution.meanDuration) / cpuSlow;
    } else {
      const ramSlow = 1 + Math.max(0, state.metrics.ramPressure - 1);
      t.progress += 0.3 * dt / t.execution.meanDuration / ramSlow;
    }
    if (t.deadline !== void 0 && t.startedAt !== void 0) {
      const effectiveDeadline = t.deadline * Math.max(1, state.metrics.pressure);
      if (now - t.startedAt > effectiveDeadline && state.metrics.pressure > 1) {
        t.status = "failed";
        t.failureType = "timeout";
        t.failureReason = "Deadline exceeded under sustained pressure";
        continue;
      }
    }
    const runTime = t.startedAt !== void 0 ? now - t.startedAt : 0;
    const fatigueMultiplier = 1 + Math.min(runTime / 10, 1);
    const lambda = t.failureProbability * phaseFailureMultiplier(t.phase) * fatigueMultiplier * state.metrics.pressure;
    const perTickRisk = 1 - Math.exp(-lambda * dt);
    if (rng() < perTickRisk) {
      t.status = "failed";
      t.failureType = "pressure";
      t.failureReason = `Execution failure (\u03BB=${lambda.toFixed(3)})`;
      continue;
    }
    if (t.progress >= 1) {
      t.status = "completed";
    }
    if (rng() < 0.15) {
      t.phase = t.phase === "cpu" ? "io" : "cpu";
    }
  }
  return state;
}

// src/engine/tick.ts
function tick(state, dt, rng) {
  let next = { ...state, time: state.time + dt };
  next = computeMetrics(next);
  next = schedule(next, dt, rng);
  next = computeMetrics(next);
  return next;
}
export {
  POLICIES,
  tick
};
//# sourceMappingURL=index.js.map