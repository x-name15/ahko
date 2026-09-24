import type { IScheduleOptions } from "./options.model.js";

/**
 * Common configuration options for batch processing operations (e.g. `ahko.map`, `ahko.each`).
 */
export interface IBatchOptions extends Omit<IScheduleOptions, "strategy"> {
  /**
   * Optional localized concurrency cap specifically for this batch operation.
   * If omitted, uses the scheduler's global concurrency limit.
   */
  concurrency?: number;

  /**
   * Whether to abort remaining items in the batch as soon as an item fails.
   * If `true`, unstarted items are cancelled and the batch promise rejects immediately with the error.
   * If `false`, all items run and errors are thrown/propagated once all items settle.
   * @default false
   */
  stopOnError?: boolean;
}

/**
 * Options specifically for `ahko.map()` collection operations.
 */
export type IBatchMapOptions<_TItem = unknown, _TResult = unknown> = IBatchOptions;
