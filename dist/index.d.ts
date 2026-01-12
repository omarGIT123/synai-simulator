type TaskStatus = "queued" | "running" | "completed" | "failed";
type TaskPhase = "cpu" | "io";
type ResourceCurve = {
    base: number;
    peak: number;
    variance: number;
};
type FailureType = "pressure" | "timeout" | "starvation" | "load_shed" | "random";
type ExecutionProfile = {
    meanDuration: number;
    cpuCurve: ResourceCurve;
    ramCurve: ResourceCurve;
};
type Task = {
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
    finishedAt?: number;
};

type Worker = {
    id: string;
    maxCPU: number;
    maxRAM: number;
    usedCPU: number;
    usedRAM: number;
    activeTaskIds: string[];
    online: boolean;
};

type SystemResources = {
    totalCPU: number;
    totalRAM: number;
};

type SystemMetrics = {
    queueLength: number;
    cpuPressure: number;
    ramPressure: number;
    pressure: number;
    completed: number;
    failed: number;
    stabilityIndex: number;
};

type PolicyName = "FAIRNESS" | "BALANCED" | "THROUGHPUT";
type Policy = {
    starvationWeight: number;
    latenessWeight: number;
    failureWeight: number;
    instabilityWeight: number;
};
declare const POLICIES: Record<PolicyName, Policy>;

interface SystemConfig {
    maxConcurrentTasks: number;
}
type SystemState = {
    time: number;
    policy: PolicyName;
    resources: SystemResources;
    config: SystemConfig;
    tasks: Task[];
    workers: Worker[];
    metrics: SystemMetrics;
};

type RNG = () => number;
declare function createRNG(seed: number): RNG;

declare function tick(state: SystemState, dt: number, rng: RNG): SystemState;

declare function computeMetrics(state: SystemState): SystemState;

export { type ExecutionProfile, type FailureType, POLICIES, type Policy, type PolicyName, type RNG, type ResourceCurve, type SystemConfig, type SystemMetrics, type SystemResources, type SystemState, type Task, type TaskPhase, type TaskStatus, computeMetrics, createRNG, tick };
