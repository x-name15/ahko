import type { ITaskContext } from "./context.model.js";

/**
 * Represents an asynchronous or synchronous unit of work managed by Ahko.
 *
 * @template T - The return type produced by the task.
 * @param context - The execution context including cancellation signal and task ID.
 * @returns The resolved value or a Promise resolving to the value.
 */
export type ITask<T> = (context: ITaskContext) => Promise<T> | T;
