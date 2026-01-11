export type Worker = {
  id: string;

  maxCPU: number;
  maxRAM: number;

  usedCPU: number;
  usedRAM: number;

  activeTaskIds: string[];

  online: boolean;
};
