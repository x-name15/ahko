import { AhkoCancellationError } from "../errors/cancellation.error.js";
import type { ITaskContext } from "../models/context.model.js";
import { ETaskState } from "../models/state.model.js";
import type { ITask } from "../models/task.model.js";

let taskIdCounter = 0;

/**
 * Internal task lifecycle manager responsible for execution, state transitions,
 * AbortSignal coordination, and deterministic resource cleanup.
 *
 * @template T - The return type produced by the underlying task.
 */
export class TaskRunner<T> {
  /** Unique task identifier */
  public readonly taskId: string;

  /** Current lifecycle state */
  private _state: ETaskState = ETaskState.PENDING;

  /** Internal AbortController whose signal is passed to the task context */
  private readonly abortController: AbortController;

  /** The user task function to execute */
  private readonly task: ITask<T>;

  /** User-supplied AbortSignal for external cancellation */
  private readonly externalSignal?: AbortSignal;

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

  /**
   * Creates a new TaskRunner instance.
   *
   * @param task - The asynchronous work unit to run.
   * @param externalSignal - Optional external AbortSignal to propagate.
   */
  constructor(task: ITask<T>, externalSignal?: AbortSignal) {
    this.taskId = `task_${Date.now().toString(36)}_${(++taskIdCounter).toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    this.task = task;
    this.externalSignal = externalSignal;
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
    this.resolvePromise(value);
  }

  /**
   * Rejects the deferred promise.
   *
   * @param reason - Reason to reject with.
   */
  public reject(reason: unknown): void {
    this.rejectPromise(reason);
  }

  /**
   * Executes the task within an allocated concurrency slot.
   *
   * @returns A promise resolving to the task result or rejecting on failure/cancellation.
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

    try {
      const result = await this.task(context);
      this._state = ETaskState.COMPLETED;
      this.cleanup();
      return result;
    } catch (error) {
      this.cleanup();

      const isCancelled =
        (this._state as ETaskState) === ETaskState.CANCELLED ||
        this.abortController.signal.aborted;

      if (isCancelled) {
        this._state = ETaskState.CANCELLED;
        throw new AhkoCancellationError("Task was cancelled during execution", {
          cause: error instanceof Error ? error : undefined,
        });
      }

      this._state = ETaskState.FAILED;
      throw error;
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
    if (this.externalSignal && this.abortListener) {
      this.externalSignal.removeEventListener("abort", this.abortListener);
    }
  }
}
