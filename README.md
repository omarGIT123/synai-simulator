# synai-simulator

> Experimental prototype — open to discussion and collaboration.

## Purpose

**synai-simulator** is a simulation engine for modeling and analyzing the behavior of distributed task scheduling systems under resource constraints and varying policies.

It is designed to help researchers, engineers, and system architects understand how different scheduling strategies, resource bottlenecks, and failure modes affect:

- system stability
- throughput
- fairness

The simulator provides a controlled environment to experiment with real-world system dynamics rather than idealized steady-state behavior.

---

## What It Simulates

- **Task Lifecycle**
  Tasks are created, queued, scheduled, executed, and eventually completed or failed.

- **Resource Management**
  Simulates CPU and RAM allocation, contention, and pressure.

- **Worker Model**
  Workers have fixed resource limits and can execute multiple tasks concurrently.

- **Scheduling Policies**
  Multiple policies determine which tasks are admitted and prioritized.

- **Failure Modes**
  Realistic failure scenarios caused by pressure, timeouts, starvation, or load shedding.

- **System Metrics**
  Continuous measurement of pressure, queue length, failures, throughput, and stability.

---

## How It Works

1. **Initialization**
   The system is initialized with:

   - total CPU and RAM
   - a set of workers
   - a scheduling policy

2. **Task Admission**
   Tasks enter the system with:

   - resource usage profiles
   - deadlines
   - failure probabilities

3. **Tick Loop**
   The simulation advances in discrete time steps (“ticks”).

   Each tick performs:

   - Metrics computation
   - Scheduling decisions
   - Task execution progress
   - Failure evaluation
   - Metrics update

4. **Visualization (Demo)**
   A browser-based demo renders pressure, task states, and metrics in real time.

---

## Why Use synai-simulator?

- **Research**
  Explore the behavior of scheduling strategies under stress.

- **System Design**
  Prototype and validate new schedulers or resource models.

- **Education**
  Demonstrate distributed system concepts and failure cascades.

- **Analysis**
  Quantify stability, fairness, and throughput trade-offs.

---

## Technical Details

### Core Concepts

- **SystemState**
  Full snapshot of the system:

  - time
  - resources
  - workers
  - tasks
  - metrics
  - active policy

- **Task**
  A unit of work with:

  - resource usage curves
  - deadline
  - progress
  - failure risk

- **Worker**
  A resource-constrained execution unit.

- **Policy**
  A set of weights guiding scheduling decisions.

---

### Scheduling Policies

- **FAIRNESS**

  - Prioritizes older tasks
  - Penalizes starvation

- **BALANCED**

  - Mixes task age and execution cost

- **THROUGHPUT**

  - Favors cheaper tasks to maximize completions

---

### Failure Modes

- **Starvation**
  A queued task fails if it waits too long under high pressure.

- **Timeout**
  A task fails if it exceeds its deadline while the system is under pressure.

- **Load Shedding**
  When pressure exceeds a threshold, the most expensive queued task is dropped.

- **Pressure-Induced Failure**
  Running tasks may fail probabilistically based on pressure and task risk.

- **Random Failure**
  Simulates unpredictable external failures.

---

## System Metrics

### Pressure

```
Pressure = max(CPU_Pressure, RAM_Pressure)
```

Where:

```
CPU_Pressure = CPU_Used / CPU_Total
RAM_Pressure = RAM_Used / RAM_Total
```

---

### Task Cost

Each task is assigned a cost used by the scheduler:

```
Total_Cost =
  Starvation_Cost +
  Lateness_Cost +
  Failure_Risk_Cost +
  Instability_Cost
```

Where:

```
Starvation_Cost = Waiting_Time * starvationWeight

Lateness_Cost = max(0, Current_Time - Deadline) * latenessWeight

Failure_Risk_Cost =
  failureProbability * Pressure * failureWeight

Instability_Cost =
  Pressure^2 * instabilityWeight
```

---

### Stability Index

A high-level health indicator for the system:

```
Stability_Index =
  100
  - min(Pressure * 50, 60)
  - min(Queue_Length * 3, 25)
  - min(Failed_Tasks * 5, 40)
```

The result is clamped to the range **[0, 100]**.

---

### Slowdown Factor

As pressure increases, task execution slows down:

```
Slowdown = 1 + Pressure^2
```

---

### Resource Usage Sampling

Task resource usage fluctuates over time:

```
Usage =
  Base +
  (Peak - Base) * Variance * Noise
```

Where:

```
Noise is a random value in the range [-1, 1]
```

---

### Pressure-Induced Failure Probability

For running tasks, the per-tick failure probability is:

```
Lambda =
  failureProbability
  * phaseMultiplier
  * fatigueMultiplier
  * Pressure
```

```
Per_Tick_Risk = 1 - exp(-Lambda * dt)
```

---

## Installation

```bash
npm install synai-simulator
```

---

## Usage

### As a Library

```ts
import { tick, SystemState, createRNG } from "synai-simulator";

// Initialize system state
let state: SystemState = {
  // resources, workers, tasks, metrics, policy, etc.
};

const rng = createRNG(42);

// Advance simulation by one tick (e.g. 0.1 seconds)
state = tick(state, 0.1, rng);
```

---

### Demo

A browser-based demo is included.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Build the project:

   ```bash
   npm run build
   ```

3. Open:

   ```
   demo/index.html
   ```

You can:

- add tasks
- change policies
- observe pressure, failures, and stability in real time

---

## Project Structure

```
src/
  core/      Core types and state definitions
  engine/   Scheduling, execution, metrics, and failure logic
  worker/   Web Worker simulation loop
demo/       Browser-based visualization
```

---

## Contributing

Contributions, bug reports, and feature requests are welcome.
Please open an issue or submit a pull request.

---

## License

Apache License Version 2.0, January 2004
