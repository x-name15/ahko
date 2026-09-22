/**
 * Execution context supplied to every scheduled Ahko task.
 */
export interface ITaskContext {
  /**
   * Cooperative cancellation signal for the task.
   * Listeners should be attached to this signal to gracefully abort asynchronous operations.
   */
  readonly signal: AbortSignal;

  /**
   * Unique identifier assigned to the task by the scheduler.
   */
  readonly taskId: string;
}
