/**
 * Telemetry snapshot of the Ahko scheduler.
 */
export interface IAhkoStats {
  /** Number of tasks currently executing in a concurrency slot */
  activeTasks: number;

  /** Number of tasks waiting in queue or in delay phase */
  pendingTasks: number;

  /** Cumulative count of successfully completed tasks */
  completedTasks: number;

  /** Cumulative count of failed tasks */
  failedTasks: number;

  /** Cumulative count of cancelled tasks */
  cancelledTasks: number;

  /** Cumulative count of timed out tasks */
  timedOutTasks: number;

  /** Maximum concurrent execution capacity */
  capacity: number;
}
