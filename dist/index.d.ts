type TaskStatus = "queued" | "running" | "completed" | "failed";
type TaskPhase = "cpu" | "io";
type ResourceCurve = {
    base: number;
    peak: number;
    variance: number;
};
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
    failureProbability: number;
    status: TaskStatus;
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
};

type PolicyName = "FAIRNESS" | "BALANCED" | "THROUGHPUT";
type Policy = {
    starvationWeight: number;
    latenessWeight: number;
    failureWeight: number;
    instabilityWeight: number;
};
declare const POLICIES: Record<PolicyName, Policy>;

type SystemState = {
    time: number;
    policy: PolicyName;
    resources: SystemResources;
    tasks: Task[];
    workers: Worker[];
    metrics: SystemMetrics;
};

type RNG = () => number;

declare function tick(state: SystemState, dt: number, rng: RNG): SystemState;

export { type ExecutionProfile, POLICIES, type Policy, type PolicyName, type ResourceCurve, type SystemMetrics, type SystemState, type Task, type TaskPhase, type TaskStatus, type Worker, tick };
