import { Task } from "./task";
import { Worker } from "./worker";
import { SystemResources } from "./resources";
import { SystemMetrics } from "./metrics";
import { PolicyName } from "../engine/policy";

export type SystemState = {
  time: number;

  policy: PolicyName;

  resources: SystemResources;

  tasks: Task[];
  workers: Worker[];

  metrics: SystemMetrics;
};
