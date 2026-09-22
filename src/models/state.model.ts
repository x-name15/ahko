/**
 * Represents the discrete lifecycle states of an Ahko task.
 */
export enum ETaskState {
  /** Task has been scheduled and is awaiting execution in queue or timer */
  PENDING = "pending",
  /** Task is currently executing within an allocated concurrency slot */
  RUNNING = "running",
  /** Task successfully finished execution */
  COMPLETED = "completed",
  /** Task execution threw an error or rejected */
  FAILED = "failed",
  /** Task was cancelled via AbortSignal before or during execution */
  CANCELLED = "cancelled",
  /** Task was terminated because its execution exceeded the timeout */
  TIMED_OUT = "timed_out",
}
