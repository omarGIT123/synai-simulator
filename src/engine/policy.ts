export type PolicyName = "FAIRNESS" | "BALANCED" | "THROUGHPUT";

export type Policy = {
  starvationWeight: number;
  latenessWeight: number;
  failureWeight: number;
  instabilityWeight: number;
};

export const POLICIES: Record<PolicyName, Policy> = {
  FAIRNESS: {
    starvationWeight: 2,
    latenessWeight: 0.8,
    failureWeight: 1,
    instabilityWeight: 0.5,
  },
  BALANCED: {
    starvationWeight: 0.5,
    latenessWeight: 1,
    failureWeight: 2,
    instabilityWeight: 1,
  },
  THROUGHPUT: {
    starvationWeight: 0.1,
    latenessWeight: 1.5,
    failureWeight: 3,
    instabilityWeight: 2,
  },
};
