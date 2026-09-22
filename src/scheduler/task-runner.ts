import { AhkoCancellationError } from "../errors/cancellation.error.js";
import { AhkoTimeoutError } from "../errors/timeout.error.js";
import type { ITaskContext } from "../models/context.model.js";
import type { IRetryOptions } from "../models/retry.model.js";
import { ETaskState } from "../models/state.model.js";
import type { ITask } from "../models/task.model.js";

let taskIdCounter = 0;

/**
 * Internal task lifecycle manager responsible for execution, state transitions,
 * AbortSignal coordination, timeout enforcement, and deterministic resource cleanup.
 *
 * @template T - The return type produced by the underlying task.
 */
export class TaskRunner<T> {
  /** Unique task identifier */
  public readonly taskId: string;

  /** Current lifecycle state */
  private _state: ETaskState = ETaskState.PENDING;

  /** Internal AbortController whose signal is passed to the task context */
  private abortController: AbortController;

  /** The user task function to execute */
  private readonly task: ITask<T>;

  /** User-supplied AbortSignal for external cancellation */
  public readonly externalSignal?: AbortSignal;

  /** Maximum execution duration allowed in milliseconds */
  public readonly timeoutMs?: number;

  /** Active timeout timer identifier */
  private timeoutTimerId?: ReturnType<typeof setTimeout>;

  /** Abort event listener reference for clean detachment */
  private readonly abortListener?: () => void;

  /** Promise resolve handler */
  private resolvePromise!: (value: T | PromiseLike<T>) => void;

  /** Promise reject handler */
  private rejectPromise!: (reason?: unknown) => void;

  /** Deferred promise exposed to the caller */
  public readonly promise: Promise<T>;

  /** Callback invoked when runner is cancelled while pending */
  public onCancel?: (runner: TaskRunner<T>) => void;

  /** Current execution attempt count (1-indexed) */
  public attempt = 1;

  /**
   * Creates a new TaskRunner instance.
   *
   * @param task - The asynchronous work unit to run.
   * @param externalSignal - Optional external AbortSignal to propagate.
   * @param timeoutMs - Optional maximum execution time in milliseconds.
   */
  constructor(task: ITask<T>, externalSignal?: AbortSignal, timeoutMs?: number) {
    this.taskId = `task_${Date.now().toString(36)}_${(++taskIdCounter).toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    this.task = task;
    this.externalSignal = externalSignal;
    this.timeoutMs = timeoutMs;
    this.abortController = new AbortController();

    this.promise = new Promise<T>((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
    });

    if (this.externalSignal) {
      if (this.externalSignal.aborted) {
        this._state = ETaskState.CANCELLED;
        const reason = this.externalSignal.reason;
        const cancelError = new AhkoCancellationError(
          typeof reason === "string" ? reason : "Task was cancelled prior to execution",
          { cause: reason instanceof Error ? reason : undefined }
        );
        this.abortController.abort(cancelError);
        this.rejectPromise(cancelError);
      } else {
        this.abortListener = () => {
          this.handleExternalAbort();
        };
        this.externalSignal.addEventListener("abort", this.abortListener, { once: true });
      }
    }
  }

  /**
   * Gets the current lifecycle state of the task.
   */
  public get state(): ETaskState {
    return this._state;
  }

  /**
   * Resolves the deferred promise.
   *
   * @param value - Value to resolve with.
   */
  public resolve(value: T): void {
    this.cleanup();
    this.resolvePromise(value);
  }

  /**
   * Rejects the deferred promise.
   *
   * @param reason - Reason to reject with.
   */
  public reject(reason: unknown): void {
    this.cleanup();
    this.rejectPromise(reason);
  }

  /**
   * Evaluates if the task should be retried following an execution failure or timeout.
   *
   * @param error - The error encountered during the attempt.
   * @param retryOptions - Configured retry policy.
   * @returns A promise resolving to true if retry should proceed, false otherwise.
   */
  public async canRetry(error: unknown, retryOptions?: IRetryOptions): Promise<boolean> {
    if (this._state === ETaskState.CANCELLED || (this.externalSignal?.aborted ?? false)) {
      return false;
    }

    if (!retryOptions || typeof retryOptions.attempts !== "number") {
      return false;
    }

    if (this.attempt >= retryOptions.attempts) {
      return false;
    }

    if (typeof retryOptions.shouldRetry === "function") {
      try {
        const allowed = await retryOptions.shouldRetry(error, this.attempt);
        if (!allowed) {
          return false;
        }
      } catch {
        return false;
      }
    }

    this.attempt++;
    this._state = ETaskState.PENDING;
    this.abortController = new AbortController();
    return true;
  }

  /**
   * Executes the task within an allocated concurrency slot.
   *
   * @returns A promise resolving to the task result or rejecting on failure/cancellation/timeout.
   */
  public async run(): Promise<T> {
    if (this._state === ETaskState.CANCELLED) {
      throw new AhkoCancellationError("Task was cancelled prior to execution");
    }

    this._state = ETaskState.RUNNING;

    const context: ITaskContext = {
      signal: this.abortController.signal,
      taskId: this.taskId,
    };

    let abortListener: (() => void) | undefined;

    const abortPromise = new Promise<never>((_, reject) => {
      abortListener = () => {
        if (this._state === ETaskState.TIMED_OUT) {
          reject(
            new AhkoTimeoutError(
              `Task execution timed out after ${this.timeoutMs}ms`,
              { timeoutMs: this.timeoutMs }
            )
          );
        } else {
          const reason = this.abortController.signal.reason;
          reject(
            new AhkoCancellationError("Task was cancelled during execution", {
              cause: reason instanceof Error ? reason : undefined,
            })
          );
        }
      };
      this.abortController.signal.addEventListener("abort", abortListener, { once: true });
    });

    let timeoutPromise: Promise<never> | undefined;
    if (this.timeoutMs !== undefined) {
      timeoutPromise = new Promise<never>((_, reject) => {
        this.timeoutTimerId = setTimeout(() => {
          if (this._state !== ETaskState.RUNNING) {
            return;
          }
          this._state = ETaskState.TIMED_OUT;
          const timeoutError = new AhkoTimeoutError(
            `Task execution timed out after ${this.timeoutMs}ms`,
            { timeoutMs: this.timeoutMs }
          );
          this.abortController.abort(timeoutError);
          reject(timeoutError);
        }, this.timeoutMs);
      });
    }

    let taskExecutionPromise: Promise<T>;
    try {
      taskExecutionPromise = Promise.resolve(this.task(context));
    } catch (syncError) {
      taskExecutionPromise = Promise.reject(syncError);
    }

    // Suppress unhandled rejection in background if task finishes or fails after timeout/cancellation
    taskExecutionPromise.catch(() => {});

    const racePromises: Array<Promise<T | never>> = [
      taskExecutionPromise,
      abortPromise,
    ];
    if (timeoutPromise) {
      racePromises.push(timeoutPromise);
    }

    try {
      const result = await Promise.race(racePromises);
      this.clearTimeoutTimer();
      if (abortListener) {
        this.abortController.signal.removeEventListener("abort", abortListener);
      }

      if ((this._state as ETaskState) === ETaskState.TIMED_OUT) {
        throw new AhkoTimeoutError(
          `Task execution timed out after ${this.timeoutMs}ms`,
          { timeoutMs: this.timeoutMs }
        );
      }

      if ((this._state as ETaskState) === ETaskState.CANCELLED) {
        throw new AhkoCancellationError("Task was cancelled during execution");
      }

      this._state = ETaskState.COMPLETED;
      return result;
    } catch (error) {
      this.clearTimeoutTimer();
      if (abortListener) {
        this.abortController.signal.removeEventListener("abort", abortListener);
      }

      if ((this._state as ETaskState) === ETaskState.TIMED_OUT || error instanceof AhkoTimeoutError) {
        this._state = ETaskState.TIMED_OUT;
        if (error instanceof AhkoTimeoutError) {
          throw error;
        }
        throw new AhkoTimeoutError(
          `Task execution timed out after ${this.timeoutMs}ms`,
          {
            timeoutMs: this.timeoutMs,
            cause: error instanceof Error ? error : undefined,
          }
        );
      }

      const isCancelled =
        (this._state as ETaskState) === ETaskState.CANCELLED ||
        this.abortController.signal.aborted ||
        (this.externalSignal?.aborted ?? false);

      if (isCancelled) {
        this._state = ETaskState.CANCELLED;
        if (error instanceof AhkoCancellationError) {
          throw error;
        }
        throw new AhkoCancellationError("Task was cancelled during execution", {
          cause: error instanceof Error ? error : undefined,
        });
      }

      this._state = ETaskState.FAILED;
      throw error;
    }
  }

  /**
   * Clears the active timeout timer.
   */
  private clearTimeoutTimer(): void {
    if (this.timeoutTimerId !== undefined) {
      clearTimeout(this.timeoutTimerId);
      this.timeoutTimerId = undefined;
    }
  }

  /**
   * Cancels the task, aborting pending or running execution.
   *
   * @param reason - Optional cancellation reason.
   */
  public cancel(reason?: unknown): void {
    if (
      this._state === ETaskState.COMPLETED ||
      this._state === ETaskState.FAILED ||
      this._state === ETaskState.CANCELLED ||
      this._state === ETaskState.TIMED_OUT
    ) {
      return;
    }

    const wasPending = this._state === ETaskState.PENDING;
    this._state = ETaskState.CANCELLED;
    this.clearTimeoutTimer();
    this.abortController.abort(reason);
    this.cleanup();

    if (wasPending) {
      const cancellationError = new AhkoCancellationError(
        typeof reason === "string" ? reason : "Task was cancelled prior to execution",
        { cause: reason instanceof Error ? reason : undefined }
      );
      this.rejectPromise(cancellationError);
      this.onCancel?.(this);
    }
  }

  /**
   * Handles external AbortSignal trigger.
   */
  private handleExternalAbort(): void {
    this.cancel(this.externalSignal?.reason);
  }

  /**
   * Detaches event listeners from external signal to guarantee memory safety.
   */
  public cleanup(): void {
    this.clearTimeoutTimer();
    if (this.externalSignal && this.abortListener) {
      this.externalSignal.removeEventListener("abort", this.abortListener);
    }
  }
}
