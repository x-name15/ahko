/**
 * Event payloads emitted across task and scheduler lifecycles.
 */
export interface IAhkoEventMap {
  /** Emitted when a task acquires a concurrency slot and begins execution */
  "task:start": {
    taskId: string;
    attempt: number;
  };

  /** Emitted when a task completes execution successfully */
  "task:complete": {
    taskId: string;
    attempt: number;
    durationMs: number;
    result: unknown;
  };

  /** Emitted when a task execution attempt fails */
  "task:fail": {
    taskId: string;
    attempt: number;
    error: unknown;
    willRetry: boolean;
  };

  /** Emitted when a task is cancelled */
  "task:cancel": {
    taskId: string;
    reason?: unknown;
  };

  /** Emitted when a task execution exceeds its configured timeoutMs */
  "task:timeout": {
    taskId: string;
    timeoutMs?: number;
  };

  /** Emitted when the scheduler becomes completely idle (no active or pending tasks) */
  idle: {
    timestamp: number;
  };
}

/**
 * Union of all valid event names emitted by the Ahko scheduler.
 */
export type TAhkoEventName = keyof IAhkoEventMap;

/**
 * Event handler callback signature for a specific Ahko event.
 */
export type TAhkoEventHandler<K extends TAhkoEventName> = (
  payload: IAhkoEventMap[K]
) => void | Promise<void>;

/**
 * Function invoked to unsubscribe a previously registered event listener.
 */
export type TAhkoUnsubscribe = () => void;
