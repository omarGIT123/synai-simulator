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

// src/engine/random.ts
function createRNG(seed) {
  let t = seed >>> 0;
  return function() {
    t += 1831565813;
    let r = Math.imul(t ^ t >>> 15, 1 | t);
    r ^= r + Math.imul(r ^ r >>> 7, 61 | r);
    return ((r ^ r >>> 14) >>> 0) / 4294967296;
  };
}

// src/engine/metrics.ts
function computeMetrics(state2) {
  let usedCPU = 0;
  let usedRAM = 0;
  for (const task of state2.tasks) {
    if (task.status === "running") {
      usedCPU += task.execution.cpuCurve.base;
      usedRAM += task.execution.ramCurve.base;
    }
  }
  const cpuPressure = usedCPU / state2.resources.totalCPU;
  const ramPressure = usedRAM / state2.resources.totalRAM;
  const pressure = Math.max(cpuPressure, ramPressure);
  const queueLength = state2.tasks.filter((t) => t.status === "queued").length;
  const failed = state2.tasks.filter((t) => t.status === "failed").length;
  const pressurePenalty = Math.min(pressure * 50, 60);
  const queuePenalty = Math.min(queueLength * 3, 25);
  const failurePenalty = Math.min(failed * 5, 40);
  const stabilityIndex = Math.max(
    0,
    Math.round(100 - pressurePenalty - queuePenalty - failurePenalty)
  );
  state2.metrics = {
    ...state2.metrics,
    cpuPressure,
    ramPressure,
    pressure,
    queueLength,
    completed: state2.tasks.filter((t) => t.status === "completed").length,
    failed,
    stabilityIndex
  };
  return state2;
}

// src/engine/cost.ts
function computeTaskCost(task, state2) {
  const policy = POLICIES[state2.policy];
  const now = state2.time;
  const pressure = state2.metrics.pressure;
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
function sampleUsage(curve, rng2) {
  const spread = curve.peak - curve.base;
  const noise = (rng2() - 0.5) * 2;
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
function schedule(state2, dt, rng2) {
  const now = state2.time;
  for (const t of state2.tasks) {
    if (t.status === "queued" && t.maxQueueTime !== void 0 && now - t.createdAt > t.maxQueueTime && state2.metrics.pressure > 1) {
      t.status = "failed";
      t.failureType = "starvation";
      t.failureReason = "Starvation: task waited too long in queue under pressure";
      t.finishedAt = now;
    }
  }
  const queued = state2.tasks.filter((t) => t.status === "queued");
  if (state2.metrics.pressure > MAX_PRESSURE && queued.length > 0) {
    const worst = queued.map((t) => ({ t, cost: computeTaskCost(t, state2).total })).sort((a, b) => b.cost - a.cost)[0].t;
    worst.status = "failed";
    worst.failureType = "load_shed";
    worst.failureReason = "Load shed: system pressure exceeded safe threshold";
    worst.finishedAt = now;
  }
  const queuedWithCost = state2.tasks.filter((t) => t.status === "queued").map((t) => ({ t, cost: computeTaskCost(t, state2).total }));
  let sortedQueued;
  switch (state2.policy) {
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
  let runningCount = state2.tasks.filter((t) => t.status === "running").length;
  for (const { t } of sortedQueued) {
    if (runningCount >= state2.config.maxConcurrentTasks) break;
    t.status = "running";
    t.startedAt = now;
    t.expectedEndAt = now + t.execution.meanDuration;
    t.currentRAM = sampleUsage(t.execution.ramCurve, rng2);
    runningCount++;
  }
  const running = state2.tasks.filter((t) => t.status === "running");
  const cpuTasks = running.filter((t) => t.phase === "cpu");
  const cpuPerTask = cpuTasks.length > 0 ? state2.resources.totalCPU / cpuTasks.length : 0;
  let totalUsedRAM = 0;
  for (const t of running) {
    if (t.currentRAM !== void 0) {
      totalUsedRAM += t.currentRAM;
    }
  }
  state2.metrics.ramPressure = totalUsedRAM / state2.resources.totalRAM;
  for (const t of running) {
    const cpuSlow = slowdownFactor(state2.metrics.cpuPressure);
    if (t.phase === "cpu") {
      t.progress += cpuPerTask / state2.resources.totalCPU * (dt / t.execution.meanDuration) / cpuSlow;
    } else {
      const ramSlow = 1 + Math.max(0, state2.metrics.ramPressure - 1);
      t.progress += 0.3 * dt / t.execution.meanDuration / ramSlow;
    }
    if (t.deadline !== void 0 && t.startedAt !== void 0) {
      const effectiveDeadline = t.deadline * Math.max(1, state2.metrics.pressure);
      if (now - t.startedAt > effectiveDeadline && state2.metrics.pressure > 1) {
        t.status = "failed";
        t.failureType = "timeout";
        t.failureReason = "Deadline exceeded under sustained pressure";
        t.finishedAt = now;
        continue;
      }
    }
    const runTime = t.startedAt !== void 0 ? now - t.startedAt : 0;
    const fatigueMultiplier = 1 + Math.min(runTime / 10, 1);
    const lambda = t.failureProbability * phaseFailureMultiplier(t.phase) * fatigueMultiplier * state2.metrics.pressure;
    const perTickRisk = 1 - Math.exp(-lambda * dt);
    if (rng2() < perTickRisk) {
      t.status = "failed";
      t.failureType = "pressure";
      t.failureReason = `Execution failure (\u03BB=${lambda.toFixed(3)})`;
      t.finishedAt = now;
      continue;
    }
    if (t.progress >= 1) {
      t.status = "completed";
      t.finishedAt = now;
    }
    if (rng2() < 0.15) {
      t.phase = t.phase === "cpu" ? "io" : "cpu";
    }
  }
  return state2;
}

// src/engine/tick.ts
function tick(state2, dt, rng2) {
  let next = { ...state2, time: state2.time + dt };
  next = computeMetrics(next);
  next = schedule(next, dt, rng2);
  next = computeMetrics(next);
  return next;
}

// src/worker/simulator.worker.ts
console.log("\u{1F525} WORKER FILE EXECUTED");
var currentSeed = 1;
var rng = createRNG(currentSeed);
var state = null;
var interval = null;
var TICK_MS = 100;
var sustainedPressureTicks = 0;
var COLLAPSE_PRESSURE = 1.5;
var COLLAPSE_TICKS = 10;
var eventLog = [];
self.onmessage = (event) => {
  const msg = event.data;
  if (state && !["STATE", "INIT"].includes(msg.type)) {
    eventLog.push({
      time: state.time,
      message: msg
    });
  }
  switch (msg.type) {
    case "INIT": {
      state = structuredClone(msg.payload.state);
      initialSnapshot = structuredClone(msg.payload.state);
      currentSeed = msg.payload.seed ?? 1;
      rng = createRNG(currentSeed);
      eventLog = [];
      sustainedPressureTicks = 0;
      post();
      break;
    }
    case "START": {
      if (!state || interval !== null) return;
      interval = setInterval(runTick, TICK_MS);
      break;
    }
    case "PAUSE": {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
      break;
    }
    case "STEP": {
      runTick();
      break;
    }
    case "SET_CONFIG": {
      if (!state) return;
      state.config = {
        ...state.config,
        ...msg.payload
      };
      post();
      break;
    }
    case "ADD_TASK": {
      if (!state) return;
      state.tasks.push({
        ...msg.payload,
        createdAt: state.time
      });
      break;
    }
    case "SET_POLICY": {
      if (!state) return;
      state.policy = msg.payload;
      break;
    }
    case "SET_RESOURCES": {
      if (!state) return;
      state.resources = {
        ...state.resources,
        ...msg.payload
      };
      for (const w of state.workers) {
        w.maxCPU = state.resources.totalCPU;
        w.maxRAM = state.resources.totalRAM;
      }
      post();
      break;
    }
    case "EXPORT_REPLAY": {
      postMessage({
        type: "REPLAY_DATA",
        payload: {
          seed: currentSeed,
          events: eventLog
        }
      });
      break;
    }
    case "REPLAY": {
      if (!initialSnapshot) return;
      state = structuredClone(initialSnapshot);
      rng = createRNG(msg.payload.seed);
      sustainedPressureTicks = 0;
      for (const e of msg.payload.events) {
        applyEvent(e.message);
      }
      post();
      break;
    }
  }
};
function runTick() {
  if (!state) return;
  state = tick(state, TICK_MS / 1e3, rng);
  if (state.metrics.pressure > COLLAPSE_PRESSURE) {
    sustainedPressureTicks++;
  } else {
    sustainedPressureTicks = 0;
  }
  if (state.metrics.stabilityIndex <= 15 || sustainedPressureTicks >= COLLAPSE_TICKS) {
    postMessage({
      type: "COLLAPSE",
      payload: {
        time: state.time,
        stabilityIndex: state.metrics.stabilityIndex,
        pressure: state.metrics.pressure,
        reason: sustainedPressureTicks >= COLLAPSE_TICKS ? "Sustained system pressure" : "System stability degraded beyond recovery"
      }
    });
    clearInterval(interval);
    interval = null;
    return;
  }
  post();
}
function post() {
  postMessage({
    type: "STATE",
    payload: state
  });
}
var initialSnapshot = null;
function applyEvent(msg) {
  switch (msg.type) {
    case "ADD_TASK":
      state?.tasks.push({
        ...msg.payload,
        createdAt: state.time
      });
      break;
    case "SET_POLICY":
      if (state) state.policy = msg.payload;
      break;
    case "SET_RESOURCES":
      if (state) {
        state.resources = {
          ...state.resources,
          ...msg.payload
        };
      }
      break;
    case "START":
      if (!interval) {
        interval = setInterval(runTick, TICK_MS);
      }
      break;
    case "PAUSE":
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      break;
  }
}
export {
  POLICIES,
  computeMetrics,
  createRNG,
  tick
};
//# sourceMappingURL=index.js.map