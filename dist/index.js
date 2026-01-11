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
  const usedCPU = state.workers.reduce((a, w) => a + w.usedCPU, 0);
  const usedRAM = state.workers.reduce((a, w) => a + w.usedRAM, 0);
  const cpuPressure = usedCPU / state.resources.totalCPU;
  const ramPressure = usedRAM / state.resources.totalRAM;
  return {
    ...state,
    metrics: {
      queueLength: state.tasks.filter((t) => t.status === "queued").length,
      cpuPressure,
      ramPressure,
      pressure: Math.max(cpuPressure, ramPressure),
      completed: state.tasks.filter((t) => t.status === "completed").length,
      failed: state.tasks.filter((t) => t.status === "failed").length
    }
  };
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
  return rng() < curve.variance ? curve.peak : curve.base;
}
function slowdownFactor(pressure) {
  return 1 + pressure * pressure;
}

// src/engine/scheduler.ts
var MAX_PRESSURE = 1.2;
function schedule(state, dt, rng) {
  const now = state.time;
  const queued = state.tasks.filter((t) => t.status === "queued");
  if (state.metrics.pressure > MAX_PRESSURE && queued.length > 0) {
    const worst = queued.map((t) => ({ t, cost: computeTaskCost(t, state).total })).sort((a, b) => b.cost - a.cost)[0].t;
    worst.status = "failed";
  }
  const sortedQueued = queued.map((t) => ({ t, cost: computeTaskCost(t, state).total })).sort((a, b) => a.cost - b.cost);
  for (const { t } of sortedQueued) {
    const cpu = sampleUsage(t.execution.cpuCurve, rng);
    const ram = sampleUsage(t.execution.ramCurve, rng);
    if (state.metrics.cpuPressure + cpu / state.resources.totalCPU > 1 || state.metrics.ramPressure + ram / state.resources.totalRAM > 1) {
      continue;
    }
    t.status = "running";
    t.startedAt = now;
    t.expectedEndAt = now + t.execution.meanDuration;
  }
  const running = state.tasks.filter((t) => t.status === "running");
  const cpuTasks = running.filter((t) => t.phase === "cpu");
  const cpuPerTask = cpuTasks.length > 0 ? state.resources.totalCPU / cpuTasks.length : 0;
  for (const t of running) {
    const slow = slowdownFactor(state.metrics.pressure);
    if (t.phase === "cpu") {
      t.progress += cpuPerTask / state.resources.totalCPU * (dt / t.execution.meanDuration) / slow;
    } else {
      t.progress += 0.3 * (dt / t.execution.meanDuration);
    }
    if (rng() < t.failureProbability * state.metrics.pressure) {
      t.status = "failed";
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