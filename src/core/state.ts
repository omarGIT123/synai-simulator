import { Task } from "./task";
import { Worker } from "./worker";
import { SystemResources } from "./resources";
import { SystemMetrics } from "./metrics";
import { PolicyName } from "../engine/policy";
export interface SystemConfig {
  maxConcurrentTasks: number;
}
export type SystemState = {
  time: number;

  policy: PolicyName;

  resources: SystemResources;
  config: SystemConfig;

  tasks: Task[];
  workers: Worker[];

  metrics: SystemMetrics;
};
