/**
 * Named priority level or explicit numeric priority for scheduled tasks.
 * Higher numeric values indicate higher execution priority.
 */
export type TTaskPriority = "high" | "normal" | "low" | number;

/** Default priority weight mappings */
export const TASK_PRIORITY_WEIGHTS = {
  high: 10,
  normal: 0,
  low: -10,
} as const;

/**
 * Resolves a task priority into a normalized numeric weight.
 *
 * @param priority - Named or numeric priority.
 * @returns Numeric weight (default 0 for normal).
 */
export function resolvePriorityWeight(priority?: TTaskPriority): number {
  if (priority === undefined) {
    return TASK_PRIORITY_WEIGHTS.normal;
  }
  if (typeof priority === "number") {
    return Number.isFinite(priority) ? priority : TASK_PRIORITY_WEIGHTS.normal;
  }
  if (priority === "high") {
    return TASK_PRIORITY_WEIGHTS.high;
  }
  if (priority === "low") {
    return TASK_PRIORITY_WEIGHTS.low;
  }
  return TASK_PRIORITY_WEIGHTS.normal;
}
