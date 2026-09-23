import type { ICircuitBreakerOptions } from "./circuit-breaker.model.js";
import type { IAhkoOptions, IScheduleOptions } from "./options.model.js";
import type { TTaskPriority } from "./priority.model.js";

/**
 * Pre-configured profile containing scheduler defaults and task scheduling policies.
 */
export interface IAhkoProfileConfig extends IAhkoOptions, Partial<IScheduleOptions> {
  /** Optional default task priority for tasks scheduled under this profile */
  priority?: TTaskPriority;

  /** Optional circuit breaker policy for the scheduler */
  circuitBreaker?: ICircuitBreakerOptions;
}

/**
 * Structure of `config.ahko.json` declarative configuration file.
 */
export interface IAhkoFileConfig {
  /** Optional JSON schema URL */
  $schema?: string;

  /** Default profile applied when no named profile is requested */
  default?: IAhkoProfileConfig;

  /** Named profiles for distinct workloads (e.g. "api", "background", "critical") */
  profiles?: Record<string, IAhkoProfileConfig>;
}
