/**
 * Fundamental scheduling strategies supported by the Ahko scheduler.
 */
export enum EScheduleStrategy {
  /** Execute as soon as a concurrency slot is available */
  IMMEDIATE = "immediate",
  /** Delay execution for a designated duration before queuing */
  DELAY = "delay",
}

/**
 * Union type representing valid scheduling strategy identifiers.
 */
export type TScheduleStrategy = EScheduleStrategy | "immediate" | "delay";
